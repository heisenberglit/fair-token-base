// scripts/testnet/test.js
// Test FAIR 10B on Base Sepolia testnet
// Usage: node scripts/testnet/test.js

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadAddresses() {
  const envPath = path.join(__dirname, ".env.testnet");
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
  console.log("\n" + "=".repeat(70));
  console.log("🧪 Testing FAIR 10B on Base Sepolia");
  console.log("=".repeat(70) + "\n");

  const config = getNetworkConfig("testnet");
  const wallet = getWallet("testnet");
  const addresses = loadAddresses();

  if (!addresses.FAIR_ADDRESS || !addresses.ORACLE_ADDRESS) {
    console.log("❌ Deployment not found. Run: node scripts/testnet/deploy.js\n");
    return;
  }

  console.log(`Network: ${config.name}`);
  console.log(`FAIR: ${addresses.FAIR_ADDRESS}`);
  console.log(`Oracle: ${addresses.ORACLE_ADDRESS}\n`);

  // Connect to contracts
  const fairArtifact = loadArtifact(CONTRACTS.FAIR_TESTNET);
  const oracleArtifact = loadArtifact(CONTRACTS.MOCK_ORACLE);
  
  const fair = new ethers.Contract(addresses.FAIR_ADDRESS, fairArtifact.abi, wallet);
  const oracle = new ethers.Contract(addresses.ORACLE_ADDRESS, oracleArtifact.abi, wallet);

  // Check token state
  console.log("Token State:");
  const totalSupply = await fair.totalSupply();
  const contractBalance = await fair.balanceOf(addresses.FAIR_ADDRESS);
  console.log(`  Total Supply: ${ethers.formatEther(totalSupply)} FAIR`);
  console.log(`  Contract Balance (locked): ${ethers.formatEther(contractBalance)} FAIR\n`);

  // Check oracle
  console.log("Oracle State:");
  const price = await oracle.getPrice();
  console.log(`  Current Price: ${price} (1e9 units = $${(Number(price) / 1e9).toFixed(6)})\n`);

  // Check milestone status
  console.log("Milestone Status:");
  for (let i = 1; i <= 3; i++) {
    const status = await fair.getMilestoneStatus(i);
    console.log(`  Milestone ${i}:`);
    console.log(`    Unlocked: ${status.unlocked}`);
    // Testnet uses goodPeriods, mainnet uses goodHours
    const goodCount = status.goodPeriods ?? status.goodHours ?? status[1];
    console.log(`    Good Periods: ${goodCount}`);
    console.log(`    Price Target: ${status.priceTarget} ($${(Number(status.priceTarget) / 1e9).toFixed(6)})`);
  }
  console.log();

  // Check unlock conditions for milestone 1
  const canUnlock = await fair.canUnlockMilestone(1);
  console.log("Milestone 1 Unlock Status:");
  console.log(`  Can Unlock: ${canUnlock.canUnlock}`);
  console.log(`  Reason: ${canUnlock.reason}\n`);

  // Try processing a good period
  console.log("Testing Good Period Recording...");
  const status1Before = await fair.getMilestoneStatus(1);
  
  try {
    const tx = await fair.processMilestonePeriod(1);
    await tx.wait();
    console.log(`  TX: ${tx.hash}`);
    
    const status1After = await fair.getMilestoneStatus(1);
    const beforeCount = status1Before.goodPeriods ?? status1Before.goodHours ?? status1Before[1];
    const afterCount = status1After.goodPeriods ?? status1After.goodHours ?? status1After[1];
    if (Number(afterCount) > Number(beforeCount)) {
      console.log(`  ✅ Good period recorded! (${beforeCount} → ${afterCount})\n`);
    } else {
      console.log(`  ℹ️  Period not recorded (conditions may not be met or interval not elapsed)\n`);
    }
  } catch (error) {
    console.log(`  ⚠️  ${error.reason || error.message}\n`);
  }

  // Summary
  console.log("=".repeat(70));
  console.log("✅ Testnet Test Complete!\n");
  console.log("Explorer Links:");
  console.log(`  FAIR: ${config.explorer}/address/${addresses.FAIR_ADDRESS}`);
  console.log(`  Oracle: ${config.explorer}/address/${addresses.ORACLE_ADDRESS}\n`);
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

