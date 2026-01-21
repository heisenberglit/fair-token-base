// scripts/local/test.js
// Test FAIR 10B milestone unlock on local Hardhat fork
// Usage: node scripts/local/test.js [--fast-forward]

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function main() {
  const fastForward = process.argv.includes("--fast-forward") || process.argv.includes("-f");
  
  console.log("\n" + "=".repeat(70));
  console.log("🧪 Testing FAIR 10B Milestone Unlock");
  console.log("=".repeat(70) + "\n");

  const wallet = getWallet("local");
  const addresses = loadAddresses();

  if (!addresses.FAIR_ADDRESS || !addresses.ORACLE_ADDRESS) {
    console.log("❌ Deployment not found. Run: node scripts/local/deploy.js\n");
    return;
  }

  console.log(`FAIR: ${addresses.FAIR_ADDRESS}`);
  console.log(`Oracle: ${addresses.ORACLE_ADDRESS}\n`);

  // Connect to contracts
  const fairArtifact = loadArtifact(CONTRACTS.FAIR_TESTNET);
  const oracleArtifact = loadArtifact(CONTRACTS.MOCK_ORACLE);
  
  const fair = new ethers.Contract(addresses.FAIR_ADDRESS, fairArtifact.abi, wallet);
  const oracle = new ethers.Contract(addresses.ORACLE_ADDRESS, oracleArtifact.abi, wallet);

  // Get contract constants
  const WAIT_RULE = await fair.WAIT_RULE();
  const REQUIRED_GOOD_PERIODS = await fair.REQUIRED_GOOD_PERIODS();
  const PERIOD_INTERVAL = await fair.PERIOD_INTERVAL();
  const MILESTONE_UNLOCK = await fair.MILESTONE_UNLOCK_AMOUNT();

  console.log("Contract Parameters:");
  console.log(`  Wait Rule: ${WAIT_RULE} seconds (${Number(WAIT_RULE) / 60} minutes)`);
  console.log(`  Required Good Periods: ${REQUIRED_GOOD_PERIODS}`);
  console.log(`  Period Interval: ${PERIOD_INTERVAL} seconds`);
  console.log(`  Unlock Amount: ${ethers.formatEther(MILESTONE_UNLOCK)} FAIR\n`);

  // Find next unlockable milestone
  let milestoneId = 0;
  console.log("Checking milestone status...");
  for (let i = 1; i <= 18; i++) {
    const isUnlocked = await fair.milestoneUnlocked(i);
    if (!isUnlocked) {
      milestoneId = i;
      break;
    }
    console.log(`  Milestone ${i}: ✅ Unlocked`);
  }

  if (milestoneId === 0) {
    console.log("\n🎉 All 18 milestones unlocked!\n");
    
    // Show final distribution
    const treasuryBal = await fair.balanceOf(await fair.S1_TREASURY());
    const growthBal = await fair.balanceOf(await fair.S3_GROWTH());
    const liquidityBal = await fair.balanceOf(await fair.S2_LIQUIDITY());
    const teamBal = await fair.balanceOf(await fair.S4_TEAM());
    
    console.log("Final Pool Balances:");
    console.log(`  Treasury: ${ethers.formatEther(treasuryBal)} FAIR`);
    console.log(`  Growth: ${ethers.formatEther(growthBal)} FAIR`);
    console.log(`  Liquidity: ${ethers.formatEther(liquidityBal)} FAIR`);
    console.log(`  Team: ${ethers.formatEther(teamBal)} FAIR\n`);
    return;
  }

  console.log(`\n📍 Next milestone to unlock: ${milestoneId}\n`);

  const status = await fair.getMilestoneStatus(milestoneId);
  
  console.log(`Milestone ${milestoneId} Status:`);
  console.log(`  Unlocked: ${status.unlocked}`);
  console.log(`  Good Periods: ${status.goodPeriods}/${REQUIRED_GOOD_PERIODS}`);
  console.log(`  Price Target: ${status.priceTarget} (1e9 units)`);
  console.log(`  Current Price: ${status.currentPrice} (1e9 units)\n`);

  // Set price above target if needed
  const currentPrice = await oracle.getPrice();
  if (Number(currentPrice) < Number(status.priceTarget)) {
    console.log("📈 Setting price above target...");
    // Get fresh wallet for price update
    const priceWallet = getWallet("local");
    const priceOracle = new ethers.Contract(addresses.ORACLE_ADDRESS, oracleArtifact.abi, priceWallet);
    const newPrice = Number(status.priceTarget) * 2; // 2x target
    const priceTx = await priceOracle.setPrice(newPrice, { gasLimit: 100000 });
    await priceTx.wait();
    console.log(`  ✅ Price set to: ${newPrice} ($${(newPrice / 1e9).toFixed(6)})\n`);
  }

  // Check if we can unlock
  const canUnlock = await fair.canUnlockMilestone(milestoneId);
  console.log(`Can Unlock: ${canUnlock.canUnlock}`);
  console.log(`Reason: ${canUnlock.reason}\n`);

  if (fastForward) {
    console.log("⏩ Fast-forwarding time...\n");
    
    // Get provider for time manipulation
    const provider = wallet.provider;
    
    // Fast forward past cooldown
    const lastUnlockTime = await fair.lastUnlockTime();
    const currentBlock = await provider.getBlock("latest");
    const timeSinceUnlock = Number(currentBlock.timestamp) - Number(lastUnlockTime);
    
    if (timeSinceUnlock < Number(WAIT_RULE)) {
      const needed = Number(WAIT_RULE) - timeSinceUnlock + 60;
      console.log(`  Fast-forwarding ${needed} seconds for cooldown...`);
      await provider.send("evm_increaseTime", [needed]);
      await provider.send("evm_mine", []);
    }

    // Accumulate good periods
    const currentGoodPeriods = Number(status.goodPeriods);
    const periodsNeeded = Number(REQUIRED_GOOD_PERIODS) - currentGoodPeriods;
    
    if (periodsNeeded > 0) {
      console.log(`  Accumulating ${periodsNeeded} good periods...\n`);
      
      for (let i = 0; i < periodsNeeded; i++) {
        // Fast forward 1 period interval
        await provider.send("evm_increaseTime", [Number(PERIOD_INTERVAL)]);
        await provider.send("evm_mine", []);
        
        // Get fresh wallet and contract for each call
        const loopWallet = getWallet("local");
        const loopFair = new ethers.Contract(addresses.FAIR_ADDRESS, fairArtifact.abi, loopWallet);
        
        // Call tryUnlock to record good period
        const tx = await loopFair.tryUnlock(milestoneId, { gasLimit: 300000 });
        await tx.wait();
        
        if ((i + 1) % 5 === 0 || i === periodsNeeded - 1) {
          const newStatus = await loopFair.getMilestoneStatus(milestoneId);
          console.log(`  Progress: ${newStatus.goodPeriods}/${REQUIRED_GOOD_PERIODS} periods`);
        }
      }
      console.log();
    }
  }

  // Try to unlock with fresh wallet and explicit gas
  console.log("🔓 Attempting unlock...");
  try {
    // Get fresh wallet to avoid nonce issues
    const freshWallet = getWallet("local");
    const freshFair = new ethers.Contract(addresses.FAIR_ADDRESS, fairArtifact.abi, freshWallet);
    
    // First, try a static call to see if it would succeed
    console.log("  Simulating transaction...");
    try {
      await freshFair.tryUnlock.staticCall(milestoneId);
      console.log("  ✅ Static call succeeded");
    } catch (simError) {
      console.log(`  ⚠️  Static call failed: ${simError.reason || simError.message}`);
    }
    
    // Check owner balance
    const ownerBal = await freshFair.balanceOf(freshWallet.address);
    const unlockAmount = await freshFair.MILESTONE_UNLOCK_AMOUNT();
    console.log(`  Owner balance: ${ethers.formatEther(ownerBal)} FAIR`);
    console.log(`  Unlock amount: ${ethers.formatEther(unlockAmount)} FAIR`);
    
    if (ownerBal < unlockAmount) {
      console.log("  ❌ Owner doesn't have enough tokens!");
      return;
    }
    
    const tx = await freshFair.tryUnlock(milestoneId, { gasLimit: 1000000 });
    await tx.wait();
    console.log(`  TX: ${tx.hash}\n`);
    
    // Check result
    const newStatus = await freshFair.getMilestoneStatus(milestoneId);
    if (newStatus.unlocked) {
      console.log(`✅ MILESTONE ${milestoneId} UNLOCKED!\n`);
      
      // Show distribution
      const treasuryBal = await freshFair.balanceOf(await freshFair.S1_TREASURY());
      const growthBal = await freshFair.balanceOf(await freshFair.S3_GROWTH());
      const liquidityBal = await freshFair.balanceOf(await freshFair.S2_LIQUIDITY());
      const teamBal = await freshFair.balanceOf(await freshFair.S4_TEAM());
      
      console.log("Pool Balances After Unlock:");
      console.log(`  Treasury: ${ethers.formatEther(treasuryBal)} FAIR`);
      console.log(`  Growth: ${ethers.formatEther(growthBal)} FAIR`);
      console.log(`  Liquidity: ${ethers.formatEther(liquidityBal)} FAIR`);
      console.log(`  Team: ${ethers.formatEther(teamBal)} FAIR\n`);
    } else {
      console.log(`ℹ️  Not yet unlocked: ${newStatus.goodPeriods}/${REQUIRED_GOOD_PERIODS} periods\n`);
      if (!fastForward) {
        console.log("💡 Run with --fast-forward to auto-complete:\n");
        console.log("   node scripts/local/test.js --fast-forward\n");
      }
    }
  } catch (error) {
    console.log(`❌ Unlock failed: ${error.reason || error.message}\n`);
  }

  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

