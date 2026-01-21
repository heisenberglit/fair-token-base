// scripts/mainnet/check-spot-price.js
// Check current spot price from the pool (real-time)
// Usage: node scripts/mainnet/check-spot-price.js

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("📊 Real-Time Spot Price Check");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const wallet = getWallet(network);

  const VAULT_ADDRESS = process.env.VAULT_ADDRESS;
  if (!VAULT_ADDRESS) {
    console.log("❌ Please set VAULT_ADDRESS in .env\n");
    process.exit(1);
  }

  console.log(`📡 Network: ${network}`);
  console.log(`🏦 Vault: ${VAULT_ADDRESS}\n`);

  // Get vault and oracle
  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, wallet);

  const oracleAddress = await vault.priceOracle();
  const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
  const oracle = new ethers.Contract(oracleAddress, oracleArtifact.abi, wallet);

  const poolAddress = await oracle.pool();

  console.log("=".repeat(70));
  console.log("Contract Information");
  console.log("=".repeat(70));
  console.log(`  Oracle: ${oracleAddress}`);
  console.log(`  Pool: ${poolAddress}\n`);

  // Get TWAP price
  console.log("=".repeat(70));
  console.log("TWAP Price (Used by Keeper)");
  console.log("=".repeat(70));
  
  try {
    const twapPrice = await oracle.getPrice();
    const twapPriceUsd = Number(twapPrice) / 1_000_000;
    console.log(`  TWAP Price: ${twapPrice.toString()} oracle units`);
    console.log(`  TWAP Price: $${twapPriceUsd.toFixed(9)} USD\n`);
  } catch (error) {
    console.log(`  ❌ Could not read TWAP: ${error.message}\n`);
  }

  // Get Spot price
  console.log("=".repeat(70));
  console.log("Spot Price (Real-Time from Pool)");
  console.log("=".repeat(70));
  
  try {
    const spotPrice = await oracle.getSpotPrice();
    const spotPriceUsd = Number(spotPrice) / 1_000_000;
    console.log(`  Spot Price: ${spotPrice.toString()} oracle units`);
    console.log(`  Spot Price: $${spotPriceUsd.toFixed(9)} USD\n`);
  } catch (error) {
    console.log(`  ⚠️  Oracle.getSpotPrice() failed: ${error.message}`);
    console.log(`  Trying direct pool access...\n`);

    // Try to read directly from pool
    try {
      const poolAbi = [
        "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
        "function token0() external view returns (address)",
        "function token1() external view returns (address)",
      ];

      const pool = new ethers.Contract(poolAddress, poolAbi, wallet.provider);
      
      const slot0 = await pool.slot0();
      const token0 = await pool.token0();
      const token1 = await pool.token1();
      
      const fairToken = await oracle.fairToken();
      const fairIsToken0 = await oracle.fairIsToken0();

      console.log(`  sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
      console.log(`  Current tick: ${slot0.tick}\n`);

      // Calculate price from sqrtPriceX96
      // price = (sqrtPriceX96 / 2^96)^2
      const Q96 = 2n ** 96n;
      const sqrtPrice = Number(slot0.sqrtPriceX96) / Number(Q96);
      let price = sqrtPrice * sqrtPrice;

      // If FAIR is token1, we need to invert the price
      // Uniswap V3 price is always token1/token0
      if (!fairIsToken0) {
        price = 1 / price;
      }

      // Adjust for decimals (USDC has 6 decimals, FAIR has 18)
      const decimalAdjustment = 10 ** 12; // 18 - 6 = 12
      price = price * decimalAdjustment;

      // Convert to oracle units (multiply by 1,000,000)
      const priceInOracleUnits = price * 1_000_000;

      console.log("=".repeat(70));
      console.log("Calculated Spot Price");
      console.log("=".repeat(70));
      console.log(`  Token0: ${token0}`);
      console.log(`  Token1: ${token1}`);
      console.log(`  FAIR is token0: ${fairIsToken0}`);
      console.log(`  Raw price: ${price.toFixed(12)} USDC per FAIR`);
      console.log(`  Spot Price: ${priceInOracleUnits.toFixed(2)} oracle units`);
      console.log(`  Spot Price: $${price.toFixed(9)} USD\n`);

    } catch (poolError) {
      console.log(`  ❌ Could not read from pool: ${poolError.message}\n`);
    }
  }

  // Get milestone status
  console.log("=".repeat(70));
  console.log("Milestone Status");
  console.log("=".repeat(70));
  
  try {
    // Find current milestone
    let currentMilestone = 0;
    for (let i = 1; i <= 18; i++) {
      const unlocked = await vault.milestoneUnlocked(i);
      if (!unlocked) {
        currentMilestone = i;
        break;
      }
    }

    if (currentMilestone === 0) {
      console.log(`  🎉 All milestones unlocked!\n`);
    } else {
      console.log(`  Current Milestone: ${currentMilestone}`);
      
      const status = await vault.getMilestoneStatus(currentMilestone);
      console.log(`  Target Price: ${status.priceTarget} oracle units`);
      console.log(`  Current Price (TWAP): ${status.currentPrice} oracle units`);
      
      const goodCount = status.goodPeriods ?? status.goodHours ?? status[1];
      console.log(`  Good Periods: ${goodCount}`);
      console.log(`  Unlocked: ${status.unlocked}\n`);

      // Check if can unlock
      const canUnlock = await vault.canUnlockMilestone(currentMilestone);
      console.log(`  Can Unlock: ${canUnlock.canUnlock}`);
      console.log(`  Reason: ${canUnlock.reason}\n`);
    }
  } catch (error) {
    console.log(`  ⚠️  Could not get milestone status: ${error.message}\n`);
  }

  console.log("=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));
  console.log(`  💡 TWAP updates slowly (10-30 min average)`);
  console.log(`  💡 Spot price updates immediately after swaps`);
  console.log(`  💡 Keeper uses TWAP price, not spot price`);
  console.log(`  💡 Wait 20-30 minutes after swaps for TWAP to catch up\n`);
  
  console.log(`  📊 Check pool on DEX analytics:`);
  console.log(`     GeckoTerminal: https://www.geckoterminal.com/base/pools/${poolAddress}`);
  console.log(`     DEXScreener: https://dexscreener.com/base/${poolAddress}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:");
    console.error(error);
    process.exit(1);
  });