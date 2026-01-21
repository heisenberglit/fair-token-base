// scripts/mainnet/check-price-after-swap.js
// Check both spot and TWAP price to see if swap moved the price
// Usage: node scripts/mainnet/check-price-after-swap.js [VAULT_ADDRESS]

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const wallet = getWallet(network);

  let VAULT_ADDRESS = process.argv[2] || process.env.VAULT_ADDRESS;
  
  // Auto-detect
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
      }
    }
  }

  if (!VAULT_ADDRESS) {
    console.log("❌ Please provide VAULT_ADDRESS\n");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(70));
  console.log("📊 Price Check (Spot vs TWAP)");
  console.log("=".repeat(70) + "\n");

  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, wallet);

  const oracleAddress = await vault.priceOracle();
  const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
  const oracle = new ethers.Contract(oracleAddress, oracleArtifact.abi, wallet);

  // Get both prices
  const spotPrice = await oracle.getSpotPrice({ blockTag: "latest" });
  const twapPrice = await oracle.getPrice({ blockTag: "latest" });

  const spotPriceUsd = Number(spotPrice) / 1_000_000;
  const twapPriceUsd = Number(twapPrice) / 1_000_000;

  console.log("Current Prices:");
  console.log(`  Spot Price: ${spotPrice.toString()} oracle units ($${spotPriceUsd.toFixed(9)} USD)`);
  console.log(`  TWAP Price: ${twapPrice.toString()} oracle units ($${twapPriceUsd.toFixed(9)} USD)\n`);

  const diff = Math.abs(spotPriceUsd - twapPriceUsd);
  const diffPercent = (diff / twapPriceUsd) * 100;

  console.log("Analysis:");
  if (spotPriceUsd > twapPriceUsd) {
    console.log(`  ✅ Spot price (${spotPriceUsd.toFixed(9)}) is HIGHER than TWAP (${twapPriceUsd.toFixed(9)})`);
    console.log(`     This means your swap moved the price up!`);
    console.log(`     TWAP will catch up over the next hour as it averages the new price.\n`);
  } else if (spotPriceUsd < twapPriceUsd) {
    console.log(`  ⚠️  Spot price (${spotPriceUsd.toFixed(9)}) is LOWER than TWAP (${twapPriceUsd.toFixed(9)})`);
    console.log(`     This is unusual - may indicate price moved down or TWAP is stale.\n`);
  } else {
    console.log(`  ℹ️  Spot and TWAP are the same (${spotPriceUsd.toFixed(9)})\n`);
  }

  if (diffPercent > 5) {
    console.log(`  ⚠️  Large difference (${diffPercent.toFixed(2)}%) between spot and TWAP`);
    console.log(`     This is normal after a swap - TWAP takes time to update.\n`);
  }

  // Check milestone target
  const milestoneStatus = await vault.getMilestoneStatus(1, { blockTag: "latest" });
  const targetUsd = Number(milestoneStatus.priceTarget) / 1_000_000;

  console.log("Milestone 1 Target:");
  console.log(`  Target: ${milestoneStatus.priceTarget.toString()} oracle units ($${targetUsd.toFixed(9)} USD)\n`);

  if (spotPriceUsd >= targetUsd) {
    console.log(`  ✅ Spot price is above target!`);
    console.log(`     TWAP will reach target as it averages the new price.\n`);
    console.log(`  💡 The keeper uses TWAP, so it may take up to 1 hour for TWAP to catch up.`);
    console.log(`     You can wait, or make more swaps to accelerate the TWAP update.\n`);
  } else {
    const needed = targetUsd - spotPriceUsd;
    const neededPercent = (needed / spotPriceUsd * 100).toFixed(2);
    console.log(`  ⚠️  Spot price is still below target by $${needed.toFixed(9)} (${neededPercent}%)`);
    console.log(`     You need to swap more to increase the price.\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:");
    console.error(error);
    process.exit(1);
  });

