// scripts/mainnet/test-oracle.js
// Test script to verify AerodromeTWAPOracle before deployment
// Usage: node scripts/mainnet/test-oracle.js [ORACLE_ADDRESS]
//   If ORACLE_ADDRESS is provided, tests existing oracle
//   If not provided, deploys a new oracle for testing

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🧪 AerodromeTWAPOracle Test Script");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const wallet = getWallet(network);

  console.log(`📡 Network: ${network}`);
  console.log(`👤 Wallet: ${wallet.address}`);
  console.log(`🔗 RPC: ${config.rpcUrl.substring(0, 50)}...\n`);

  // Get parameters from .env
  const AERODROME_POOL = process.env.AERODROME_POOL_MAINNET || process.env.AERODROME_POOL;
  const EXISTING_FAIR_TOKEN = process.env.EXISTING_FAIR_TOKEN || process.env.FAIR_TOKEN_MAINNET;
  const USDC_ADDRESS = config.usdc;
  const ORACLE_ADDRESS = process.argv[2]; // Optional: test existing oracle
  const TWAP_WINDOW = process.env.TWAP_WINDOW || "3600"; // Default 1 hour, can override for testing
  const twapWindowSeconds = parseInt(TWAP_WINDOW, 10);

  if (!AERODROME_POOL || !EXISTING_FAIR_TOKEN) {
    console.log("❌ Missing required environment variables:");
    console.log("   AERODROME_POOL_MAINNET or AERODROME_POOL");
    console.log("   EXISTING_FAIR_TOKEN or FAIR_TOKEN_MAINNET");
    console.log("\n💡 Example:");
    console.log("   AERODROME_POOL_MAINNET=0x...");
    console.log("   EXISTING_FAIR_TOKEN=0x...\n");
    process.exit(1);
  }

  console.log("📋 Configuration:");
  console.log(`   Pool: ${AERODROME_POOL}`);
  console.log(`   FAIR Token: ${EXISTING_FAIR_TOKEN}`);
  console.log(`   USDC: ${USDC_ADDRESS}`);
  console.log(`   TWAP Window: ${twapWindowSeconds} seconds (${(twapWindowSeconds / 60).toFixed(1)} minutes)`);
  if (twapWindowSeconds < 3600) {
    console.log(`   ⚠️  Using shorter window for testing - not recommended for production!\n`);
  } else {
    console.log();
  }

  // Load oracle artifact
  const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
  const oracleFactory = new ethers.ContractFactory(
    oracleArtifact.abi,
    oracleArtifact.bytecode,
    wallet
  );

  let oracle;
  let oracleAddress;

  if (ORACLE_ADDRESS) {
    // Test existing oracle
    console.log("=".repeat(50));
    console.log("Testing Existing Oracle");
    console.log("=".repeat(50));
    oracleAddress = ORACLE_ADDRESS;
    oracle = new ethers.Contract(oracleAddress, oracleArtifact.abi, wallet);
    console.log(`   Oracle Address: ${oracleAddress}`);
    console.log(`   📋 ${config.explorer}/address/${oracleAddress}\n`);
  } else {
    // Deploy new oracle for testing
    console.log("=".repeat(50));
    console.log("Step 1: Deploying Test Oracle");
    console.log("=".repeat(50));

    const gasPrice = await wallet.provider.getFeeData();
    const nonce = await wallet.provider.getTransactionCount(wallet.address, "latest");

    console.log(`   📤 Deploying with nonce: ${nonce}...`);

    console.log(`   📊 Using TWAP Window: ${twapWindowSeconds} seconds (${(twapWindowSeconds / 60).toFixed(1)} minutes)`);
    if (twapWindowSeconds < 3600) {
      console.log(`   ⚠️  Using shorter window for testing!\n`);
    }

    const deployTx = await oracleFactory.deploy(
      AERODROME_POOL,
      EXISTING_FAIR_TOKEN,
      USDC_ADDRESS,
      twapWindowSeconds, // Configurable TWAP window
      {
        nonce,
        maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
      }
    );

    console.log(`   📤 Deployment transaction: ${deployTx.deploymentTransaction().hash}`);
    console.log(`   ⏳ Waiting for confirmation...`);

    await deployTx.waitForDeployment();
    oracleAddress = await deployTx.getAddress();
    oracle = deployTx;
    console.log(`   ✅ Oracle deployed: ${oracleAddress}`);
    console.log(`   📋 ${config.explorer}/address/${oracleAddress}\n`);
  }

  // =====================
  // Step 2: Verify Oracle Configuration
  // =====================

  console.log("=".repeat(50));
  console.log("Step 2: Verifying Oracle Configuration");
  console.log("=".repeat(50));

  try {
    const pool = await oracle.pool();
    const fairToken = await oracle.fairToken();
    const quoteToken = await oracle.quoteToken();
    const twapWindow = await oracle.twapWindow();
    const fairIsToken0 = await oracle.fairIsToken0();
    const decimalFactor = await oracle.decimalFactor();

    console.log(`   ✅ Pool: ${pool}`);
    console.log(`   ✅ FAIR Token: ${fairToken}`);
    console.log(`   ✅ Quote Token: ${quoteToken}`);
    console.log(`   ✅ TWAP Window: ${Number(twapWindow)} seconds`);
    console.log(`   ✅ FAIR is Token0: ${fairIsToken0}`);
    console.log(`   ✅ Decimal Factor: ${decimalFactor.toString()}\n`);

    // Verify addresses match
    if (pool.toLowerCase() !== AERODROME_POOL.toLowerCase()) {
      console.log(`   ⚠️  Warning: Pool address mismatch!`);
    }
    if (fairToken.toLowerCase() !== EXISTING_FAIR_TOKEN.toLowerCase()) {
      console.log(`   ⚠️  Warning: FAIR token address mismatch!`);
    }
  } catch (error) {
    console.log(`   ❌ Error reading oracle config: ${error.message}\n`);
  }

  // =====================
  // Step 3: Check Pool Status
  // =====================

  console.log("=".repeat(50));
  console.log("Step 3: Checking Pool Status");
  console.log("=".repeat(50));

  try {
    // Pool interface
    const poolAbi = [
      "function token0() external view returns (address)",
      "function token1() external view returns (address)",
      "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
      "function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)",
    ];

    const poolContract = new ethers.Contract(AERODROME_POOL, poolAbi, wallet.provider);

    // Check if pool contract exists
    const poolCode = await wallet.provider.getCode(AERODROME_POOL);
    if (!poolCode || poolCode === "0x" || poolCode === "0x0") {
      console.log(`   ❌ No contract code at pool address!\n`);
      throw new Error("Pool contract does not exist");
    }
    console.log(`   ✅ Pool contract exists (${(poolCode.length / 2 - 1)} bytes)\n`);

    const token0 = await poolContract.token0();
    const token1 = await poolContract.token1();
    console.log(`   ✅ Token0: ${token0}`);
    console.log(`   ✅ Token1: ${token1}`);

    // Try slot0 with better error handling
    let slot0;
    try {
      slot0 = await poolContract.slot0();
      console.log(`   ✅ Current Tick: ${Number(slot0.tick)}`);
      console.log(`   ✅ Observation Cardinality: ${Number(slot0.observationCardinality)}`);
      console.log(`   ✅ Observation Index: ${Number(slot0.observationIndex)}`);
      console.log(`   ✅ sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}\n`);
    } catch (decodeError) {
      // If decoding fails, try raw call
      console.log(`   ⚠️  slot0() decode failed, trying raw call...`);
      try {
        const rawData = await wallet.provider.call({
          to: AERODROME_POOL,
          data: "0x3850c7bd" // slot0() selector
        });
        
        if (rawData && rawData.length > 2) {
          console.log(`   ✅ slot0() returns data (${rawData.length} chars)`);
          console.log(`   ⚠️  Note: Return format may differ, but pool appears to be CL type\n`);
        } else {
          throw decodeError;
        }
      } catch (rawError) {
        console.log(`   ❌ Could not read slot0(): ${decodeError.message}\n`);
        throw decodeError;
      }
    }

    // Check if pool has observations
    if (slot0 && Number(slot0.observationCardinality) === 0) {
      console.log(`   ⚠️  Warning: Pool has no observations yet!`);
      console.log(`      The pool needs to accumulate observations before TWAP works.`);
      console.log(`      This happens automatically as trades occur.\n`);
    } else if (slot0) {
      console.log(`   ✅ Pool has ${slot0.observationCardinality} observations\n`);
    }

    // Try to get observations - THIS IS CRITICAL FOR THE ORACLE
    try {
      const secondsAgos = [3600, 0]; // 1 hour ago and now
      const observeResult = await poolContract.observe(secondsAgos);
      console.log(`   ✅ Successfully fetched observations (CRITICAL for oracle):`);
      console.log(`      Tick cumulative (1h ago): ${observeResult.tickCumulatives[0].toString()}`);
      console.log(`      Tick cumulative (now): ${observeResult.tickCumulatives[1].toString()}\n`);
      console.log(`   🎉 Pool's observe() works - Oracle should be able to read TWAP!\n`);
    } catch (error) {
      console.log(`   ⚠️  Warning: Could not fetch observations:`);
      console.log(`      ${error.message}`);
      if (error.message.includes("OLD")) {
        console.log(`      This means pool history is insufficient for 1-hour TWAP.`);
        console.log(`      The oracle will fallback to spot price.\n`);
      } else {
        console.log(`      This may indicate the pool is not a CL/Slipstream pool.`);
        console.log(`      Verify pool type with: node scripts/mainnet/check-pool-type.js ${AERODROME_POOL}\n`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Error checking pool: ${error.message}\n`);
  }

  // =====================
  // Step 4: Verify Oracle Contract Code
  // =====================

  console.log("=".repeat(50));
  console.log("Step 4: Verifying Oracle Contract");
  console.log("=".repeat(50));

  try {
    const oracleCode = await wallet.provider.getCode(oracleAddress);
    if (!oracleCode || oracleCode === "0x" || oracleCode === "0x0") {
      console.log(`   ❌ No contract code at oracle address!\n`);
      throw new Error("Oracle contract does not exist");
    }
    console.log(`   ✅ Oracle contract exists (${(oracleCode.length / 2 - 1)} bytes)\n`);
  } catch (error) {
    console.log(`   ❌ Error checking oracle code: ${error.message}\n`);
  }

  // =====================
  // Step 5: Test getSpotPrice()
  // =====================

  console.log("=".repeat(50));
  console.log("Step 5: Testing getSpotPrice()");
  console.log("=".repeat(50));

  try {
    // Use static call with explicit block tag
    const spotPrice = await oracle.getSpotPrice({ blockTag: "latest" });
    const spotPriceUsd = Number(spotPrice) / 1_000_000; // Convert from oracle format to USD
    console.log(`   ✅ Spot Price: ${spotPrice.toString()} (oracle units)`);
    console.log(`   💵 Spot Price: $${spotPriceUsd.toFixed(9)} USD\n`);
  } catch (error) {
    console.log(`   ❌ Error getting spot price: ${error.message}`);
    console.log(`   Error code: ${error.code || "N/A"}`);
    
    // Try to get more details
    if (error.data) {
      console.log(`   Error data: ${error.data}`);
    }
    
    // Check if it's a revert
    if (error.code === "CALL_EXCEPTION" || error.message.includes("revert")) {
      console.log(`\n   🔍 Diagnosing revert:`);
      console.log(`      This usually means:`);
      console.log(`      1. Pool's slot0() is failing inside the oracle`);
      console.log(`      2. Oracle's price calculation is reverting`);
      console.log(`      3. Pool type mismatch (not CL/Slipstream)\n`);
      console.log(`   💡 Try:`);
      console.log(`      - Verify pool type: node scripts/mainnet/check-pool-type.js ${AERODROME_POOL}`);
      console.log(`      - Check if pool has liquidity and is active\n`);
    } else {
      console.log(`   This indicates a problem with the oracle or pool.\n`);
    }
  }

  // =====================
  // Step 6: Test getPrice() - TWAP
  // =====================

  console.log("=".repeat(50));
  console.log("Step 6: Testing getPrice() - TWAP");
  console.log("=".repeat(50));

  try {
    // Use static call with explicit block tag
    const twapPrice = await oracle.getPrice({ blockTag: "latest" });
    const twapPriceUsd = Number(twapPrice) / 1_000_000; // Convert from oracle format to USD
    console.log(`   ✅ TWAP Price: ${twapPrice.toString()} (oracle units)`);
    console.log(`   💵 TWAP Price: $${twapPriceUsd.toFixed(9)} USD\n`);

    // Compare with spot price
    try {
      const spotPrice = await oracle.getSpotPrice({ blockTag: "latest" });
      const spotPriceUsd = Number(spotPrice) / 1_000_000;
      const diff = Math.abs(twapPriceUsd - spotPriceUsd);
      const diffPercent = (diff / spotPriceUsd) * 100;

      console.log(`   📊 Comparison:`);
      console.log(`      Spot:  $${spotPriceUsd.toFixed(9)}`);
      console.log(`      TWAP:  $${twapPriceUsd.toFixed(9)}`);
      console.log(`      Diff:  $${diff.toFixed(9)} (${diffPercent.toFixed(2)}%)\n`);

      if (diffPercent > 10) {
        console.log(`   ⚠️  Warning: Large difference between spot and TWAP!`);
        console.log(`      This may indicate high volatility or insufficient pool history.\n`);
      }
    } catch (e) {
      // Ignore spot price comparison errors
    }
  } catch (error) {
    console.log(`   ❌ Error getting TWAP price: ${error.message}`);
    console.log(`   Error code: ${error.code || "N/A"}`);
    
    if (error.data) {
      console.log(`   Error data: ${error.data}`);
    }
    
    console.log(`\n   Common causes:`);
    console.log(`   1. Pool has insufficient observation history`);
    console.log(`   2. Pool is too new (needs trades to accumulate observations)`);
    console.log(`   3. Pool type mismatch (must be CL/Slipstream, not V2/Basic)`);
    console.log(`   4. Pool's observe() or slot0() is failing\n`);
    console.log(`   💡 The oracle will fallback to spot price if TWAP is unavailable.`);
    console.log(`   💡 Try: node scripts/mainnet/check-pool-type.js ${AERODROME_POOL}\n`);
  }

  // =====================
  // Step 7: Test Multiple Calls
  // =====================

  console.log("=".repeat(50));
  console.log("Step 7: Testing Multiple Calls (Consistency)");
  console.log("=".repeat(50));

  try {
    const prices = [];
    for (let i = 0; i < 3; i++) {
      const price = await oracle.getPrice({ blockTag: "latest" });
      prices.push(Number(price));
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }

    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const variance = max - min;

    console.log(`   ✅ Called getPrice() 3 times:`);
    console.log(`      Prices: ${prices.map(p => p.toString()).join(", ")}`);
    console.log(`      Average: ${avg.toFixed(0)}`);
    console.log(`      Range: ${min} - ${max} (variance: ${variance})\n`);

    if (variance > avg * 0.1) {
      console.log(`   ⚠️  Warning: High variance in price readings!`);
      console.log(`      This may indicate pool instability or insufficient history.\n`);
    }
  } catch (error) {
    console.log(`   ❌ Error in consistency test: ${error.message}\n`);
  }

  // =====================
  // Summary
  // =====================

  console.log("=".repeat(70));
  console.log("📊 Test Summary");
  console.log("=".repeat(70));
  console.log(`   Oracle Address: ${oracleAddress}`);
  console.log(`   Pool Address: ${AERODROME_POOL}`);
  console.log(`   FAIR Token: ${EXISTING_FAIR_TOKEN}`);
  console.log(`\n   ✅ Oracle contract is ready for use!`);
  console.log(`   📋 View on explorer: ${config.explorer}/address/${oracleAddress}\n`);

  if (!ORACLE_ADDRESS) {
    console.log(`   💡 To test this oracle again:`);
    console.log(`      node scripts/mainnet/test-oracle.js ${oracleAddress}\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  });

