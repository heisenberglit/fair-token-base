// scripts/mainnet/verify-keeper-ready.js
// Verify vault, oracle, and keeper bot are ready
// Usage: node scripts/mainnet/verify-keeper-ready.js [VAULT_ADDRESS]

import { ethers } from "ethers";
import { getWallet, getProvider } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("✅ Keeper Bot Readiness Check");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const wallet = getWallet(network);
  const provider = getProvider(network);

  // Get vault address
  let VAULT_ADDRESS = process.argv[2] || process.env.VAULT_ADDRESS;
  
  // Try to find from deployment files if not provided
  if (!VAULT_ADDRESS) {
    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const testPath = path.join(__dirname, ".env.test");
    const mainnetPath = path.join(__dirname, ".env.mainnet");
    
    let envFile;
    if (fs.existsSync(testPath)) {
      envFile = testPath;
    } else if (fs.existsSync(mainnetPath)) {
      envFile = mainnetPath;
    }
    
    if (envFile) {
      const env = fs.readFileSync(envFile, "utf8");
      const vaultMatch = env.match(/VAULT_ADDRESS=(.+)/);
      if (vaultMatch) {
        VAULT_ADDRESS = vaultMatch[1].trim();
        console.log(`📋 Found vault address from ${path.basename(envFile)}: ${VAULT_ADDRESS}\n`);
      }
    }
  }
  
  if (!VAULT_ADDRESS) {
    console.log("❌ Please provide VAULT_ADDRESS:");
    console.log("   node scripts/mainnet/verify-keeper-ready.js <VAULT_ADDRESS>");
    console.log("   OR set VAULT_ADDRESS in .env\n");
    process.exit(1);
  }

  console.log(`📡 Network: ${network}`);
  console.log(`👤 Wallet: ${wallet.address}`);
  console.log(`🏦 Vault: ${VAULT_ADDRESS}`);
  console.log(`📋 ${config.explorer}/address/${VAULT_ADDRESS}\n`);

  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, wallet);

  let allChecksPassed = true;

  // =====================
  // Check 1: Vault Initialization
  // =====================
  console.log("=".repeat(70));
  console.log("Check 1: Vault Initialization");
  console.log("=".repeat(70));

  try {
    const initialized = await vault.initialized();
    if (initialized) {
      console.log(`   ✅ Vault is initialized\n`);
    } else {
      console.log(`   ❌ Vault is NOT initialized`);
      console.log(`      Run: node scripts/mainnet/deposit-tokens.js ${VAULT_ADDRESS}\n`);
      allChecksPassed = false;
    }
  } catch (error) {
    console.log(`   ❌ Error checking initialization: ${error.message}\n`);
    allChecksPassed = false;
  }

  // =====================
  // Check 2: Oracle Configuration
  // =====================
  console.log("=".repeat(70));
  console.log("Check 2: Oracle Configuration");
  console.log("=".repeat(70));

  try {
    const oracleAddress = await vault.priceOracle();
    const oracleFrozen = await vault.oracleFrozen();
    
    if (oracleAddress && oracleAddress !== ethers.ZeroAddress) {
      console.log(`   ✅ Oracle address: ${oracleAddress}`);
      console.log(`   ✅ Oracle frozen: ${oracleFrozen ? "Yes (permanent)" : "No (needs freezing!)"}`);
      
      if (!oracleFrozen) {
        console.log(`   ⚠️  WARNING: Oracle is not frozen!`);
        console.log(`      Run: node scripts/mainnet/resume-deployment.js ${VAULT_ADDRESS}\n`);
        allChecksPassed = false;
      } else {
        console.log();
      }

      // Test oracle
      const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
      const oracle = new ethers.Contract(oracleAddress, oracleArtifact.abi, wallet);
      
      try {
        const price = await oracle.getPrice({ blockTag: "latest" });
        const priceUsd = Number(price) / 1_000_000;
        console.log(`   ✅ Oracle getPrice() works: ${price.toString()} ($${priceUsd.toFixed(9)} USD)\n`);
      } catch (error) {
        console.log(`   ❌ Oracle getPrice() failed: ${error.message}`);
        console.log(`      This may indicate insufficient pool history.\n`);
        allChecksPassed = false;
      }
    } else {
      console.log(`   ❌ Oracle not set!`);
      console.log(`      Run: node scripts/mainnet/resume-deployment.js ${VAULT_ADDRESS}\n`);
      allChecksPassed = false;
    }
  } catch (error) {
    console.log(`   ❌ Error checking oracle: ${error.message}\n`);
    allChecksPassed = false;
  }

  // =====================
  // Check 3: Current Milestone Status
  // =====================
  console.log("=".repeat(70));
  console.log("Check 3: Current Milestone Status");
  console.log("=".repeat(70));

  try {
    // Find current milestone (first unlocked milestone)
    let currentMilestone = 1;
    for (let i = 1; i <= 18; i++) {
      const unlocked = await vault.milestoneUnlocked(i);
      if (!unlocked) {
        currentMilestone = i;
        break;
      }
    }

    console.log(`   Current milestone: ${currentMilestone}\n`);

    // Get milestone status
    try {
      const status = await vault.getMilestoneStatus(currentMilestone, { blockTag: "latest" });
      const priceUsd = Number(status.currentPrice) / 1_000_000;
      const targetUsd = Number(status.priceTarget) / 1_000_000;

      console.log(`   ✅ Milestone ${currentMilestone} Status:`);
      console.log(`      Unlocked: ${status.unlocked}`);
      console.log(`      Good periods: ${status.goodPeriods.toString()}`);
      console.log(`      Price target: ${status.priceTarget.toString()} ($${targetUsd.toFixed(9)} USD)`);
      console.log(`      Current price: ${status.currentPrice.toString()} ($${priceUsd.toFixed(9)} USD)`);
      
      if (status.currentPrice === 0n) {
        console.log(`   ⚠️  WARNING: Current price is 0 (oracle may be failing)\n`);
        allChecksPassed = false;
      } else {
        console.log();
      }
    } catch (error) {
      console.log(`   ❌ Error getting milestone status: ${error.message}\n`);
      allChecksPassed = false;
    }
  } catch (error) {
    console.log(`   ❌ Error checking milestones: ${error.message}\n`);
    allChecksPassed = false;
  }

  // =====================
  // Check 4: Keeper Bot Configuration
  // =====================
  console.log("=".repeat(70));
  console.log("Check 4: Keeper Bot Configuration");
  console.log("=".repeat(70));

  const keeperKey = process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (keeperKey) {
    console.log(`   ✅ KEEPER_PRIVATE_KEY is set\n`);
  } else {
    console.log(`   ❌ KEEPER_PRIVATE_KEY not set in .env`);
    console.log(`      Add: KEEPER_PRIVATE_KEY=0x...\n`);
    allChecksPassed = false;
  }

  // Check if VAULT_ADDRESS is in .env (for keeper auto-detection)
  if (process.env.VAULT_ADDRESS) {
    console.log(`   ✅ VAULT_ADDRESS is set in .env\n`);
  } else {
    console.log(`   ⚠️  VAULT_ADDRESS not in .env (keeper will try to find from deployment files)\n`);
  }

  // Check PERIOD_INTERVAL
  try {
    const periodInterval = await vault.PERIOD_INTERVAL();
    const waitRule = await vault.WAIT_RULE();
    const requiredGoodPeriods = await vault.REQUIRED_GOOD_PERIODS();

    console.log(`   Contract timing configuration:`);
    console.log(`      PERIOD_INTERVAL: ${periodInterval.toString()} seconds`);
    console.log(`      WAIT_RULE: ${waitRule.toString()} seconds (${(Number(waitRule) / 3600).toFixed(1)} hours)`);
    console.log(`      REQUIRED_GOOD_PERIODS: ${requiredGoodPeriods.toString()}\n`);

    const intervalMs = Number(periodInterval) * 1000;
    console.log(`   💡 Keeper should run every ${intervalMs / 1000} seconds (${intervalMs / 60000} minutes)\n`);
  } catch (error) {
    console.log(`   ⚠️  Could not read timing config: ${error.message}\n`);
  }

  // =====================
  // Check 5: Test Keeper Functions
  // =====================
  console.log("=".repeat(70));
  console.log("Check 5: Test Keeper Functions");
  console.log("=".repeat(70));

  try {
    const currentMilestone = 1; // Test with milestone 1
    const canUnlock = await vault.canUnlockMilestone(currentMilestone, { blockTag: "latest" });
    
    console.log(`   ✅ canUnlockMilestone(${currentMilestone}):`);
    console.log(`      Can unlock: ${canUnlock[0]}`);
    console.log(`      Reason: ${canUnlock[1]}\n`);
  } catch (error) {
    console.log(`   ❌ Error testing canUnlockMilestone: ${error.message}\n`);
    allChecksPassed = false;
  }

  // =====================
  // Summary
  // =====================
  console.log("=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));

  if (allChecksPassed) {
    console.log(`   ✅ All checks passed! Keeper bot is ready to run.\n`);
    console.log(`   🚀 Start keeper bot:`);
    console.log(`      node scripts/keeper/keeper.js mainnet --once\n`);
    console.log(`   🔄 Run continuously:`);
    console.log(`      node scripts/keeper/keeper.js mainnet\n`);
  } else {
    console.log(`   ⚠️  Some checks failed. Please fix the issues above before running the keeper.\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Verification failed:");
    console.error(error);
    process.exit(1);
  });

