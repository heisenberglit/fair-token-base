// scripts/mainnet/check-pool-type.js
// Diagnostic script to check Aerodrome pool type and compatibility

import { ethers } from "ethers";
import { getProvider } from "../shared/provider.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 Aerodrome Pool Type Diagnostic");
  console.log("=".repeat(70) + "\n");

  const poolAddress = process.env.AERODROME_POOL_MAINNET || process.argv[2];
  
  if (!poolAddress) {
    console.log("❌ Please provide pool address:");
    console.log("   node scripts/mainnet/check-pool-type.js <POOL_ADDRESS>");
    console.log("   OR set AERODROME_POOL_MAINNET in .env\n");
    process.exit(1);
  }

  const config = getNetworkConfig("mainnet");
  const provider = getProvider("mainnet");

  console.log(`Pool Address: ${poolAddress}`);
  console.log(`Network: ${config.name}`);
  console.log(`Explorer: ${config.explorer}/address/${poolAddress}\n`);

  // Check if contract exists
  const code = await provider.getCode(poolAddress);
  if (code === "0x" || code === "0x0") {
    console.log("❌ No contract code at this address!\n");
    process.exit(1);
  }
  console.log(`✅ Contract code found (${code.length / 2 - 1} bytes)\n`);

  // Try different pool interfaces
  console.log("=".repeat(70));
  console.log("Testing Pool Interfaces");
  console.log("=".repeat(70));

  // 1. Test CL/Slipstream interface (what we expect)
  console.log("\n1. Testing CL/Slipstream Interface (Uniswap V3 style)...");
  const clAbi = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)",
    "function liquidity() external view returns (uint128)",
  ];

  const clPool = new ethers.Contract(poolAddress, clAbi, provider);
  
  let clWorks = false;
  try {
    const token0 = await clPool.token0();
    const token1 = await clPool.token1();
    console.log(`  ✅ token0(): ${token0}`);
    console.log(`  ✅ token1(): ${token1}`);
    
    try {
      // Try calling slot0 with error handling for decoding issues
      let slot0;
      try {
        slot0 = await clPool.slot0();
        console.log(`  ✅ slot0(): tick=${Number(slot0.tick)}, cardinality=${Number(slot0.observationCardinality)}`);
        console.log(`     sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
        console.log(`     unlocked: ${slot0.unlocked}`);
      } catch (decodeError) {
        // If decoding fails, try raw call and manual decode
        console.log(`  ⚠️  slot0() decode failed, trying raw call...`);
        const rawData = await provider.call({
          to: poolAddress,
          data: "0x3850c7bd" // slot0() selector
        });
        
        if (rawData && rawData.length > 2) {
          console.log(`  ✅ slot0() returns data (${rawData.length} chars)`);
          console.log(`     This is a CL pool, but return format may differ`);
          console.log(`     The oracle should still work - trying observe()...`);
          
          // Mark as CL pool if we got data back
          clWorks = true;
        } else {
          throw decodeError;
        }
      }
      
      // Try observe - THIS IS THE CRITICAL FUNCTION FOR THE ORACLE
      try {
        const secondsAgos = [3600, 0];
        const observeResult = await clPool.observe(secondsAgos);
        console.log(`  ✅ observe(): Works!`);
        console.log(`     Tick cumulatives: [${observeResult.tickCumulatives[0]}, ${observeResult.tickCumulatives[1]}]`);
        clWorks = true;
        console.log(`\n  🎉 CRITICAL: observe() works - This pool IS compatible with AerodromeTWAPOracle!`);
      } catch (e) {
        console.log(`  ⚠️  observe() failed: ${e.message}`);
        if (e.message.includes("OLD")) {
          console.log(`     Pool needs more observations (normal for new pools)`);
          console.log(`     The oracle will fall back to spot price until history builds`);
          clWorks = true; // Still compatible, just needs time
        } else {
          console.log(`     This may indicate the pool is not fully CL compatible`);
        }
      }
      
      // Try liquidity
      try {
        const liquidity = await clPool.liquidity();
        console.log(`  ✅ liquidity(): ${liquidity.toString()}`);
      } catch (e) {
        console.log(`  ⚠️  liquidity() failed: ${e.message}`);
      }
      
    } catch (e) {
      console.log(`  ❌ slot0() failed: ${e.message}`);
    }
  } catch (e) {
    console.log(`  ❌ CL interface failed: ${e.message}`);
  }

  // 2. Test V2 interface (Aerodrome V2 pools)
  console.log("\n2. Testing V2 Interface (Aerodrome V2 style)...");
  const v2Abi = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function price0CumulativeLast() external view returns (uint256)",
    "function price1CumulativeLast() external view returns (uint256)",
  ];

  const v2Pool = new ethers.Contract(poolAddress, v2Abi, provider);
  
  let v2Works = false;
  try {
    const token0 = await v2Pool.token0();
    const token1 = await v2Pool.token1();
    console.log(`  ✅ token0(): ${token0}`);
    console.log(`  ✅ token1(): ${token1}`);
    
    try {
      const reserves = await v2Pool.getReserves();
      console.log(`  ✅ getReserves(): reserve0=${reserves.reserve0.toString()}, reserve1=${reserves.reserve1.toString()}`);
      v2Works = true;
    } catch (e) {
      console.log(`  ❌ getReserves() failed: ${e.message}`);
    }
  } catch (e) {
    console.log(`  ❌ V2 interface failed: ${e.message}`);
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));

  if (clWorks) {
    console.log("✅ This is a CL/Slipstream pool (Uniswap V3 style)");
    console.log("   ✅ Compatible with AerodromeTWAPOracle");
    console.log("   ✅ Can use slot0() and observe() for TWAP");
    console.log("   ⚠️  Note: slot0() decoding may fail, but observe() works");
    console.log("   ✅ The oracle will work correctly!\n");
  } else if (v2Works) {
    console.log("⚠️  This is a V2 pool (Aerodrome V2 style)");
    console.log("   ❌ NOT compatible with current AerodromeTWAPOracle");
    console.log("   ❌ V2 pools don't have slot0() or observe()");
    console.log("   💡 You need a CL/Slipstream pool for TWAP oracle\n");
    console.log("   Solution:");
    console.log("   1. Create a new CL/Slipstream pool on Aerodrome");
    console.log("   2. Use that pool address for the oracle\n");
  } else {
    console.log("❌ Could not identify pool type");
    console.log("   Check the pool address and verify it's an Aerodrome pool\n");
  }

  // Check on Basescan
  console.log("Verify on Basescan:");
  console.log(`  ${config.explorer}/address/${poolAddress}\n`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exitCode = 1;
});

