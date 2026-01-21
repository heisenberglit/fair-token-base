// scripts/mainnet/compare-oracle-ui-price.js
// Compare oracle price with UI/spot price to diagnose discrepancies
// Usage: node scripts/mainnet/compare-oracle-ui-price.js [VAULT_ADDRESS]

import { ethers } from "ethers";
import { getWallet, getProvider } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 Oracle vs UI Price Comparison");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const wallet = getWallet(network);
  const provider = getProvider(network);

  // Try to get vault address from multiple sources
  let VAULT_ADDRESS = process.argv[2] || process.env.VAULT_ADDRESS;
  
  // If not provided, try to find from deployment files
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
    console.log("   node scripts/mainnet/compare-oracle-ui-price.js <VAULT_ADDRESS>");
    console.log("   OR set VAULT_ADDRESS in .env\n");
    process.exit(1);
  }

  console.log(`📡 Network: ${network}`);
  console.log(`🏦 Vault: ${VAULT_ADDRESS}\n`);

  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, wallet);

  try {
    // Get oracle address
    const oracleAddress = await vault.priceOracle();
    if (!oracleAddress || oracleAddress === ethers.ZeroAddress) {
      console.log("❌ Oracle not set on vault!\n");
      process.exit(1);
    }

    console.log("=".repeat(70));
    console.log("Oracle Configuration");
    console.log("=".repeat(70));
    console.log(`   Oracle: ${oracleAddress}`);
    console.log(`   📋 ${config.explorer}/address/${oracleAddress}\n`);

    const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
    const oracle = new ethers.Contract(oracleAddress, oracleArtifact.abi, wallet);

    // Get oracle configuration
    const poolAddress = await oracle.pool();
    const fairToken = await oracle.fairToken();
    const quoteToken = await oracle.quoteToken();
    const twapWindow = await oracle.twapWindow();
    const fairIsToken0 = await oracle.fairIsToken0();

    console.log("=".repeat(70));
    console.log("Pool Configuration");
    console.log("=".repeat(70));
    console.log(`   Pool: ${poolAddress}`);
    console.log(`   📋 ${config.explorer}/address/${poolAddress}`);
    console.log(`   FAIR Token: ${fairToken}`);
    console.log(`   Quote Token: ${quoteToken}`);
    console.log(`   TWAP Window: ${Number(twapWindow)} seconds`);
    console.log(`   FAIR is Token0: ${fairIsToken0}\n`);

    // Get prices from oracle
    console.log("=".repeat(70));
    console.log("Oracle Prices");
    console.log("=".repeat(70));

    const twapPrice = await oracle.getPrice({ blockTag: "latest" });
    const spotPrice = await oracle.getSpotPrice({ blockTag: "latest" });

    const twapPriceUsd = Number(twapPrice) / 1_000_000;
    const spotPriceUsd = Number(spotPrice) / 1_000_000;

    console.log(`   TWAP Price: ${twapPrice.toString()} (oracle units)`);
    console.log(`   TWAP Price: $${twapPriceUsd.toFixed(9)} USD per FAIR`);
    console.log(`   Spot Price: ${spotPrice.toString()} (oracle units)`);
    console.log(`   Spot Price: $${spotPriceUsd.toFixed(9)} USD per FAIR\n`);

    // Get direct pool price
    console.log("=".repeat(70));
    console.log("Direct Pool Price (from slot0)");
    console.log("=".repeat(70));

    const poolAbi = [
      "function token0() external view returns (address)",
      "function token1() external view returns (address)",
      "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    ];

    const poolContract = new ethers.Contract(poolAddress, poolAbi, provider);

    try {
      const slot0 = await poolContract.slot0();
      const tick = Number(slot0.tick);
      const sqrtPriceX96 = slot0.sqrtPriceX96;

      console.log(`   Current Tick: ${tick}`);
      console.log(`   sqrtPriceX96: ${sqrtPriceX96.toString()}\n`);

      // Calculate price from tick
      // Price = 1.0001^tick
      // For negative ticks, price = 1 / (1.0001^abs(tick))
      const absTick = Math.abs(tick);
      const priceFromTick = Math.pow(1.0001, absTick);
      
      if (tick < 0) {
        const price = 1 / priceFromTick;
        console.log(`   Price from tick: ${price.toFixed(18)} (token0 per token1)`);
        
        if (fairIsToken0) {
          // FAIR is token0, USDC is token1
          // Price is FAIR per USDC, we need USDC per FAIR
          const usdcPerFair = price;
          console.log(`   USDC per FAIR: ${usdcPerFair.toFixed(9)}`);
          console.log(`   USD per FAIR: $${usdcPerFair.toFixed(9)}`);
        } else {
          // FAIR is token1, USDC is token0
          // Price is USDC per FAIR (already what we want)
          const usdcPerFair = 1 / price;
          console.log(`   USDC per FAIR: ${usdcPerFair.toFixed(9)}`);
          console.log(`   USD per FAIR: $${usdcPerFair.toFixed(9)}`);
        }
      } else {
        const price = priceFromTick;
        console.log(`   Price from tick: ${price.toFixed(18)} (token0 per token1)`);
        
        if (fairIsToken0) {
          // FAIR is token0, USDC is token1
          // Price is FAIR per USDC, we need USDC per FAIR
          const usdcPerFair = 1 / price;
          console.log(`   USDC per FAIR: ${usdcPerFair.toFixed(9)}`);
          console.log(`   USD per FAIR: $${usdcPerFair.toFixed(9)}`);
        } else {
          // FAIR is token1, USDC is token0
          // Price is USDC per FAIR (already what we want)
          const usdcPerFair = price;
          console.log(`   USDC per FAIR: ${usdcPerFair.toFixed(9)}`);
          console.log(`   USD per FAIR: $${usdcPerFair.toFixed(9)}`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Could not read pool slot0: ${error.message}\n`);
    }

    // Calculate what UI should show
    console.log("=".repeat(70));
    console.log("Expected UI Display");
    console.log("=".repeat(70));

    if (twapPriceUsd > 0) {
      const fairPerUsdc = 1 / twapPriceUsd;
      console.log(`   Based on Oracle TWAP:`);
      console.log(`   1 USDC = ${fairPerUsdc.toFixed(2)} FAIR`);
      console.log(`   1 FAIR = $${twapPriceUsd.toFixed(9)} USD\n`);
    }

    if (spotPriceUsd > 0) {
      const fairPerUsdc = 1 / spotPriceUsd;
      console.log(`   Based on Oracle Spot:`);
      console.log(`   1 USDC = ${fairPerUsdc.toFixed(2)} FAIR`);
      console.log(`   1 FAIR = $${spotPriceUsd.toFixed(9)} USD\n`);
    }

    // Check if there's a discrepancy
    console.log("=".repeat(70));
    console.log("Discrepancy Analysis");
    console.log("=".repeat(70));

    // If UI shows 1 USDC = 108,038.53 HONEST
    const uiFairPerUsdc = 108038.53;
    const uiUsdPerFair = 1 / uiFairPerUsdc;
    const uiOracleUnits = uiUsdPerFair * 1_000_000;

    console.log(`   UI shows: 1 USDC = ${uiFairPerUsdc.toFixed(2)} FAIR`);
    console.log(`   UI implies: 1 FAIR = $${uiUsdPerFair.toFixed(9)} USD`);
    console.log(`   UI in oracle units: ${uiOracleUnits.toFixed(0)}\n`);

    console.log(`   Oracle shows: ${twapPrice.toString()} (oracle units)`);
    console.log(`   Oracle = $${twapPriceUsd.toFixed(9)} USD per FAIR\n`);

    const ratio = Number(twapPrice) / uiOracleUnits;
    console.log(`   Ratio: Oracle is ${ratio.toFixed(2)}x the UI price\n`);

    if (ratio > 1.1 || ratio < 0.9) {
      console.log(`   ⚠️  SIGNIFICANT DISCREPANCY DETECTED!\n`);
      console.log(`   Possible causes:`);
      console.log(`   1. Oracle is reading from a different pool than the UI`);
      console.log(`   2. Oracle has wrong token addresses configured`);
      console.log(`   3. Pool address mismatch`);
      console.log(`   4. TWAP vs spot price difference (normal if pool is volatile)\n`);
      console.log(`   💡 Verify:`);
      console.log(`      - Check if pool address matches: ${poolAddress}`);
      console.log(`      - Check if UI is using the same pool`);
      console.log(`      - Check if FAIR token address matches: ${fairToken}\n`);
    } else {
      console.log(`   ✅ Prices are reasonably close (within 10%)\n`);
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

