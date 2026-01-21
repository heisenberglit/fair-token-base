// scripts/local/deploy.js
// Deploy FAIR 10B to local Hardhat fork (FREE testing)
// Usage: node scripts/local/deploy.js

import { ethers } from "ethers";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getWalletAddresses, TOKENOMICS } from "../shared/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get fresh wallet with correct nonce
function getLocalWallet() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const defaultKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  return new ethers.Wallet(defaultKey, provider);
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🏠 Deploying FAIR 10B to Local Hardhat Fork");
  console.log("=".repeat(70) + "\n");

  console.log("⚠️  Make sure Hardhat fork is running:");
  console.log("   npx hardhat node --fork https://mainnet.base.org\n");
  console.log("Waiting 3 seconds...\n");
  await new Promise(resolve => setTimeout(resolve, 3000));

  let wallet = getLocalWallet();
  const wallets = getWalletAddresses(false);

  console.log(`Deployer: ${wallet.address}`);
  const balance = await wallet.provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

  console.log("Pool Wallet Addresses (test):");
  console.log(`  Treasury: ${wallets.treasury}`);
  console.log(`  Growth: ${wallets.growth}`);
  console.log(`  Liquidity: ${wallets.liquidity}`);
  console.log(`  Team: ${wallets.team}\n`);

  const deployments = {};

  // 1. Deploy FAIRTestnet
  console.log("Step 1: Deploying FAIRTestnet (10B with test timings)...");
  const fairArtifact = loadArtifact(CONTRACTS.FAIR_TESTNET);
  const fairFactory = new ethers.ContractFactory(fairArtifact.abi, fairArtifact.bytecode, wallet);

  const fairDeployTx = await fairFactory.deploy(
    wallet.address,
    wallets.treasury,
    wallets.liquidity,
    wallets.growth,
    wallets.team,
    Math.floor(Date.now() / 1000)
  );
  
  const fairReceipt = await fairDeployTx.deploymentTransaction().wait();
  deployments.fair = await fairDeployTx.getAddress();
  console.log(`  ✅ FAIRTestnet: ${deployments.fair}\n`);

  // Get fresh wallet for next transaction
  wallet = getLocalWallet();

  // 2. Deploy MockOracle
  console.log("Step 2: Deploying MockOracle...");
  const oracleArtifact = loadArtifact(CONTRACTS.MOCK_ORACLE);
  const oracleFactory = new ethers.ContractFactory(oracleArtifact.abi, oracleArtifact.bytecode, wallet);
  
  const oracleDeployTx = await oracleFactory.deploy();
  const oracleReceipt = await oracleDeployTx.deploymentTransaction().wait();
  deployments.oracle = await oracleDeployTx.getAddress();
  console.log(`  ✅ MockOracle: ${deployments.oracle}\n`);

  // Get fresh wallet for next transaction
  wallet = getLocalWallet();

  // 3. Wire oracle to token
  console.log("Step 3: Wiring oracle to token...");
  const fair = new ethers.Contract(deployments.fair, fairArtifact.abi, wallet);
  const wireTx = await fair.setOracle(deployments.oracle);
  await wireTx.wait();
  console.log("  ✅ Oracle wired\n");

  // Get fresh wallet for next transaction
  wallet = getLocalWallet();

  // 4. Set initial price
  console.log("Step 4: Setting initial price...");
  const oracle = new ethers.Contract(deployments.oracle, oracleArtifact.abi, wallet);
  const priceTx = await oracle.setPrice(TOKENOMICS.START_PRICE);
  await priceTx.wait();
  
  // Get fresh wallet for read
  wallet = getLocalWallet();
  const oracleRead = new ethers.Contract(deployments.oracle, oracleArtifact.abi, wallet);
  const price = await oracleRead.getPrice();
  console.log(`  ✅ Price: ${price} (1e9 units = $${(Number(price) / 1e9).toFixed(6)})\n`);

  // 5. Verify deployment
  console.log("Step 5: Verifying deployment...");
  const fairRead = new ethers.Contract(deployments.fair, fairArtifact.abi, wallet);
  const totalSupply = await fairRead.totalSupply();
  const contractBalance = await fairRead.balanceOf(deployments.fair);
  console.log(`  Total Supply: ${ethers.formatEther(totalSupply)} FAIR`);
  console.log(`  Contract Balance (locked): ${ethers.formatEther(contractBalance)} FAIR\n`);

  // Save deployment info
  const envPath = path.join(__dirname, ".env.local");
  const envContent = `# Local Deployment - ${new Date().toISOString()}
FAIR_ADDRESS=${deployments.fair}
ORACLE_ADDRESS=${deployments.oracle}
`;
  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Saved to scripts/local/.env.local\n`);

  // Summary
  console.log("=".repeat(70));
  console.log("✅ Local Deployment Complete!\n");
  console.log("Deployed Addresses:");
  console.log(`  FAIRTestnet: ${deployments.fair}`);
  console.log(`  MockOracle: ${deployments.oracle}\n`);
  console.log("Next Steps:");
  console.log("  1. Run: node scripts/local/test.js");
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
