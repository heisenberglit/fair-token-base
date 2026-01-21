// scripts/mainnet/increase-pool-cardinality.js
// Increase pool observation cardinality to retain longer history
// Usage: node scripts/mainnet/increase-pool-cardinality.js [POOL_ADDRESS] [CARDINALITY]

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔧 Increase Pool Observation Cardinality");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const wallet = getWallet(network);

  const AERODROME_POOL = process.env.AERODROME_POOL_MAINNET || process.env.AERODROME_POOL || process.argv[2];
  const TARGET_CARDINALITY = parseInt(process.argv[3] || process.env.POOL_CARDINALITY || "100", 10);

  if (!AERODROME_POOL) {
    console.log("❌ Please provide pool address:");
    console.log("   node scripts/mainnet/increase-pool-cardinality.js <POOL_ADDRESS> [CARDINALITY]");
    console.log("   OR set AERODROME_POOL_MAINNET in .env\n");
    process.exit(1);
  }

  console.log(`📡 Network: ${network}`);
  console.log(`👤 Wallet: ${wallet.address}`);
  console.log(`🏊 Pool: ${AERODROME_POOL}`);
  console.log(`🎯 Target Cardinality: ${TARGET_CARDINALITY}`);
  console.log(`📋 ${config.explorer}/address/${AERODROME_POOL}\n`);

  // Pool interface
  const poolAbi = [
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external",
  ];

  const poolContract = new ethers.Contract(AERODROME_POOL, poolAbi, wallet);

  try {
    // Check current cardinality
    console.log("=".repeat(70));
    console.log("Current Pool State");
    console.log("=".repeat(70));

    let currentCardinality, currentCardinalityNext;
    try {
      const slot0 = await poolContract.slot0();
      currentCardinality = Number(slot0.observationCardinality);
      currentCardinalityNext = Number(slot0.observationCardinalityNext);
      console.log(`   Current Cardinality: ${currentCardinality}`);
      console.log(`   Cardinality Next: ${currentCardinalityNext}\n`);
    } catch (error) {
      console.log(`   ⚠️  Could not read current cardinality: ${error.message}`);
      console.log(`   Proceeding anyway...\n`);
    }

    // Check if increase is needed
    if (currentCardinalityNext && currentCardinalityNext >= TARGET_CARDINALITY) {
      console.log(`   ✅ Cardinality is already ${currentCardinalityNext} (>= ${TARGET_CARDINALITY})`);
      console.log(`   No increase needed!\n`);
      process.exit(0);
    }

    if (currentCardinalityNext && TARGET_CARDINALITY <= currentCardinalityNext) {
      console.log(`   ⚠️  Target cardinality (${TARGET_CARDINALITY}) is not higher than current next (${currentCardinalityNext})`);
      console.log(`   Please choose a value > ${currentCardinalityNext}\n`);
      process.exit(1);
    }

    // Increase cardinality
    console.log("=".repeat(70));
    console.log("Increasing Observation Cardinality");
    console.log("=".repeat(70));
    console.log(`   Setting cardinality to: ${TARGET_CARDINALITY}`);
    console.log(`   This will allow the pool to store ${TARGET_CARDINALITY} observations.\n`);
    console.log(`   ⚠️  This requires a transaction and will cost gas.\n`);

    const gasPrice = await wallet.provider.getFeeData();
    const nonce = await wallet.provider.getTransactionCount(wallet.address, "latest");

    console.log(`   📤 Sending transaction with nonce: ${nonce}...`);

    const tx = await poolContract.increaseObservationCardinalityNext(
      TARGET_CARDINALITY,
      {
        nonce,
        maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
      }
    );

    console.log(`   📤 Transaction: ${tx.hash}`);
    console.log(`   📋 ${config.explorer}/tx/${tx.hash}`);
    console.log(`   ⏳ Waiting for confirmation...\n`);

    const receipt = await tx.wait();
    console.log(`   ✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`   💰 Gas used: ${receipt.gasUsed.toString()}\n`);

    // Verify the increase
    console.log("=".repeat(70));
    console.log("Verification");
    console.log("=".repeat(70));

    try {
      const slot0 = await poolContract.slot0();
      const newCardinalityNext = Number(slot0.observationCardinalityNext);
      console.log(`   New Cardinality Next: ${newCardinalityNext}`);
      
      if (newCardinalityNext >= TARGET_CARDINALITY) {
        console.log(`   ✅ Cardinality successfully increased!\n`);
        console.log(`   📝 Note: The cardinality will take effect after the next swap.`);
        console.log(`   📝 The pool will gradually fill up to ${newCardinalityNext} observations.\n`);
      } else {
        console.log(`   ⚠️  Cardinality is ${newCardinalityNext}, expected ${TARGET_CARDINALITY}`);
        console.log(`   This may take effect after the next swap.\n`);
      }
    } catch (error) {
      console.log(`   ⚠️  Could not verify: ${error.message}`);
      console.log(`   Check on explorer: ${config.explorer}/address/${AERODROME_POOL}\n`);
    }

    console.log("=".repeat(70));
    console.log("Next Steps");
    console.log("=".repeat(70));
    console.log(`   1. Wait for the pool to accumulate observations`);
    console.log(`   2. Make a few swaps to help build history`);
    console.log(`   3. Check history: node scripts/mainnet/check-pool-observations.js\n`);

  } catch (error) {
    console.log(`\n❌ Error: ${error.message}\n`);
    
    if (error.message.includes("revert")) {
      console.log(`   This might mean:`);
      console.log(`   - Target cardinality is too low`);
      console.log(`   - Pool doesn't support this operation`);
      console.log(`   - Insufficient gas\n`);
    }
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Script failed:");
    console.error(error);
    process.exit(1);
  });

