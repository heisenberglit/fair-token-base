// scripts/testnet/fix-price.js
// Set initial price on already deployed MockOracle
// Usage: node scripts/testnet/fix-price.js

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { TOKENOMICS } from "../shared/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("\n🔧 Setting initial price on MockOracle...\n");

  // Load deployed addresses
  const envPath = path.join(__dirname, ".env.testnet");
  if (!fs.existsSync(envPath)) {
    console.log("❌ No .env.testnet found. Run deploy.js first.");
    return;
  }

  const env = fs.readFileSync(envPath, "utf8");
  const addresses = {};
  env.split("\n").forEach(line => {
    const [key, value] = line.split("=");
    if (key && value && !key.startsWith("#")) {
      addresses[key.trim()] = value.trim();
    }
  });

  if (!addresses.ORACLE_ADDRESS) {
    console.log("❌ ORACLE_ADDRESS not found in .env.testnet");
    return;
  }

  const wallet = getWallet("testnet");
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Oracle: ${addresses.ORACLE_ADDRESS}`);

  // Get current nonce
  const nonce = await wallet.getNonce();
  console.log(`Current nonce: ${nonce}\n`);

  const oracleArtifact = loadArtifact(CONTRACTS.MOCK_ORACLE);
  const oracle = new ethers.Contract(addresses.ORACLE_ADDRESS, oracleArtifact.abi, wallet);

  // Check current price first
  try {
    const currentPrice = await oracle.getPrice();
    console.log(`Current price: ${currentPrice}`);
    
    if (Number(currentPrice) === TOKENOMICS.START_PRICE) {
      console.log("✅ Price already set correctly!\n");
      return;
    }
  } catch (e) {
    console.log("Could not read current price");
  }

  // Set price with explicit nonce and higher gas
  console.log(`\nSetting price to ${TOKENOMICS.START_PRICE}...`);
  const tx = await oracle.setPrice(TOKENOMICS.START_PRICE, {
    nonce,
    maxFeePerGas: ethers.parseUnits("2", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
  });
  
  console.log(`TX: ${tx.hash}`);
  console.log("Waiting for confirmation...");
  await tx.wait();
  
  console.log(`✅ Price set to ${TOKENOMICS.START_PRICE} ($0.000010)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});




