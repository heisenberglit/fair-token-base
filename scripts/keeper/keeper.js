import { ethers } from "ethers";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const NETWORK = process.argv[2] || "mainnet";
const RUN_ONCE = process.argv.includes("--once");
const TEST_MODE = process.argv.includes("--test");

// Network-specific intervals (fallback if contract doesn't have PERIOD_INTERVAL)
const INTERVALS = {
  testnet: 60 * 1000,        // 1 minute for testnet
  mainnet: 60 * 60 * 1000,   // 1 hour for mainnet
  test: 60 * 1000,           // 1 minute for test mode
};

// Use env var if set, otherwise use test mode or network default
// This can be updated by reading from contract
let INTERVAL_MS = process.env.TEST_INTERVAL_MS 
  ? parseInt(process.env.TEST_INTERVAL_MS) 
  : (TEST_MODE ? INTERVALS.test : (INTERVALS[NETWORK] || INTERVALS.mainnet));

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  
  // Also write to log file
  const logDir = path.join(__dirname, "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }
  const logFile = path.join(logDir, `keeper-${new Date().toISOString().split("T")[0]}.log`);
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

async function getWallet() {
  const config = getNetworkConfig(NETWORK);
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  
  const key = process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!key) {
    throw new Error("KEEPER_PRIVATE_KEY or PRIVATE_KEY not set in .env");
  }
  
  const pk = key.startsWith("0x") ? key : `0x${key}`;
  return new ethers.Wallet(pk, provider);
}

function getContractAddress() {
  // Check environment variables first (highest priority)
  const vaultAddress = process.env.VAULT_ADDRESS;
  const fairAddress = process.env.FAIR_ADDRESS;
  
  if (vaultAddress) {
    return { address: vaultAddress, type: "vault" };
  }
  if (fairAddress) {
    return { address: fairAddress, type: "fair" };
  }
  
  // Check deployment files
  let envFile;
  if (NETWORK === "mainnet") {
    // Check both .env.mainnet and .env.test (test mode deployments)
    const mainnetPath = path.join(__dirname, "..", "mainnet", ".env.mainnet");
    const testPath = path.join(__dirname, "..", "mainnet", ".env.test");
    
    if (fs.existsSync(testPath)) {
      envFile = testPath;
    } else if (fs.existsSync(mainnetPath)) {
      envFile = mainnetPath;
    } else {
      throw new Error(`Deployment file not found: ${mainnetPath} or ${testPath}`);
    }
  } else {
    envFile = path.join(__dirname, "..", NETWORK, ".env.testnet");
    if (!fs.existsSync(envFile)) {
      throw new Error(`Deployment file not found: ${envFile}`);
    }
  }
  
  const env = fs.readFileSync(envFile, "utf8");
  
  // Check for vault first (preferred)
  const vaultMatch = env.match(/VAULT_ADDRESS=(.+)/);
  if (vaultMatch) {
    return { address: vaultMatch[1].trim(), type: "vault" };
  }
  
  // Fall back to FAIR token contract
  const fairMatch = env.match(/FAIR_ADDRESS=(.+)/);
  if (fairMatch) {
    return { address: fairMatch[1].trim(), type: "fair" };
  }
  
  throw new Error("No contract address found (VAULT_ADDRESS or FAIR_ADDRESS)");
}

// Get contract and update interval if needed
async function getContractAndInterval() {
  const wallet = await getWallet();
  const { address: contractAddress, type: contractType } = getContractAddress();
  
  // Connect to contract (FAIR token or FAIRVault)
  let contractName;
  if (contractType === "vault") {
    contractName = CONTRACTS.FAIR_VAULT;
  } else if (NETWORK === "mainnet") {
    contractName = CONTRACTS.FAIR;
  } else {
    contractName = CONTRACTS.FAIR_TESTNET;
  }
  
  const fairArtifact = loadArtifact(contractName);
  const fair = new ethers.Contract(contractAddress, fairArtifact.abi, wallet);
  
  // Try to read PERIOD_INTERVAL from contract (if it's a vault with configurable timing)
  let actualInterval = INTERVAL_MS;
  if (contractType === "vault" && !process.env.TEST_INTERVAL_MS) {
    try {
      const periodInterval = await fair.PERIOD_INTERVAL();
      if (periodInterval) {
        // Convert seconds to milliseconds
        actualInterval = Number(periodInterval) * 1000;
        log(`Using contract's PERIOD_INTERVAL: ${periodInterval} seconds`);
      }
    } catch (e) {
      // Contract might not have PERIOD_INTERVAL (old version), use default
      log("Contract doesn't expose PERIOD_INTERVAL, using default interval");
    }
  }
  
  return { wallet, fair, contractAddress, contractType, actualInterval };
}

async function runKeeper() {
  log(`Starting keeper for ${NETWORK}...`);
  
  const { wallet, fair, contractAddress, contractType } = await getContractAndInterval();
  
  log(`Wallet: ${wallet.address}`);
  log(`Contract: ${contractAddress} (${contractType})`);
  
  const balance = await wallet.provider.getBalance(wallet.address);
  log(`Balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther("0.001")) {
    log("⚠️ WARNING: Low balance! May fail to send transactions.");
  }
  
  if (contractType === "vault") {
    log("Using FAIRVault");
  } else if (NETWORK === "mainnet") {
    log("Using FAIR token contract");
  } else {
    log("Using FAIRTestnet");
  }
  
  // Find current milestone
  let currentMilestone = 0;
  for (let i = 1; i <= 18; i++) {
    const unlocked = await fair.milestoneUnlocked(i);
    if (!unlocked) {
      currentMilestone = i;
      break;
    }
  }
  
  if (currentMilestone === 0) {
    log("🎉 All milestones unlocked! Keeper complete.");
    return;
  }
  
  log(`Current milestone: ${currentMilestone}`);
  
  // Check vault initialization first (for vault contracts)
  let isInitialized = true;
  let oracleSet = true;
  if (contractType === "vault") {
    try {
      isInitialized = await fair.initialized();
      const oracleAddr = await fair.priceOracle();
      oracleSet = oracleAddr !== ethers.ZeroAddress;
      
      if (!isInitialized) {
        log(`  ⚠️  Vault not initialized yet. Waiting for deposit...`);
        log("Keeper cycle complete.\n");
        return;
      }
      
      if (!oracleSet) {
        log(`  ⚠️  Oracle not set yet. Waiting for deployment...`);
        log("Keeper cycle complete.\n");
        return;
      }
      
      // Try to call oracle directly to diagnose issues
      try {
        const oracleAddr = await fair.priceOracle();
        const oracleAbi = ["function getPrice() external view returns (uint256)"];
        const oracle = new ethers.Contract(oracleAddr, oracleAbi, wallet.provider);
        const testPrice = await oracle.getPrice();
        log(`  Oracle accessible, test price: ${testPrice}`);
      } catch (oracleError) {
        log(`  ⚠️  Oracle getPrice() is failing: ${oracleError.message}`);
        log(`     This may be due to insufficient pool history or pool configuration.`);
        log(`     The keeper will still attempt tryUnlock() which may handle this gracefully.`);
      }
    } catch (error) {
      log(`  ⚠️  Error checking vault status: ${error.message}`);
      log("Keeper cycle complete.\n");
      return;
    }
  }
  
  // Get milestone status (with error handling)
  let status;
  let statusAvailable = false;
  try {
    status = await fair.getMilestoneStatus(currentMilestone);
    statusAvailable = true;
    
    log(`  Unlocked: ${status.unlocked}`);
    // FAIRVault/Testnet uses 'goodPeriods', old FAIR.sol uses 'goodHours'
    const goodCount = status.goodPeriods ?? status.goodHours ?? status[1];
    log(`  Good periods: ${goodCount}`);
    log(`  Price target: ${status.priceTarget} (1e9 units)`);
    log(`  Current price: ${status.currentPrice} (1e9 units)`);
  } catch (error) {
    log(`  ⚠️  Warning: Could not get milestone status: ${error.message}`);
    log(`     This is likely due to insufficient pool history for TWAP.`);
    log(`     The keeper will still attempt tryUnlock() which may work.`);
    log(`     Run: node scripts/mainnet/check-oracle.js to diagnose.\n`);
    // Continue anyway - tryUnlock might still work
  }
  
  // Check if can unlock (with error handling) - only if status was available
  let canUnlock;
  if (statusAvailable) {
    try {
      canUnlock = await fair.canUnlockMilestone(currentMilestone);
      log(`  Can unlock: ${canUnlock.canUnlock}`);
      log(`  Reason: ${canUnlock.reason}`);
    } catch (error) {
      log(`  ⚠️  Error checking unlock status: ${error.message}`);
      canUnlock = { canUnlock: false, reason: error.message };
    }
  } else {
    log(`  Skipping canUnlock check (status unavailable)`);
    canUnlock = { canUnlock: false, reason: "Status check failed" };
  }
  
  // Try to process and unlock
  try {
    // IMPORTANT: tryUnlock() can record good periods even if it can't unlock yet!
    // We should call it if:
    // 1. Price is above target (to record good period)
    // 2. OR all conditions are met (to unlock)
    
    // Check if we should skip based on the reason
    let shouldSkip = false;
    if (canUnlock && !canUnlock.canUnlock) {
      const reason = canUnlock.reason.toLowerCase();
      
      // These reasons mean tryUnlock() will revert - skip it
      if (reason.includes("oracle") || 
          reason.includes("not initialized") || 
          reason.includes("not set") ||
          reason.includes("invalid milestone")) {
        log(`  ⚠️  Cannot proceed: ${canUnlock.reason}`);
        log(`  Skipping tryUnlock() - it would revert.\n`);
        shouldSkip = true;
      } 
      // These reasons mean we can't unlock YET, but tryUnlock() can still record good periods
      else if (reason.includes("good periods not reached") || 
               reason.includes("cooldown not elapsed") ||
               reason.includes("price below target")) {
        // Check if price is above target - if so, tryUnlock() can record a good period
        if (statusAvailable && status.currentPrice > 0n && status.currentPrice >= status.priceTarget) {
          log(`  ℹ️  Cannot unlock yet: ${canUnlock.reason}`);
          log(`  But price is above target - calling tryUnlock() to record good period...\n`);
          shouldSkip = false;
        } else {
          log(`  ℹ️  Cannot unlock yet: ${canUnlock.reason}`);
          log(`  Price may be below target - skipping tryUnlock() for now.\n`);
          shouldSkip = true;
        }
      } else {
        // Unknown reason - be cautious but try anyway if price looks good
        if (statusAvailable && status.currentPrice > 0n && status.currentPrice >= status.priceTarget) {
          log(`  ⚠️  Unknown reason: ${canUnlock.reason}`);
          log(`  But price is above target - attempting tryUnlock()...\n`);
          shouldSkip = false;
        } else {
          log(`  ⚠️  Unknown reason: ${canUnlock.reason}`);
          log(`  Skipping tryUnlock() to be safe.\n`);
          shouldSkip = true;
        }
      }
    }
    
    // If canUnlock check itself failed (oracle error), don't call tryUnlock
    if (!canUnlock || canUnlock.reason === "Status check failed") {
      log(`  ⚠️  Cannot verify unlock conditions (oracle may be failing)`);
      log(`  Skipping tryUnlock() to avoid revert.`);
      log(`  Run: node scripts/mainnet/check-oracle.js to diagnose.\n`);
      shouldSkip = true;
    }
    
    if (shouldSkip) {
      return;
    }
    
    // If status was unavailable but we got here, it means canUnlock worked
    // This is fine - we can still try tryUnlock() which might work
    if (!statusAvailable) {
      log(`  ⚠️  Status unavailable, but canUnlock() succeeded`);
      log(`  Attempting tryUnlock() - it may work even if getMilestoneStatus() failed\n`);
    }
    
    log(`Calling tryUnlock(${currentMilestone})...`);
    
    // Try to estimate gas first to catch revert reasons
    let estimatedGas;
    try {
      estimatedGas = await fair.tryUnlock.estimateGas(currentMilestone);
      log(`  Estimated gas: ${estimatedGas.toString()}`);
    } catch (estimateError) {
      log(`  ❌ Gas estimation failed: ${estimateError.message}`);
      if (estimateError.data) {
        log(`  Revert data: ${estimateError.data}`);
      }
      log(`  This means tryUnlock() would revert. Check conditions above.\n`);
      return;
    }
    
    const tx = await fair.tryUnlock(currentMilestone, {
      gasLimit: estimatedGas * 2n, // Use 2x estimated gas for safety
    });
    log(`  TX: ${tx.hash}`);
    log(`  Explorer: ${config.explorer}/tx/${tx.hash}`);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 0) {
      log(`  ❌ Transaction reverted!`);
      log(`  Gas used: ${receipt.gasUsed.toString()}`);
      log(`  This means tryUnlock() conditions were not met.`);
      log(`  Check: cooldown, good periods, and price target.\n`);
      return;
    }
    
    log(`  ✅ Transaction confirmed`);
    log(`  Gas used: ${receipt.gasUsed.toString()}`);
    
      // Check if milestone was unlocked (with error handling)
      try {
        const newStatus = await fair.getMilestoneStatus(currentMilestone);
        if (newStatus.unlocked) {
          log(`✅ MILESTONE ${currentMilestone} UNLOCKED!`);
        } else {
          if (statusAvailable) {
            const oldCount = status.goodPeriods ?? status.goodHours ?? status[1];
            const newCount = newStatus.goodPeriods ?? newStatus.goodHours ?? newStatus[1];
            if (newCount > oldCount) {
              log(`  ✅ Good period recorded: ${oldCount} → ${newCount}`);
            } else {
              log(`  Good periods unchanged: ${oldCount}`);
            }
          } else {
            // Status wasn't available before, just show current
            const newCount = newStatus.goodPeriods ?? newStatus.goodHours ?? newStatus[1];
            log(`  Current good periods: ${newCount}`);
          }
        }
      } catch (error) {
        const config = getNetworkConfig(NETWORK);
        log(`  ⚠️  Could not verify status after unlock: ${error.message}`);
        log(`  ✅ Transaction succeeded (check on explorer: ${config.explorer}/tx/${tx.hash})`);
        log(`     This is normal if pool history is insufficient.`);
      }
  } catch (error) {
    // More detailed error handling
    const config = getNetworkConfig(NETWORK);
    
    if (error.reason) {
      log(`❌ Error: ${error.reason}`);
    } else if (error.message) {
      log(`❌ Error: ${error.message}`);
    } else {
      log(`❌ Error: ${JSON.stringify(error)}`);
    }
    
    // Check if transaction was sent but reverted
    if (error.receipt && error.receipt.status === 0) {
      log(`  Transaction reverted (status: 0)`);
      log(`  Gas used: ${error.receipt.gasUsed.toString()}`);
      log(`  TX: ${config.explorer}/tx/${error.receipt.hash}`);
      log(`\n  Possible reasons:`);
      log(`    1. Vault not initialized`);
      log(`    2. Invalid milestone ID`);
      log(`    3. Milestone already unlocked`);
      log(`    4. Oracle not set`);
      log(`    5. Oracle.getPrice() failed (insufficient pool history)`);
      log(`\n  Check conditions above or run: node scripts/mainnet/check-oracle.js\n`);
      return;
    }
    
    // Check if it's a revert with data
    if (error.data) {
      log(`  Error data: ${error.data}`);
    }
  }
  
  log("Keeper cycle complete.\n");
}

async function main() {
  log("=".repeat(50));
  log(`FAIR Keeper Bot - ${NETWORK.toUpperCase()}${TEST_MODE ? " (TEST MODE)" : ""}`);
  if (TEST_MODE) {
    log("⚠️  TEST MODE: Running every 1 minute");
  }
  log("=".repeat(50));
  
  // Get contract and determine actual interval
  const { actualInterval } = await getContractAndInterval();
  
  if (RUN_ONCE) {
    await runKeeper();
    return;
  }
  
  // Run immediately
  await runKeeper();
  
  // Then run on interval using the actual interval from contract
  const intervalSeconds = actualInterval / 1000;
  let intervalDisplay;
  if (intervalSeconds < 60) {
    intervalDisplay = `${intervalSeconds} second(s)`;
  } else if (intervalSeconds < 3600) {
    intervalDisplay = `${intervalSeconds / 60} minute(s)`;
  } else {
    intervalDisplay = `${intervalSeconds / 3600} hour(s)`;
  }
  log(`Running every ${intervalDisplay}...`);
  
  setInterval(async () => {
    try {
      await runKeeper();
    } catch (error) {
      log(`❌ Keeper error: ${error.message}`);
    }
  }, actualInterval);
}

main().catch((err) => {
  log(`❌ Fatal error: ${err.message}`);
  process.exitCode = 1;
});

