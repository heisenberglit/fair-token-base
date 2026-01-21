// scripts/mainnet/check-oracle-pool-match.js
// Quick check to see which pool the oracle is using
// Usage: node scripts/mainnet/check-oracle-pool-match.js [VAULT_ADDRESS]

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
  
  if (!VAULT_ADDRESS) {
    console.log("❌ Please provide VAULT_ADDRESS\n");
    process.exit(1);
  }

  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, wallet);

  const oracleAddress = await vault.priceOracle();
  const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
  const oracle = new ethers.Contract(oracleAddress, oracleArtifact.abi, wallet);

  const poolAddress = await oracle.pool();
  const fairToken = await oracle.fairToken();
  const quoteToken = await oracle.quoteToken();

  console.log("\n" + "=".repeat(70));
  console.log("Oracle Pool Configuration");
  console.log("=".repeat(70));
  console.log(`Pool: ${poolAddress}`);
  console.log(`FAIR Token: ${fairToken}`);
  console.log(`Quote Token: ${quoteToken}`);
  console.log(`\n📋 Check on Basescan:`);
  console.log(`   Pool: ${config.explorer}/address/${poolAddress}`);
  console.log(`   FAIR: ${config.explorer}/address/${fairToken}`);
  console.log(`\n💡 Verify:`);
  console.log(`   1. Is the UI showing swaps on this pool: ${poolAddress}?`);
  console.log(`   2. Or is the UI showing a different pool?\n`);
}

main().catch(console.error);

