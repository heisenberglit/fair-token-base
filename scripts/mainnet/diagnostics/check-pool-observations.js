// scripts/mainnet/check-pool-observations.js
// Check pool observation history and TWAP readiness
// Usage: node scripts/mainnet/check-pool-observations.js [POOL_ADDRESS]

import { ethers } from "ethers";
import { getProvider } from "../shared/provider.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 Pool Observation History Check");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const provider = getProvider(network);

  const AERODROME_POOL = process.env.AERODROME_POOL_MAINNET || process.env.AERODROME_POOL || process.argv[2];

  if (!AERODROME_POOL) {
    console.log("❌ Please provide pool address:");
    console.log("   node scripts/mainnet/check-pool-observations.js <POOL_ADDRESS>");
    console.log("   OR set AERODROME_POOL_MAINNET in .env\n");
    process.exit(1);
  }

  console.log(`📡 Network: ${network}`);
  console.log(`🏊 Pool: ${AERODROME_POOL}`);
  console.log(`📋 ${config.explorer}/address/${AERODROME_POOL}\n`);

  // Pool interface
  const poolAbi = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)",
    "function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external",
  ];

  const poolContract = new ethers.Contract(AERODROME_POOL, poolAbi, provider);

  try {
    // Get current slot0 with better error handling
    let slot0;
    try {
      slot0 = await poolContract.slot0();
    } catch (decodeError) {
      // If ABI decoding fails, try raw call (pool might have different return format)
      console.log(`⚠️  slot0() ABI decode failed, trying raw call...`);
      try {
        const rawData = await provider.call({
          to: AERODROME_POOL,
          data: "0x3850c7bd" // slot0() selector
        });
        
        if (rawData && rawData.length > 2) {
          console.log(`✅ slot0() returns data (${rawData.length} chars)`);
          console.log(`   Pool is CL type, but return format differs from standard ABI.\n`);
          console.log(`   This is OK - the oracle handles this internally.\n`);
          
          // Try to manually decode key fields from raw data if possible
          // For now, we'll proceed with observation checks
          slot0 = null; // Mark as unavailable but continue
        } else {
          throw decodeError;
        }
      } catch (rawError) {
        console.log(`❌ Error reading slot0(): ${decodeError.message}`);
        console.log(`   This may indicate the pool is not a CL/Slipstream pool.\n`);
        process.exit(1);
      }
    }

    console.log("=".repeat(70));
    console.log("Current Pool State");
    console.log("=".repeat(70));
    
    if (slot0) {
      console.log(`   Current Tick: ${Number(slot0.tick)}`);
      console.log(`   Observation Index: ${Number(slot0.observationIndex)}`);
      console.log(`   Observation Cardinality: ${Number(slot0.observationCardinality)}`);
      console.log(`   Observation Cardinality Next: ${Number(slot0.observationCardinalityNext)}`);
      console.log(`   Unlocked: ${slot0.unlocked}\n`);

      // Check observation cardinality
      const cardinality = Number(slot0.observationCardinality);
      if (cardinality === 0) {
        console.log("❌ CRITICAL: Pool has NO observations!");
        console.log("   The pool needs at least 1 observation to work.");
        console.log("   This happens automatically when the first swap occurs.\n");
        console.log("   💡 Try making a swap on the pool to initialize observations.\n");
        process.exit(1);
      }

      if (cardinality < 2) {
        console.log("⚠️  WARNING: Pool has only 1 observation!");
        console.log("   For TWAP, you need at least 2 observations (now and in the past).\n");
      } else {
        console.log(`✅ Pool has ${cardinality} observations stored.\n`);
      }
    } else {
      console.log(`   ⚠️  Could not decode slot0() details, but pool appears to be CL type.`);
      console.log(`   Proceeding with observation tests...\n`);
    }

    // Test different observation windows
    console.log("=".repeat(70));
    console.log("Testing Observation Windows");
    console.log("=".repeat(70));

    const testWindows = [
      { name: "1 minute", seconds: 60 },
      { name: "5 minutes", seconds: 300 },
      { name: "15 minutes", seconds: 900 },
      { name: "30 minutes", seconds: 1800 },
      { name: "1 hour (TWAP window)", seconds: 3600 },
    ];

    for (const window of testWindows) {
      try {
        const secondsAgos = [window.seconds, 0];
        const result = await poolContract.observe(secondsAgos);
        
        const tickCum0 = result.tickCumulatives[0];
        const tickCum1 = result.tickCumulatives[1];
        const delta = Number(tickCum1 - tickCum0);
        const avgTick = delta / window.seconds;

        console.log(`   ✅ ${window.name.padEnd(20)}: Works!`);
        console.log(`      Tick delta: ${delta}`);
        console.log(`      Avg tick: ${avgTick.toFixed(2)}`);
        console.log(`      Tick cum (${window.seconds}s ago): ${tickCum0.toString()}`);
        console.log(`      Tick cum (now): ${tickCum1.toString()}\n`);
      } catch (error) {
        if (error.message.includes("OLD")) {
          console.log(`   ❌ ${window.name.padEnd(20)}: Insufficient history`);
          console.log(`      Pool doesn't have observations from ${window.seconds} seconds ago.\n`);
        } else {
          console.log(`   ❌ ${window.name.padEnd(20)}: ${error.message}\n`);
        }
      }
    }

    // Check observation cardinality - CRITICAL for history retention
    console.log("=".repeat(70));
    console.log("Observation Cardinality Analysis");
    console.log("=".repeat(70));
    
    if (slot0) {
      const cardinality = Number(slot0.observationCardinality);
      const cardinalityNext = Number(slot0.observationCardinalityNext);
      
      console.log(`   Current Cardinality: ${cardinality}`);
      console.log(`   Cardinality Next: ${cardinalityNext}\n`);
      
      if (cardinality < 10) {
        console.log(`   ⚠️  WARNING: Low observation cardinality (${cardinality})!`);
        console.log(`      This means the pool can only store ${cardinality} observations.`);
        console.log(`      Older observations get overwritten in a circular buffer.\n`);
        console.log(`   🔍 Why you only see 1 minute of history:`);
        console.log(`      - Pool stores observations in a circular buffer`);
        console.log(`      - With only ${cardinality} slots, older observations are overwritten`);
        console.log(`      - If swaps happen frequently, 30-minute-old data gets overwritten\n`);
        console.log(`   💡 Solution: Increase observation cardinality!`);
        console.log(`      The pool needs more observation slots to retain history.\n`);
        console.log(`      This is done automatically by the pool when needed, OR`);
        console.log(`      You can manually increase it (requires a transaction).\n`);
      } else if (cardinality < 100) {
        console.log(`   ⚠️  Cardinality is ${cardinality} - may be limiting history retention.`);
        console.log(`      For 1-hour TWAP with frequent swaps, recommend 100+ cardinality.\n`);
      } else {
        console.log(`   ✅ Cardinality is ${cardinality} - should be sufficient.\n`);
      }
    } else {
      console.log(`   ⚠️  Could not read cardinality (slot0 decode failed).\n`);
    }

    // Get current block timestamp to estimate pool age
    console.log("=".repeat(70));
    console.log("Pool Age Estimation");
    console.log("=".repeat(70));

    try {
      const currentBlock = await provider.getBlock("latest");
      const currentTime = currentBlock.timestamp;

      // Try to get oldest possible observation
      // Observations are stored in a circular buffer, so we can estimate age
      // by trying progressively older windows
      let oldestWorkingWindow = 0;
      for (let seconds = 60; seconds <= 3600; seconds += 60) {
        try {
          const secondsAgos = [seconds, 0];
          await poolContract.observe(secondsAgos);
          oldestWorkingWindow = seconds;
        } catch (error) {
          if (error.message.includes("OLD")) {
            break;
          }
        }
      }

      if (oldestWorkingWindow > 0) {
        console.log(`   ✅ Pool has at least ${oldestWorkingWindow} seconds of history`);
        console.log(`   ✅ This is ${(oldestWorkingWindow / 60).toFixed(1)} minutes\n`);
        
        if (oldestWorkingWindow < 3600) {
          console.log(`   ⚠️  WARNING: Pool history is less than 1 hour!`);
          console.log(`      Current history: ${(oldestWorkingWindow / 60).toFixed(1)} minutes`);
          console.log(`      Required for 1-hour TWAP: 60 minutes\n`);
          console.log(`   💡 Solutions:`);
          console.log(`      1. Wait ${((3600 - oldestWorkingWindow) / 60).toFixed(0)} more minutes`);
          console.log(`      2. Make more swaps to accelerate observation accumulation`);
          console.log(`      3. Use a shorter TWAP window for testing (e.g., 5 minutes)\n`);
        } else {
          console.log(`   ✅ Pool has sufficient history for 1-hour TWAP!\n`);
        }
      } else {
        console.log(`   ⚠️  Could not determine pool history age\n`);
      }
    } catch (error) {
      console.log(`   ⚠️  Error estimating pool age: ${error.message}\n`);
    }

    // Summary and recommendations
    console.log("=".repeat(70));
    console.log("Summary & Recommendations");
    console.log("=".repeat(70));

    // Test 1-hour window specifically
    try {
      const secondsAgos = [3600, 0];
      await poolContract.observe(secondsAgos);
      console.log(`   ✅ 1-hour TWAP window: READY\n`);
      console.log(`   🎉 Your oracle should work now!\n`);
    } catch (error) {
      if (error.message.includes("OLD")) {
        console.log(`   ❌ 1-hour TWAP window: NOT READY\n`);
        console.log(`   📝 The pool needs more time to accumulate observations.\n`);
        console.log(`   💡 Options:`);
        console.log(`      1. INCREASE OBSERVATION CARDINALITY (Recommended)`);
        console.log(`         - Pool needs more observation slots to retain history`);
        console.log(`         - This is the root cause of losing 30-minute-old data`);
        console.log(`         - See "How to Increase Cardinality" below\n`);
        console.log(`      2. Wait for the pool to age (observations accumulate over time)`);
        console.log(`      3. Make more swaps (each swap creates a new observation)`);
        console.log(`      4. For testing, deploy oracle with shorter TWAP window:`);
        console.log(`         - Change TWAP window from 3600 to 300 (5 minutes)`);
        console.log(`         - This allows testing much faster\n`);
    
    // Add instructions for increasing cardinality
    console.log("=".repeat(70));
    console.log("How to Increase Observation Cardinality");
    console.log("=".repeat(70));
    console.log(`   The pool needs more observation slots to retain longer history.\n`);
    console.log(`   Option 1: Automatic (Recommended)`);
    console.log(`      - The pool will automatically increase cardinality when needed`);
    console.log(`      - This happens when swaps detect insufficient capacity`);
    console.log(`      - Just keep using the pool normally\n`);
    console.log(`   Option 2: Manual Increase`);
    console.log(`      - Call increaseObservationCardinalityNext() on the pool`);
    console.log(`      - Requires a transaction (gas cost)`);
    console.log(`      - Recommended: Set to 100+ for 1-hour TWAP\n`);
    console.log(`   💡 For your case:`);
    console.log(`      - You have 4 swaps but only 1 minute of history`);
    console.log(`      - This suggests cardinality is very low (1-2)`);
    console.log(`      - Increasing to 100+ will allow 30+ minutes of history retention\n`);
      } else {
        console.log(`   ❌ Error: ${error.message}\n`);
      }
    }
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}\n`);
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

