// scripts/mainnet/deposit-tokens.js
// Deposit tokens to an existing FAIRVault
// Usage: node scripts/mainnet/deposit-tokens.js <VAULT_ADDRESS> [AMOUNT]
//
// If AMOUNT is not provided, uses VAULT_DEPOSIT_AMOUNT from .env or full balance

import { ethers } from "ethers";
import { getWallet, checkBalance } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("💰 Deposit Tokens to FAIRVault");
  console.log("=".repeat(70) + "\n");

  const VAULT_ADDRESS = process.argv[2] || process.env.VAULT_ADDRESS;
  const EXISTING_FAIR_TOKEN = process.env.EXISTING_FAIR_TOKEN;
  const DEPOSIT_AMOUNT = process.argv[3] || process.env.VAULT_DEPOSIT_AMOUNT;

  if (!VAULT_ADDRESS) {
    console.log("❌ Please provide VAULT_ADDRESS:");
    console.log("   node scripts/mainnet/deposit-tokens.js <VAULT_ADDRESS> [AMOUNT]");
    console.log("   OR set VAULT_ADDRESS in .env\n");
    process.exit(1);
  }

  if (!EXISTING_FAIR_TOKEN) {
    console.log("❌ EXISTING_FAIR_TOKEN not set in .env\n");
    process.exit(1);
  }

  const wallet = getWallet("mainnet");
  const balance = await checkBalance(wallet, "0.001");
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Vault: ${VAULT_ADDRESS}`);
  console.log(`Balance: ${balance} ETH\n`);

  // Load vault contract
  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, wallet);

  // Check if already initialized
  const isInitialized = await vault.initialized();
  if (isInitialized) {
    console.log("⚠️  Vault is already initialized!");
    const vaultBalance = await vault.totalDeposited();
    console.log(`   Current balance: ${ethers.formatEther(vaultBalance)} tokens\n`);
    
    const proceed = process.argv.includes("--force");
    if (!proceed) {
      console.log("   Use --force to deposit anyway (this will fail if vault is initialized)\n");
      process.exit(0);
    }
  }

  // Get token info
  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function approve(address, uint256) returns (bool)"
  ];
  const fairToken = new ethers.Contract(EXISTING_FAIR_TOKEN, erc20Abi, wallet);

  const symbol = await fairToken.symbol();
  const decimals = await fairToken.decimals();
  const yourBalance = await fairToken.balanceOf(wallet.address);

  console.log(`Your ${symbol} balance: ${ethers.formatUnits(yourBalance, decimals)}`);

  // Determine deposit amount
  let depositAmount;
  if (DEPOSIT_AMOUNT) {
    depositAmount = ethers.parseUnits(DEPOSIT_AMOUNT, decimals);
    console.log(`Deposit amount (from ${process.argv[3] ? "argument" : "env"}): ${DEPOSIT_AMOUNT} ${symbol}`);
  } else {
    depositAmount = yourBalance;
    console.log(`Deposit amount (full balance): ${ethers.formatUnits(depositAmount, decimals)} ${symbol}`);
  }

  if (yourBalance < depositAmount) {
    console.log(`\n❌ Insufficient balance!`);
    console.log(`   You have: ${ethers.formatUnits(yourBalance, decimals)} ${symbol}`);
    console.log(`   Required: ${ethers.formatUnits(depositAmount, decimals)} ${symbol}\n`);
    process.exit(1);
  }

  if (depositAmount === 0n) {
    console.log(`\n❌ No tokens to deposit.\n`);
    process.exit(1);
  }

  console.log(`\nDepositing ${ethers.formatUnits(depositAmount, decimals)} ${symbol} to vault...\n`);

  // Get gas price
  const gasPrice = await wallet.provider.getFeeData();

  // Step 1: Approve
  console.log("Step 1: Approving vault...");
  let approveTx;
  try {
    approveTx = await fairToken.approve(VAULT_ADDRESS, depositAmount, {
      maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
    });
  } catch (error) {
    if (error.message.includes("nonce") || error.code === "NONCE_EXPIRED") {
      console.log(`  ⚠️  Nonce error, retrying with fresh nonce...`);
      const retryNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
      console.log(`  Retrying with nonce: ${retryNonce}`);
      approveTx = await fairToken.approve(VAULT_ADDRESS, depositAmount, {
        nonce: retryNonce,
        maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
      });
    } else {
      throw error;
    }
  }
  console.log(`  📤 Transaction: ${approveTx.hash}`);
  await approveTx.wait();
  console.log(`  ✅ Approved\n`);

  // Wait for approve to be processed
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 2: Deposit
  console.log("Step 2: Calling depositAndInitialize...");
  let depositTx;
  try {
    depositTx = await vault.depositAndInitialize(depositAmount, {
      maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
    });
  } catch (error) {
    if (error.message.includes("nonce") || error.code === "NONCE_EXPIRED") {
      console.log(`  ⚠️  Nonce error, retrying with fresh nonce...`);
      const retryNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
      console.log(`  Retrying with nonce: ${retryNonce}`);
      depositTx = await vault.depositAndInitialize(depositAmount, {
        nonce: retryNonce,
        maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
      });
    } else {
      throw error;
    }
  }
  console.log(`  📤 Transaction: ${depositTx.hash}`);
  await depositTx.wait();
  console.log(`  ✅ Deposited and initialized!\n`);

  // Verify
  const vaultBalance = await fairToken.balanceOf(VAULT_ADDRESS);
  const perMilestone = await vault.milestoneUnlockAmount();
  console.log("=".repeat(70));
  console.log("✅ DEPOSIT COMPLETE!");
  console.log("=".repeat(70));
  console.log(`\nVault balance: ${ethers.formatUnits(vaultBalance, decimals)} ${symbol}`);
  console.log(`Per milestone: ${ethers.formatUnits(perMilestone, decimals)} ${symbol}\n`);
}

main().catch((err) => {
  console.error("❌ Deposit failed:", err.message);
  if (err.transaction) {
    console.error("   Transaction:", err.transaction.hash);
  }
  process.exitCode = 1;
});

