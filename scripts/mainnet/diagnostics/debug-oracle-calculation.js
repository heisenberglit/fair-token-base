// scripts/mainnet/debug-oracle-calculation.js
// Debug the oracle price calculation step by step
// Usage: node scripts/mainnet/debug-oracle-calculation.js [VAULT_ADDRESS]

import { ethers } from "ethers";
import { getWallet, getProvider } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 Oracle Calculation Debug");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const provider = getProvider(network);
  const wallet = getWallet(network);

  let VAULT_ADDRESS = process.argv[2] || process.env.VAULT_ADDRESS;
  
  if (!VAULT_ADDRESS) {
    console.log("❌ Please provide VAULT_ADDRESS\n");
    process.exit(1);
  }

  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, wallet);

  const oracleAddress = await vault.priceOracle();
  const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
  const oracle = new ethers.Contract(oracleAddress, oracleArtifact.abi, wallet);

  // Get oracle config
  const poolAddress = await oracle.pool();
  const fairToken = await oracle.fairToken();
  const quoteToken = await oracle.quoteToken();
  const twapWindow = await oracle.twapWindow();
  const fairIsToken0 = await oracle.fairIsToken0();
  const decimalFactor = await oracle.decimalFactor();

  console.log("Oracle Configuration:");
  console.log(`  Pool: ${poolAddress}`);
  console.log(`  FAIR Token: ${fairToken}`);
  console.log(`  Quote Token: ${quoteToken}`);
  console.log(`  FAIR is Token0: ${fairIsToken0}`);
  console.log(`  Decimal Factor: ${decimalFactor.toString()}\n`);

  // Get pool slot0 directly
  const poolAbi = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  ];

  const poolContract = new ethers.Contract(poolAddress, poolAbi, provider);

  let slot0;
  try {
    slot0 = await poolContract.slot0();
  } catch (error) {
    // Try raw call
    const rawData = await provider.call({
      to: poolAddress,
      data: "0x3850c7bd" // slot0() selector
    });
    console.log("⚠️  slot0() decode failed, using raw data\n");
    // Can't decode, but we can still work with tick from oracle
  }

  // Get prices
  const twapPrice = await oracle.getPrice({ blockTag: "latest" });
  const spotPrice = await oracle.getSpotPrice({ blockTag: "latest" });

  console.log("=".repeat(70));
  console.log("Oracle Output");
  console.log("=".repeat(70));
  console.log(`  TWAP Price: ${twapPrice.toString()} (oracle units)`);
  console.log(`  Spot Price: ${spotPrice.toString()} (oracle units)`);
  console.log(`  TWAP USD: $${(Number(twapPrice) / 1_000_000).toFixed(9)}`);
  console.log(`  Spot USD: $${(Number(spotPrice) / 1_000_000).toFixed(9)}\n`);

  // Manual calculation from slot0 if available
  if (slot0) {
    console.log("=".repeat(70));
    console.log("Manual Calculation from slot0");
    console.log("=".repeat(70));
    
    const sqrtPriceX96 = slot0.sqrtPriceX96;
    const tick = Number(slot0.tick);
    
    console.log(`  sqrtPriceX96: ${sqrtPriceX96.toString()}`);
    console.log(`  tick: ${tick}\n`);

    // Calculate price manually
    // sqrtPriceX96 = sqrt(token1/token0) * 2^96
    // price(token0 in token1) = (sqrtPriceX96 / 2^96)^2
    
    const sqrtPrice = Number(sqrtPriceX96);
    const Q96 = 2n ** 96n;
    const sqrtPriceFloat = sqrtPrice / Number(Q96);
    const rawPrice = sqrtPriceFloat * sqrtPriceFloat;
    
    console.log(`  sqrtPrice (float): ${sqrtPriceFloat.toExponential()}`);
    console.log(`  rawPrice (token0 in token1): ${rawPrice.toExponential()}\n`);

    if (fairIsToken0) {
      // FAIR is token0, USDC is token1
      // rawPrice = USDC per FAIR (what we want!)
      console.log(`  FAIR is token0, so rawPrice = USDC per FAIR`);
      console.log(`  Raw price: ${rawPrice.toFixed(18)} USDC per FAIR`);
      console.log(`  Raw price USD: $${rawPrice.toFixed(18)} per FAIR\n`);
      
      // Apply decimal factor
      const priceWithDecimals = rawPrice * Number(decimalFactor);
      const priceInOracleUnits = priceWithDecimals / (2n ** 192n);
      
      console.log(`  After decimal factor (${decimalFactor.toString()}):`);
      console.log(`    ${rawPrice.toExponential()} * ${decimalFactor.toString()} = ${priceWithDecimals.toExponential()}`);
      console.log(`    Divided by 2^192: ${priceInOracleUnits.toFixed(0)} (oracle units)\n`);
      
      // Expected: if rawPrice = 0.00000926, then:
      // oracle units = 0.00000926 * 1,000,000 = 9.26
      const expectedOracleUnits = rawPrice * 1_000_000;
      console.log(`  Expected oracle units (rawPrice * 1e6): ${expectedOracleUnits.toFixed(2)}`);
      console.log(`  Actual oracle units: ${twapPrice.toString()}`);
      console.log(`  Ratio: ${(Number(twapPrice) / expectedOracleUnits).toFixed(2)}x\n`);
      
      // Check if decimal factor is causing the issue
      const decimalFactorExpected = 10n ** 21n; // 9 + 18 - 6 = 21
      console.log(`  Decimal factor check:`);
      console.log(`    Expected: 10^21 = ${decimalFactorExpected.toString()}`);
      console.log(`    Actual: ${decimalFactor.toString()}`);
      console.log(`    Match: ${decimalFactor.toString() === decimalFactorExpected.toString() ? "✅" : "❌"}\n`);
      
      // The issue: we're multiplying by 10^21 but should only multiply by 10^6 for oracle format
      // Oracle format wants: usd_price * 1,000,000
      // But we're doing: rawPrice * 10^21 / 2^192
      // This is wrong! We need: rawPrice * 10^6 (for oracle format) * 10^(18-6) (for decimals)
      // = rawPrice * 10^6 * 10^12 = rawPrice * 10^18
      // But we're using 10^21, which is 10^3 = 1000x too much!
      
      console.log(`  🔍 ISSUE DETECTED:`);
      console.log(`     Oracle format wants: usd_price * 1,000,000`);
      console.log(`     But we're multiplying by decimalFactor = 10^21`);
      console.log(`     Then dividing by 2^192`);
      console.log(`     This creates a mismatch!\n`);
      
      // Correct calculation should be:
      // price = (sqrtPrice^2 / 2^192) * 10^6 * 10^(fairDec - quoteDec)
      // = (sqrtPrice^2 / 2^192) * 10^(6 + fairDec - quoteDec)
      // = (sqrtPrice^2 / 2^192) * 10^(6 + 18 - 6) = (sqrtPrice^2 / 2^192) * 10^18
      // But we're using 10^21, which is 10^3 = 1000x too much!
      
      const correctDecimalFactor = 10n ** 18n; // 6 (oracle format) + 18 - 6 (decimals) = 18
      console.log(`  💡 Correct decimal factor should be: 10^18 = ${correctDecimalFactor.toString()}`);
      console.log(`     Current: 10^21 = ${decimalFactor.toString()}`);
      console.log(`     Difference: ${(Number(decimalFactor) / Number(correctDecimalFactor)).toFixed(0)}x (1000x too high!)\n`);
      
    } else {
      console.log(`  FAIR is token1, so rawPrice = FAIR per USDC`);
      console.log(`  Need to invert: USDC per FAIR = 1 / rawPrice\n`);
    }
  }

  // Check what UI should show
  console.log("=".repeat(70));
  console.log("Expected vs Actual");
  console.log("=".repeat(70));
  console.log(`  UI shows: 1 USDC = 108,038.53 HONEST`);
  console.log(`  This means: 1 HONEST = $0.00000926 USD`);
  console.log(`  In oracle units: 9.26\n`);
  console.log(`  Oracle shows: ${twapPrice.toString()} oracle units`);
  console.log(`  Ratio: ${(Number(twapPrice) / 9.26).toFixed(0)}x difference\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:");
    console.error(error);
    process.exit(1);
  });

