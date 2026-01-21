// scripts/local/test-all.js
// Test multiple milestone unlocks in one run
// Usage: node scripts/local/test-all.js [count]
// Example: node scripts/local/test-all.js 5  (unlocks 5 milestones)

import { ethers } from "ethers";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = "http://localhost:8545";
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get fresh provider + wallet with current nonce
async function getFreshWallet() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  // Get current nonce from chain
  const nonce = await provider.getTransactionCount(wallet.address, "latest");
  return { provider, wallet, nonce };
}

function loadAddresses() {
  const envPath = path.join(__dirname, ".env.local");
  const addresses = {};
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8");
    env.split("\n").forEach(line => {
      const [key, value] = line.split("=");
      if (key && value && !key.startsWith("#")) {
        addresses[key.trim()] = value.trim();
      }
    });
  }
  return addresses;
}

// Send transaction with explicit nonce handling
async function sendTx(contract, method, args, gasLimit = 300000) {
  const { wallet, nonce } = await getFreshWallet();
  const contractWithWallet = contract.connect(wallet);
  
  try {
    const tx = await contractWithWallet[method](...args, { 
      gasLimit,
      nonce  // Use explicit nonce
    });
    await tx.wait();
    await sleep(100); // Small delay for node to process
    return true;
  } catch (error) {
    // If nonce error, retry once
    if (error.message.includes("nonce") || error.message.includes("NONCE")) {
      await sleep(500);
      const { wallet: freshWallet, nonce: freshNonce } = await getFreshWallet();
      const freshContract = contract.connect(freshWallet);
      const tx = await freshContract[method](...args, { 
        gasLimit,
        nonce: freshNonce
      });
      await tx.wait();
      return true;
    }
    throw error;
  }
}

async function unlockMilestone(milestoneId, addresses, fairArtifact, oracleArtifact) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`📍 Unlocking Milestone ${milestoneId}`);
  console.log(`${"─".repeat(50)}`);

  const { provider, wallet } = await getFreshWallet();
  
  const fair = new ethers.Contract(addresses.FAIR_ADDRESS, fairArtifact.abi, wallet);
  const oracle = new ethers.Contract(addresses.ORACLE_ADDRESS, oracleArtifact.abi, wallet);

  // Get milestone info
  const status = await fair.getMilestoneStatus(milestoneId);
  const WAIT_RULE = await fair.WAIT_RULE();
  const REQUIRED_GOOD_PERIODS = await fair.REQUIRED_GOOD_PERIODS();
  const PERIOD_INTERVAL = await fair.PERIOD_INTERVAL();

  const priceTarget = Number(status.priceTarget);
  console.log(`  Price Target: ${priceTarget} ($${(priceTarget / 1e9).toFixed(6)})`);

  // Step 1: Set price above target if needed
  const currentPrice = Number(await oracle.getPrice());
  if (currentPrice < priceTarget) {
    const newPrice = priceTarget * 2;
    await sendTx(oracle, "setPrice", [newPrice], 100000);
    console.log(`  Set price: ${newPrice}`);
    await sleep(200);
  }

  // Step 2: Fast forward past cooldown
  const lastUnlockTime = Number(await fair.lastUnlockTime());
  const currentBlock = await provider.getBlock("latest");
  const timeSinceUnlock = currentBlock.timestamp - lastUnlockTime;
  
  if (timeSinceUnlock < Number(WAIT_RULE)) {
    const needed = Number(WAIT_RULE) - timeSinceUnlock + 60; // Extra buffer
    await provider.send("evm_increaseTime", [needed]);
    await provider.send("evm_mine", []);
    console.log(`  Fast-forwarded ${needed}s for cooldown`);
    await sleep(300); // Give node time to settle
  }

  // Step 3: Accumulate good periods
  const requiredPeriods = Number(REQUIRED_GOOD_PERIODS);
  console.log(`  Accumulating ${requiredPeriods} good periods...`);
  
  for (let i = 0; i < requiredPeriods; i++) {
    // Advance time for this period
    await provider.send("evm_increaseTime", [Number(PERIOD_INTERVAL) + 1]);
    await provider.send("evm_mine", []);
    await sleep(150); // Critical: let node settle
    
    // Try unlock to record good period
    try {
      await sendTx(fair, "tryUnlock", [milestoneId], 400000);
      process.stdout.write(".");
    } catch (e) {
      // Some failures are expected (not yet enough periods)
      process.stdout.write("x");
    }
  }
  console.log(""); // Newline after dots

  // Step 4: One more time advance + final unlock
  await provider.send("evm_increaseTime", [Number(PERIOD_INTERVAL) + 1]);
  await provider.send("evm_mine", []);
  await sleep(200);

  // Verify status before final attempt
  const { wallet: finalWallet } = await getFreshWallet();
  const finalFair = new ethers.Contract(addresses.FAIR_ADDRESS, fairArtifact.abi, finalWallet);
  
  const finalStatus = await finalFair.getMilestoneStatus(milestoneId);
  console.log(`  Good periods: ${finalStatus.goodPeriods}/${requiredPeriods}`);
  
  // Check if already unlocked from the loop
  if (finalStatus.unlocked) {
    console.log(`  ✅ Milestone ${milestoneId} UNLOCKED!`);
    return true;
  }
  
  // Final unlock attempt
  try {
    await sendTx(finalFair, "tryUnlock", [milestoneId], 500000);
    
    const checkStatus = await finalFair.getMilestoneStatus(milestoneId);
    if (checkStatus.unlocked) {
      console.log(`  ✅ Milestone ${milestoneId} UNLOCKED!`);
      return true;
    } else {
      console.log(`  ⏳ Milestone ${milestoneId} not yet unlocked (need more good periods)`);
      return false;
    }
  } catch (error) {
    const reason = error.reason || error.shortMessage || error.message;
    console.log(`  ❌ Failed: ${reason.substring(0, 100)}`);
    return false;
  }
}

async function main() {
  const count = parseInt(process.argv[2]) || 3;
  
  console.log("\n" + "=".repeat(60));
  console.log(`🧪 Testing ${count} Milestone Unlocks`);
  console.log("=".repeat(60));

  const addresses = loadAddresses();
  if (!addresses.FAIR_ADDRESS || !addresses.ORACLE_ADDRESS) {
    console.log("❌ Run deploy.js first\n");
    return;
  }

  const fairArtifact = loadArtifact(CONTRACTS.FAIR_TESTNET);
  const oracleArtifact = loadArtifact(CONTRACTS.MOCK_ORACLE);

  console.log(`\nFAIR: ${addresses.FAIR_ADDRESS}`);
  console.log(`Oracle: ${addresses.ORACLE_ADDRESS}\n`);

  let unlockedCount = 0;
  
  for (let i = 0; i < count; i++) {
    // Fresh connection for each milestone
    const { wallet } = await getFreshWallet();
    const fair = new ethers.Contract(addresses.FAIR_ADDRESS, fairArtifact.abi, wallet);
    
    // Find next milestone to unlock
    let nextMilestone = 0;
    for (let m = 1; m <= 18; m++) {
      const isUnlocked = await fair.milestoneUnlocked(m);
      if (!isUnlocked) {
        nextMilestone = m;
        break;
      }
    }
    
    if (nextMilestone === 0) {
      console.log("\n🎉 All 18 milestones unlocked!");
      break;
    }
    
    try {
      const success = await unlockMilestone(
        nextMilestone, addresses, fairArtifact, oracleArtifact
      );
      if (success) unlockedCount++;
    } catch (err) {
      console.log(`  ❌ Error: ${err.message.substring(0, 80)}`);
    }
    
    // Pause between milestones to let node fully settle
    if (i < count - 1) {
      await sleep(500);
    }
  }

  // Final summary
  console.log("\n" + "=".repeat(60));
  console.log(`✅ Summary: ${unlockedCount}/${count} milestones unlocked`);
  
  // Show pool balances
  const { wallet } = await getFreshWallet();
  const fair = new ethers.Contract(addresses.FAIR_ADDRESS, fairArtifact.abi, wallet);
  
  try {
    const treasuryBal = await fair.balanceOf(await fair.S1_TREASURY());
    const growthBal = await fair.balanceOf(await fair.S3_GROWTH());
    const liquidityBal = await fair.balanceOf(await fair.S2_LIQUIDITY());
    const teamBal = await fair.balanceOf(await fair.S4_TEAM());
    
    console.log("\nPool Balances:");
    console.log(`  Treasury: ${ethers.formatEther(treasuryBal)} FAIR`);
    console.log(`  Growth: ${ethers.formatEther(growthBal)} FAIR`);
    console.log(`  Liquidity: ${ethers.formatEther(liquidityBal)} FAIR`);
    console.log(`  Team: ${ethers.formatEther(teamBal)} FAIR`);
  } catch (e) {
    console.log("\n(Could not fetch pool balances)");
  }
  
  console.log("=".repeat(60) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
