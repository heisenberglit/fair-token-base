// scripts/mainnet/deploy-aggregate-oracle.js
// Deploy AggregateOracle with multiple price sources
// Usage: node scripts/mainnet/deploy-aggregate-oracle.js

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔗 Deploy Aggregate Oracle");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const wallet = getWallet(network);

  console.log(`📡 Network: ${network}`);
  console.log(`👤 Wallet: ${wallet.address}\n`);

  // Get oracle sources from environment
  // Format: AERODROME_ORACLE,UNISWAP_ORACLE (comma-separated addresses)
  const sourcesEnv = process.env.ORACLE_SOURCES || "";
  const sources = sourcesEnv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sources.length === 0) {
    console.log("❌ No oracle sources provided in ORACLE_SOURCES env var\n");
    console.log("💡 Example: ORACLE_SOURCES=0x123...,0x456...\n");
    process.exit(1);
  }

  console.log(`📊 Oracle Sources (${sources.length}):`);
  for (let i = 0; i < sources.length; i++) {
    console.log(`   ${i + 1}. ${sources[i]}`);
  }
  console.log();

  // Aggregation method: 0=MEAN, 1=MEDIAN, 2=WEIGHTED
  const method = parseInt(process.env.AGGREGATION_METHOD || "0");
  const methodNames = ["MEAN", "MEDIAN", "WEIGHTED"];
  console.log(`📈 Aggregation Method: ${methodNames[method]} (${method})\n`);

  // Minimum sources required
  const minSources = parseInt(process.env.MIN_SOURCES || "1");
  console.log(`🔢 Minimum Sources: ${minSources}\n`);

  // Max deviation (basis points, 0 = disabled)
  const maxDeviationBps = parseInt(process.env.MAX_DEVIATION_BPS || "0");
  console.log(`📉 Max Deviation: ${maxDeviationBps} bps (${maxDeviationBps / 100}%)\n`);

  // Load contract
  const artifact = loadArtifact(CONTRACTS.AGGREGATE_ORACLE);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  // Deploy
  console.log("=".repeat(70));
  console.log("Deploying AggregateOracle...");
  console.log("=".repeat(70) + "\n");

  const deployTx = await factory.deploy(sources, method, minSources, maxDeviationBps);
  console.log(`📤 Deployment transaction: ${deployTx.hash}`);
  console.log(`📋 ${config.explorer}/tx/${deployTx.hash}\n`);

  console.log("⏳ Waiting for confirmation...\n");
  const receipt = await deployTx.wait();
  const oracleAddress = receipt.contractAddress;

  console.log("=".repeat(70));
  console.log("✅ Deployment Complete");
  console.log("=".repeat(70));
  console.log(`📍 AggregateOracle: ${oracleAddress}`);
  console.log(`📋 ${config.explorer}/address/${oracleAddress}\n`);

  // Test the oracle
  console.log("=".repeat(70));
  console.log("Testing Oracle");
  console.log("=".repeat(70) + "\n");

  const oracle = new ethers.Contract(oracleAddress, artifact.abi, wallet);

  try {
    const price = await oracle.getPrice({ blockTag: "latest" });
    const priceUsd = Number(price) / 1_000_000;
    console.log(`✅ Oracle getPrice() works!`);
    console.log(`   Price: ${price.toString()} oracle units ($${priceUsd.toFixed(9)} USD)\n`);
  } catch (error) {
    console.log(`⚠️  Oracle getPrice() failed (may need more time or sources):`);
    console.log(`   ${error.message}\n`);
  }

  // Next steps
  console.log("=".repeat(70));
  console.log("Next Steps");
  console.log("=".repeat(70));
  console.log(`1. Verify oracle is working: node scripts/mainnet/test-oracle.js ${oracleAddress}`);
  console.log(`2. Freeze oracle (optional): oracle.freeze()`);
  console.log(`3. Use in FAIRVault: vault.setOracleAndFreeze("${oracleAddress}")\n`);
  console.log(`⚠️  Note: Once frozen, oracle cannot be modified!\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:");
    console.error(error);
    process.exit(1);
  });

