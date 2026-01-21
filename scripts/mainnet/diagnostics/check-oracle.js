// scripts/mainnet/check-oracle.js
// Diagnostic script to check oracle and pool configuration
// Usage: node scripts/mainnet/check-oracle.js [VAULT_ADDRESS]

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 Oracle & Pool Diagnostic Tool");
  console.log("=".repeat(70) + "\n");

  // Get vault address
  const VAULT_ADDRESS = process.argv[2] || process.env.VAULT_ADDRESS;
  
  if (!VAULT_ADDRESS) {
    // Try to find from deployment file
    const testPath = path.join(__dirname, ".env.test");
    const mainnetPath = path.join(__dirname, ".env.mainnet");
    
    let envFile;
    if (fs.existsSync(testPath)) {
      envFile = testPath;
    } else if (fs.existsSync(mainnetPath)) {
      envFile = mainnetPath;
    } else {
      console.log("❌ Please provide VAULT_ADDRESS:");
      console.log("   node scripts/mainnet/check-oracle.js <VAULT_ADDRESS>");
      console.log("   OR set VAULT_ADDRESS in .env\n");
      process.exit(1);
    }
    
    const env = fs.readFileSync(envFile, "utf8");
    const vaultMatch = env.match(/VAULT_ADDRESS=(.+)/);
    if (vaultMatch) {
      const vaultAddr = vaultMatch[1].trim();
      console.log(`📋 Found vault address from ${path.basename(envFile)}: ${vaultAddr}\n`);
      await checkVault(vaultAddr);
    } else {
      console.log("❌ VAULT_ADDRESS not found in deployment file\n");
      process.exit(1);
    }
  } else {
    await checkVault(VAULT_ADDRESS);
  }
}

async function checkVault(vaultAddress) {
  const config = getNetworkConfig("mainnet");
  const wallet = getWallet("mainnet");
  const provider = wallet.provider;

  console.log(`Vault Address: ${vaultAddress}`);
  console.log(`Network: ${config.name}`);
  console.log(`Explorer: ${config.explorer}/address/${vaultAddress}\n`);

  // First, verify contract exists
  console.log("Verifying contract exists...");
  try {
    const code = await provider.getCode(vaultAddress);
    if (code === "0x" || code === "0x0") {
      console.log(`  ❌ ERROR: No contract code found at address ${vaultAddress}`);
      console.log(`     This address may not be a contract or may not be deployed.`);
      console.log(`     Verify on explorer: ${config.explorer}/address/${vaultAddress}\n`);
      process.exit(1);
    }
    console.log(`  ✅ Contract code found (${code.length} bytes)\n`);
  } catch (error) {
    console.log(`  ❌ Error checking contract code: ${error.message}`);
    console.log(`     RPC provider may be having issues.\n`);
    process.exit(1);
  }

  // Load vault contract
  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(vaultAddress, vaultArtifact.abi, provider);

  // =====================
  // STEP 1: Check Vault Status
  // =====================
  console.log("=".repeat(70));
  console.log("Step 1: Vault Status");
  console.log("=".repeat(70));

  try {
    // Try to call a simple view function first to verify ABI matches
    console.log("  Testing contract interface...");
    
    let isInitialized, oracleAddr, oracleFrozen, fairToken, totalDeposited;
    
    try {
      isInitialized = await vault.initialized();
    } catch (e) {
      throw new Error(`Failed to call initialized(): ${e.message}. Contract may not be FAIRVault or ABI mismatch.`);
    }
    
    try {
      oracleAddr = await vault.priceOracle();
      oracleFrozen = await vault.oracleFrozen();
      fairToken = await vault.fairToken();
      totalDeposited = await vault.totalDeposited();
    } catch (e) {
      throw new Error(`Failed to read vault state: ${e.message}`);
    }

    console.log(`  Initialized: ${isInitialized ? "✅ YES" : "❌ NO"}`);
    console.log(`  Oracle Address: ${oracleAddr}`);
    console.log(`  Oracle Frozen: ${oracleFrozen ? "✅ YES" : "❌ NO"}`);
    console.log(`  FAIR Token: ${fairToken}`);
    console.log(`  Total Deposited: ${ethers.formatEther(totalDeposited)} tokens\n`);

    if (!isInitialized) {
      console.log("  ⚠️  Vault is not initialized. Deposit tokens first.\n");
      return;
    }

    if (oracleAddr === ethers.ZeroAddress) {
      console.log("  ⚠️  Oracle is not set. Run resume-deployment.js to set it.\n");
      return;
    }

    // =====================
    // STEP 2: Check Oracle Contract
    // =====================
    console.log("=".repeat(70));
    console.log("Step 2: Oracle Contract");
    console.log("=".repeat(70));

    const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
    
    // First, verify the contract code exists
    console.log("  Verifying oracle contract exists...");
    const oracleCode = await provider.getCode(oracleAddr);
    if (oracleCode === "0x" || oracleCode === "0x0") {
      console.log(`  ❌ ERROR: No contract code at oracle address ${oracleAddr}`);
      console.log(`     Verify on explorer: ${config.explorer}/address/${oracleAddr}\n`);
      return;
    }
    console.log(`  ✅ Oracle contract code found (${oracleCode.length / 2 - 1} bytes)`);
    
    // Check if bytecode matches expected (at least check it's not empty and has reasonable size)
    const expectedMinSize = 1000; // Minimum expected contract size
    if (oracleCode.length < expectedMinSize * 2) {
      console.log(`  ⚠️  WARNING: Contract bytecode seems unusually small`);
      console.log(`     This might indicate a proxy or different contract type\n`);
    } else {
      console.log(`  ✅ Contract bytecode size looks reasonable\n`);
    }
    
    const oracle = new ethers.Contract(oracleAddr, oracleArtifact.abi, provider);

    // Helper function to retry calls with timeout
    async function retryCall(fn, retries = 3, delay = 2000) {
      for (let i = 0; i < retries; i++) {
        try {
          return await Promise.race([
            fn(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Call timeout")), 30000))
          ]);
        } catch (e) {
          if (i === retries - 1) throw e;
          console.log(`    Retry ${i + 1}/${retries - 1} after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    try {
      // Try calling pool() with error handling
      console.log("  Testing oracle interface...");
      let poolAddr, fairTokenOracle, quoteToken, twapWindow;
      
      // Get current block number for explicit calls
      const currentBlock = await provider.getBlockNumber();
      console.log(`  Current block: ${currentBlock}`);
      console.log(`  Using block tag: "latest" (block ${currentBlock})\n`);
      
      // Try reading via ABI first with retry
      try {
        console.log("  Attempting ABI calls...");
        poolAddr = await retryCall(() => oracle.pool());
        fairTokenOracle = await retryCall(() => oracle.fairToken());
        quoteToken = await retryCall(() => oracle.quoteToken());
        twapWindow = await retryCall(() => oracle.twapWindow());
        console.log(`  ✅ Successfully read via ABI\n`);
      } catch (e) {
        console.log(`  ⚠️  ABI call failed: ${e.message}`);
        console.log(`  Attempting raw calls with explicit block number...`);
        
        // Try raw calls as fallback with explicit block number
        try {
          const blockTag = currentBlock; // Use explicit block number
          
          const poolCall = await retryCall(() => provider.call({
            to: oracleAddr,
            data: "0x16f0115b", // pool() function selector
            blockTag: blockTag
          }));
          if (poolCall && poolCall !== "0x" && poolCall.length >= 66) {
            poolAddr = ethers.getAddress("0x" + poolCall.slice(-40));
            console.log(`  ✅ pool() found via raw call: ${poolAddr}`);
          } else {
            throw new Error(`pool() returned invalid data: ${poolCall}`);
          }
          
          const fairTokenCall = await retryCall(() => provider.call({
            to: oracleAddr,
            data: "0x217a4b70", // fairToken() selector
            blockTag: blockTag
          }));
          if (fairTokenCall && fairTokenCall !== "0x" && fairTokenCall.length >= 66) {
            fairTokenOracle = ethers.getAddress("0x" + fairTokenCall.slice(-40));
            console.log(`  ✅ fairToken() found via raw call: ${fairTokenOracle}`);
          } else {
            throw new Error(`fairToken() returned invalid data: ${fairTokenCall}`);
          }
          
          const quoteTokenCall = await retryCall(() => provider.call({
            to: oracleAddr,
            data: "0x5202581d", // quoteToken() selector
            blockTag: blockTag
          }));
          if (quoteTokenCall && quoteTokenCall !== "0x" && quoteTokenCall.length >= 66) {
            quoteToken = ethers.getAddress("0x" + quoteTokenCall.slice(-40));
            console.log(`  ✅ quoteToken() found via raw call: ${quoteToken}`);
          } else {
            throw new Error(`quoteToken() returned invalid data: ${quoteTokenCall}`);
          }
          
          const twapWindowCall = await retryCall(() => provider.call({
            to: oracleAddr,
            data: "0xdc76fabc", // twapWindow() selector
            blockTag: blockTag
          }));
          if (twapWindowCall && twapWindowCall !== "0x" && twapWindowCall.length >= 66) {
            twapWindow = BigInt(twapWindowCall);
            console.log(`  ✅ twapWindow() found via raw call: ${twapWindow}`);
          } else {
            throw new Error(`twapWindow() returned invalid data: ${twapWindowCall}`);
          }
          
          if (!poolAddr || !fairTokenOracle || !quoteToken || !twapWindow) {
            throw new Error("Could not read all oracle state variables");
          }
          console.log(`  ⚠️  Note: Using raw calls - ABI may not match deployed contract\n`);
        } catch (rawError) {
          console.log(`\n  ❌ All methods failed. This suggests:`);
          console.log(`     1. RPC provider issue (try different RPC endpoint)`);
          console.log(`     2. Contract not fully confirmed yet (wait a few blocks)`);
          console.log(`     3. Contract bytecode mismatch\n`);
          throw new Error(`Both ABI and raw calls failed. ABI error: ${e.message}, Raw error: ${rawError.message}`);
        }
      }
      
      const twapWindowNum = Number(twapWindow);

      console.log(`  Pool Address: ${poolAddr}`);
      console.log(`  FAIR Token: ${fairTokenOracle}`);
      console.log(`  Quote Token: ${quoteToken}`);
      console.log(`  TWAP Window: ${twapWindow} seconds (${twapWindowNum / 3600} hours)\n`);

      // Verify tokens match
      if (fairTokenOracle.toLowerCase() !== fairToken.toLowerCase()) {
        console.log("  ⚠️  WARNING: Oracle FAIR token doesn't match vault FAIR token!\n");
      } else {
        console.log("  ✅ FAIR token matches vault\n");
      }

      // =====================
      // STEP 3: Check Pool Contract
      // =====================
      console.log("=".repeat(70));
      console.log("Step 3: Aerodrome Pool");
      console.log("=".repeat(70));

      const poolAbi = [
        "function token0() external view returns (address)",
        "function token1() external view returns (address)",
        "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
        "function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)"
      ];
      const pool = new ethers.Contract(poolAddr, poolAbi, provider);

      // Helper function to retry pool calls
      async function retryPoolCall(fn, retries = 3, delay = 2000) {
        for (let i = 0; i < retries; i++) {
          try {
            return await Promise.race([
              fn(),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Call timeout")), 30000))
            ]);
          } catch (e) {
            if (i === retries - 1) throw e;
            console.log(`    Retry ${i + 1}/${retries - 1} after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      let cardinality = 0; // Declare in outer scope for summary
      try {
        console.log("  Reading pool state...");
        const token0 = await retryPoolCall(() => pool.token0());
        const token1 = await retryPoolCall(() => pool.token1());
        const slot0 = await retryPoolCall(() => pool.slot0());
        
        cardinality = Number(slot0.observationCardinality); // Update outer scope variable
        
        console.log(`  Token0: ${token0}`);
        console.log(`  Token1: ${token1}`);
        console.log(`  Current Tick: ${Number(slot0.tick)}`);
        console.log(`  Observation Index: ${Number(slot0.observationIndex)}`);
        console.log(`  Observation Cardinality: ${cardinality}`);
        console.log(`  Observation Cardinality Next: ${Number(slot0.observationCardinalityNext)}`);
        console.log(`  Unlocked: ${slot0.unlocked ? "✅ YES" : "❌ NO"}\n`);

        // Check if FAIR token is in pool
        const fairInPool = (token0.toLowerCase() === fairTokenOracle.toLowerCase() || 
                            token1.toLowerCase() === fairTokenOracle.toLowerCase());
        const quoteInPool = (token0.toLowerCase() === quoteToken.toLowerCase() || 
                             token1.toLowerCase() === quoteToken.toLowerCase());

        if (!fairInPool) {
          console.log("  ❌ ERROR: FAIR token not found in pool!");
          console.log(`     Pool has: ${token0} and ${token1}`);
          console.log(`     Oracle expects: ${fairTokenOracle}\n`);
        } else if (!quoteInPool) {
          console.log("  ❌ ERROR: Quote token not found in pool!");
          console.log(`     Pool has: ${token0} and ${token1}`);
          console.log(`     Oracle expects: ${quoteToken}\n`);
        } else {
          console.log("  ✅ Both tokens found in pool\n");
        }

        // Check observation history
        cardinality = Number(slot0.observationCardinality); // Update outer scope variable
        console.log(`  Observation History:`);
        console.log(`    Cardinality: ${cardinality}`);
        
        if (cardinality < 2) {
          console.log(`    ⚠️  WARNING: Pool has insufficient observations (need at least 2)`);
          console.log(`       The pool needs more trading activity to build TWAP history.`);
          console.log(`       This is normal for new pools.\n`);
        } else {
          // Calculate how much history we have
          // Each observation is typically every ~10-20 minutes
          const estimatedHistoryMinutes = cardinality * 15; // Rough estimate
          const estimatedHistoryHours = estimatedHistoryMinutes / 60;
          
          console.log(`    Estimated history: ~${estimatedHistoryHours.toFixed(1)} hours`);
          
          const twapWindowHours = twapWindowNum / 3600;
          if (estimatedHistoryHours < twapWindowHours) {
            console.log(`    ⚠️  WARNING: Pool history (${estimatedHistoryHours.toFixed(1)}h) may be less than TWAP window (${twapWindowHours}h)`);
            console.log(`       The oracle may fall back to spot price if TWAP is unavailable.\n`);
          } else {
            console.log(`    ✅ Sufficient history for ${twapWindowHours}h TWAP\n`);
          }
        }

        // =====================
        // STEP 4: Test Oracle getPrice()
        // =====================
        console.log("=".repeat(70));
        console.log("Step 4: Test Oracle getPrice()");
        console.log("=".repeat(70));

        try {
          console.log("  Attempting to call oracle.getPrice()...");
          const price = await oracle.getPrice();
          const priceUsd = Number(price) / 1e9;
          
          console.log(`  ✅ SUCCESS!`);
          console.log(`  Price: ${price} (1e9 units)`);
          console.log(`  Price USD: $${priceUsd.toFixed(9)}\n`);
          
          // Test multiple times to see if it's consistent
          console.log("  Testing consistency (3 calls)...");
          const prices = [];
          for (let i = 0; i < 3; i++) {
            const p = await oracle.getPrice();
            prices.push(Number(p));
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          const allSame = prices.every(p => p === prices[0]);
          if (allSame) {
            console.log(`  ✅ All calls returned same price: ${prices[0]}\n`);
          } else {
            console.log(`  ⚠️  Prices varied: ${prices.join(", ")}`);
            console.log(`     This is normal if pool is actively trading.\n`);
          }

        } catch (error) {
          console.log(`  ❌ FAILED: ${error.message}`);
          
          if (error.message.includes("revert") || error.message.includes("require")) {
            console.log(`\n  Possible causes:`);
            console.log(`    1. Pool doesn't have enough observation history`);
            console.log(`    2. Pool observations haven't been written yet`);
            console.log(`    3. TWAP window is larger than available history`);
            console.log(`\n  Solutions:`);
            console.log(`    - Wait for more trading activity in the pool`);
            console.log(`    - Check if pool is active and has liquidity`);
            console.log(`    - Verify pool address is correct\n`);
          } else {
            console.log(`\n  Error details: ${error}\n`);
          }
        }

        // =====================
        // STEP 5: Test Vault getMilestoneStatus()
        // =====================
        console.log("=".repeat(70));
        console.log("Step 5: Test Vault getMilestoneStatus()");
        console.log("=".repeat(70));

        try {
          console.log("  Attempting to call vault.getMilestoneStatus(1)...");
          const status = await vault.getMilestoneStatus(1);
          
          console.log(`  ✅ SUCCESS!`);
          console.log(`  Unlocked: ${status.unlocked}`);
          console.log(`  Good Periods: ${status.goodPeriods}`);
          console.log(`  Price Target: ${status.priceTarget} (1e9 units)`);
          console.log(`  Current Price: ${status.currentPrice} (1e9 units)`);
          console.log(`  Current Price USD: $${(Number(status.currentPrice) / 1e9).toFixed(9)}\n`);
          
        } catch (error) {
          console.log(`  ❌ FAILED: ${error.message}`);
          console.log(`     This is likely because oracle.getPrice() is failing.\n`);
        }

        // =====================
        // SUMMARY
        // =====================
        console.log("=".repeat(70));
        console.log("Summary");
        console.log("=".repeat(70));
        
        const canGetPrice = await testOraclePrice(oracle);
        const canGetStatus = await testVaultStatus(vault);
        
        console.log(`  Vault Initialized: ${isInitialized ? "✅" : "❌"}`);
        console.log(`  Oracle Set: ${oracleAddr !== ethers.ZeroAddress ? "✅" : "❌"}`);
        console.log(`  Oracle Frozen: ${oracleFrozen ? "✅" : "❌"}`);
        console.log(`  Pool Observations: ${cardinality >= 2 ? "✅" : "⚠️"} (${cardinality} observations)`);
        console.log(`  Oracle getPrice(): ${canGetPrice ? "✅" : "❌"}`);
        console.log(`  Vault getMilestoneStatus(): ${canGetStatus ? "✅" : "❌"}\n`);

        if (canGetPrice && canGetStatus) {
          console.log("✅ All checks passed! Keeper should work correctly.\n");
        } else {
          console.log("⚠️  Some checks failed. See details above.\n");
        }

      } catch (error) {
        console.log(`  ❌ Error reading pool: ${error.message}`);
        
        // Check if it's an RPC issue
        if (error.message.includes("missing revert data") || error.message.includes("CALL_EXCEPTION")) {
          console.log(`\n  🔍 Pool Contract Diagnostic:`);
          console.log(`     Pool Address: ${poolAddr}`);
          console.log(`     RPC URL: ${config.rpcUrl}`);
          console.log(`     Contract Code Exists: Checking...`);
          
          try {
            const poolCode = await provider.getCode(poolAddr);
            if (poolCode === "0x" || poolCode === "0x0") {
              console.log(`     ❌ No contract code at pool address!`);
              console.log(`        Verify on explorer: ${config.explorer}/address/${poolAddr}\n`);
            } else {
              console.log(`     ✅ Pool contract code found (${poolCode.length / 2 - 1} bytes)`);
              console.log(`\n  💡 This is likely an RPC provider issue. Try:`);
              console.log(`     1. Wait 1-2 minutes and retry`);
              console.log(`     2. Use a different RPC endpoint (Alchemy, Infura)`);
              console.log(`     3. Check pool on explorer: ${config.explorer}/address/${poolAddr}\n`);
            }
          } catch (codeError) {
            console.log(`     ⚠️  Could not verify pool code: ${codeError.message}\n`);
          }
        } else {
          console.log(`\n`);
        }
      }

    } catch (error) {
      console.log(`  ❌ Error reading oracle: ${error.message}`);
      
      // Check if it's a contract existence issue
      if (error.message.includes("missing revert data") || error.message.includes("CALL_EXCEPTION")) {
        console.log(`\n  🔍 Diagnostic Information:`);
        console.log(`     RPC URL: ${config.rpcUrl}`);
        console.log(`     Oracle Address: ${oracleAddr}`);
        console.log(`     Contract Code Exists: ✅ YES`);
        
        console.log(`\n  Possible causes:`);
        console.log(`    1. RPC provider timeout or rate limiting`);
        console.log(`    2. Contract not fully indexed yet (wait 1-2 minutes)`);
        console.log(`    3. Network congestion`);
        
        console.log(`\n  💡 Solutions:`);
        console.log(`    1. Try a different RPC endpoint:`);
        console.log(`       Set BASE_MAINNET_RPC_URL in .env to:`);
        console.log(`       - https://base-mainnet.g.alchemy.com/v2/YOUR_KEY`);
        console.log(`       - https://base-mainnet.infura.io/v3/YOUR_KEY`);
        console.log(`       - https://mainnet.base.org (current)`);
        console.log(`    2. Wait 1-2 minutes and try again`);
        console.log(`    3. Check contract on explorer: ${config.explorer}/address/${oracleAddr}`);
        console.log(`    4. Verify contract was deployed correctly on Basescan\n`);
      } else {
        console.log(`\n`);
      }
    }

  } catch (error) {
    console.log(`  ❌ Error reading vault: ${error.message}`);
    
    // Check if it's a contract existence or ABI mismatch issue
    if (error.message.includes("missing revert data") || error.message.includes("CALL_EXCEPTION")) {
      console.log(`\n  Possible causes:`);
      console.log(`    1. Contract doesn't exist at ${vaultAddress}`);
      console.log(`    2. Contract ABI doesn't match (wrong contract type?)`);
      console.log(`    3. RPC provider issue`);
      console.log(`\n  Verify on explorer: ${config.explorer}/address/${vaultAddress}`);
      console.log(`  Check if this is actually a FAIRVault contract.\n`);
    } else {
      console.log(`\n`);
    }
  }
}

async function testOraclePrice(oracle) {
  try {
    await oracle.getPrice();
    return true;
  } catch {
    return false;
  }
}

async function testVaultStatus(vault) {
  try {
    await vault.getMilestoneStatus(1);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error("❌ Diagnostic failed:", err.message);
  process.exitCode = 1;
});

