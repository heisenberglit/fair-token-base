// scripts/testnet/deploy.js
// Deploy FAIR 10B to Base Sepolia testnet
// Usage: node scripts/testnet/deploy.js

import { ethers } from "ethers";
import { getWallet, checkBalance } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getWalletAddresses, getNetworkConfig, TGE_TIMESTAMP, TOKENOMICS } from "../shared/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🧪 Deploying FAIR 10B to Base Sepolia Testnet");
  console.log("=".repeat(70) + "\n");

  const config = getNetworkConfig("testnet");
  const wallet = getWallet("testnet");
  const wallets = getWalletAddresses(false); // Use test addresses if not set

  console.log(`Network: ${config.name}`);
  console.log(`Chain ID: ${config.chainId}`);
  console.log(`Deployer: ${wallet.address}`);
  
  const balance = await checkBalance(wallet, "0.005");
  console.log(`Balance: ${balance} ETH\n`);

  console.log("Pool Wallet Addresses:");
  console.log(`  Treasury: ${wallets.treasury}`);
  console.log(`  Growth: ${wallets.growth}`);
  console.log(`  Liquidity: ${wallets.liquidity}`);
  console.log(`  Team: ${wallets.team}\n`);

  const deployments = {};

  // 1. Deploy FAIRTestnet
  console.log("Step 1: Deploying FAIRTestnet...");
  const fairArtifact = loadArtifact(CONTRACTS.FAIR_TESTNET);
  const fairFactory = new ethers.ContractFactory(fairArtifact.abi, fairArtifact.bytecode, wallet);

  const fair = await fairFactory.deploy(
    wallet.address,
    wallets.treasury,
    wallets.liquidity,
    wallets.growth,
    wallets.team,
    TGE_TIMESTAMP
  );

  await fair.waitForDeployment();
  deployments.fair = await fair.getAddress();
  console.log(`  ✅ FAIRTestnet: ${deployments.fair}`);
  console.log(`  📋 ${config.explorer}/address/${deployments.fair}\n`);

  // 2. Deploy MockOracle
  console.log("Step 2: Deploying MockOracle...");
  const oracleArtifact = loadArtifact(CONTRACTS.MOCK_ORACLE);
  const oracleFactory = new ethers.ContractFactory(oracleArtifact.abi, oracleArtifact.bytecode, wallet);
  const oracle = await oracleFactory.deploy();
  await oracle.waitForDeployment();
  deployments.oracle = await oracle.getAddress();
  console.log(`  ✅ MockOracle: ${deployments.oracle}`);
  console.log(`  📋 ${config.explorer}/address/${deployments.oracle}\n`);

  // 3. Wire oracle
  console.log("Step 3: Wiring oracle to token...");
  const wireTx = await fair.setOracle(deployments.oracle);
  await wireTx.wait();  // Wait for confirmation
  console.log("  ✅ Oracle wired\n");

  // 4. Set initial price
  console.log("Step 4: Setting initial price...");
  const oracleContract = new ethers.Contract(deployments.oracle, oracleArtifact.abi, wallet);
  const priceTx = await oracleContract.setPrice(TOKENOMICS.START_PRICE);
  await priceTx.wait();  // Wait for confirmation
  console.log(`  ✅ Price: ${TOKENOMICS.START_PRICE} ($0.000010)\n`);

  // 5. Verify
  console.log("Step 5: Verifying deployment...");
  const totalSupply = await fair.totalSupply();
  const milestone1Target = await fair.milestonePriceTarget(1);
  console.log(`  Total Supply: ${ethers.formatEther(totalSupply)} FAIR`);
  console.log(`  Milestone 1 Target: ${milestone1Target} (1e9 units)\n`);

  // Save deployment info
  const envPath = path.join(__dirname, ".env.testnet");
  const envContent = `# Testnet Deployment - ${new Date().toISOString()}
FAIR_ADDRESS=${deployments.fair}
ORACLE_ADDRESS=${deployments.oracle}
EXPLORER=${config.explorer}
`;
  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Saved to scripts/testnet/.env.testnet\n`);

  // Summary
  console.log("=".repeat(70));
  console.log("✅ Testnet Deployment Complete!\n");
  console.log("Deployed Addresses:");
  console.log(`  FAIRTestnet: ${deployments.fair}`);
  console.log(`  MockOracle: ${deployments.oracle}\n`);
  console.log("Verify on Explorer:");
  console.log(`  ${config.explorer}/address/${deployments.fair}`);
  console.log(`  ${config.explorer}/address/${deployments.oracle}\n`);
  console.log("Next Steps:");
  console.log("  1. Run: node scripts/testnet/test.js");
  console.log("  2. Create Aerodrome pool (if testing TWAP)");
  console.log("  3. Deploy AerodromeTWAPOracle");
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

