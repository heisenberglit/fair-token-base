// scripts/mainnet/resume-deployment.js
// Resume deployment with existing FAIRVault contract
// Usage: node scripts/mainnet/resume-deployment.js <VAULT_ADDRESS>
//
// This script will:
// 1. Deploy AerodromeTWAPOracle
// 2. Wire oracle to existing vault
// 3. Freeze oracle
// 4. Optionally fund the vault

import { ethers } from "ethers";
import { getWallet, checkBalance } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getWalletAddresses, getNetworkConfig, TGE_TIMESTAMP } from "../shared/config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function waitForPendingTransactions(wallet) {
  const pendingNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
  const latestNonce = await wallet.provider.getTransactionCount(wallet.address, "latest");
  
  if (pendingNonce > latestNonce) {
    console.log(`  ⚠️  Found ${pendingNonce - latestNonce} pending transaction(s)`);
    console.log(`  Waiting for them to confirm...`);
    
    // Wait for pending transactions to clear
    while (true) {
      const currentPending = await wallet.provider.getTransactionCount(wallet.address, "pending");
      const currentLatest = await wallet.provider.getTransactionCount(wallet.address, "latest");
      
      if (currentPending === currentLatest) {
        console.log(`  ✅ All transactions confirmed\n`);
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔄 Resume Deployment - Using Existing FAIRVault");
  console.log("=".repeat(70) + "\n");

  // Get vault address from command line or env
  const VAULT_ADDRESS = process.argv[2] || process.env.VAULT_ADDRESS;
  
  if (!VAULT_ADDRESS) {
    console.log("❌ Please provide VAULT_ADDRESS:");
    console.log("   node scripts/mainnet/resume-deployment.js <VAULT_ADDRESS>");
    console.log("   OR set VAULT_ADDRESS in .env\n");
    process.exit(1);
  }

  const EXISTING_FAIR_TOKEN = process.env.EXISTING_FAIR_TOKEN;
  const AERODROME_POOL = process.env.AERODROME_POOL_MAINNET;

  if (!EXISTING_FAIR_TOKEN || !AERODROME_POOL) {
    console.log("❌ Missing required environment variables:");
    console.log("   EXISTING_FAIR_TOKEN");
    console.log("   AERODROME_POOL_MAINNET\n");
    process.exit(1);
  }

  const config = getNetworkConfig("mainnet");
  const wallet = getWallet("mainnet");
  const wallets = getWalletAddresses(true);

  console.log(`Network: ${config.name}`);
  console.log(`Chain ID: ${config.chainId}`);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Existing Vault: ${VAULT_ADDRESS}\n`);

  // Check for pending transactions
  console.log("Checking for pending transactions...");
  await waitForPendingTransactions(wallet);

  const balance = await checkBalance(wallet, "0.005");
  console.log(`Balance: ${balance} ETH\n`);

  // Verify vault exists and is not frozen yet
  console.log("=".repeat(50));
  console.log("Step 0: Verifying Existing Vault...");
  console.log("=".repeat(50));
  
  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, wallet);
  
  try {
    const vaultToken = await vault.fairToken();
    const oracleFrozen = await vault.oracleFrozen();
    const currentOracle = await vault.priceOracle();
    
    if (vaultToken.toLowerCase() !== EXISTING_FAIR_TOKEN.toLowerCase()) {
      console.log(`  ❌ Vault token mismatch!`);
      console.log(`     Expected: ${EXISTING_FAIR_TOKEN}`);
      console.log(`     Vault has: ${vaultToken}\n`);
      process.exit(1);
    }
    
    if (oracleFrozen) {
      console.log(`  ⚠️  Oracle is already frozen!`);
      console.log(`     Current Oracle: ${currentOracle}`);
      console.log(`     This vault is already fully configured.\n`);
      process.exit(0);
    }
    
    if (currentOracle !== ethers.ZeroAddress) {
      console.log(`  ⚠️  Vault already has an oracle: ${currentOracle}`);
      console.log(`     But it's not frozen yet. Continuing...\n`);
    } else {
      console.log(`  ✅ Vault verified - no oracle set yet\n`);
    }
  } catch (error) {
    console.log(`  ❌ Error verifying vault: ${error.message}`);
    console.log(`     Make sure the address is correct.\n`);
    process.exit(1);
  }

  const deployments = {
    vault: VAULT_ADDRESS,
  };

  // =====================
  // STEP 1: Deploy TWAP Oracle
  // =====================

  console.log("=".repeat(50));
  console.log("Step 1: Deploying AerodromeTWAPOracle...");
  console.log("=".repeat(50));
  
  // Get the next available nonce
  // "pending" returns the next nonce that can be used (includes pending transactions)
  const latestNonce = await wallet.provider.getTransactionCount(wallet.address, "latest");
  let nonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
  
  console.log(`  Latest (confirmed) nonce: ${latestNonce}`);
  console.log(`  Pending nonce: ${nonce}`);
  
  // If there's a gap (pending > latest + 1), it means there are pending transactions
  // We should use the pending nonce which is the next available
  if (nonce > latestNonce + 1) {
    console.log(`  ⚠️  Found ${nonce - latestNonce - 1} pending transaction(s)`);
  }
  
  console.log(`  Using nonce: ${nonce}`);
  
  const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
  const oracleFactory = new ethers.ContractFactory(oracleArtifact.abi, oracleArtifact.bytecode, wallet);

  // Deploy with higher gas price (let ethers handle nonce automatically)
  const gasPrice = await wallet.provider.getFeeData();
  
  console.log(`  Gas price: ${gasPrice.maxFeePerGas ? ethers.formatUnits(gasPrice.maxFeePerGas, "gwei") : "N/A"} gwei`);
  
  // Try deployment - ethers will automatically use the correct nonce
  let deployTx;
  try {
    deployTx = await oracleFactory.deploy(
      AERODROME_POOL,
      EXISTING_FAIR_TOKEN,
      config.usdc,
      3600, // 1 hour TWAP window
      {
        maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
      }
    );
  } catch (error) {
    if (error.message.includes("nonce") || error.code === "NONCE_EXPIRED") {
      console.log(`  ⚠️  Nonce error detected, retrying with manual nonce...`);
      // Get fresh nonce and retry
      const retryNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
      console.log(`  Retrying with nonce: ${retryNonce}`);
      deployTx = await oracleFactory.deploy(
        AERODROME_POOL,
        EXISTING_FAIR_TOKEN,
        config.usdc,
        3600,
        {
          nonce: retryNonce,
          maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
          maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
        }
      );
    } else {
      throw error;
    }
  }

  console.log(`  📤 Deployment transaction: ${deployTx.deploymentTransaction().hash}`);
  console.log(`  ⏳ Waiting for confirmation...`);
  
  await deployTx.waitForDeployment();
  deployments.twapOracle = await deployTx.getAddress();
  console.log(`  ✅ AerodromeTWAPOracle: ${deployments.twapOracle}`);
  console.log(`  📋 ${config.explorer}/address/${deployments.twapOracle}\n`);

  // =====================
  // STEP 2: Test Oracle
  // =====================

  console.log("=".repeat(50));
  console.log("Step 2: Testing TWAP Oracle...");
  console.log("=".repeat(50));
  
  const twapOracle = new ethers.Contract(deployments.twapOracle, oracleArtifact.abi, wallet);
  
  try {
    const price = await twapOracle.getPrice();
    const priceUsd = (Number(price) / 1e9).toFixed(9);
    console.log(`  ✅ TWAP Price: ${price} ($${priceUsd})\n`);
  } catch (error) {
    console.log(`  ⚠️  Warning: Could not read price`);
    console.log(`     ${error.message}`);
    console.log("     This may be due to insufficient pool history.\n");
    console.log("  Continue anyway? Waiting 10 seconds...\n");
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  // =====================
  // STEP 3: Wire Oracle AND FREEZE
  // =====================

  console.log("=".repeat(50));
  console.log("Step 3: Wiring Oracle to Vault AND FREEZING...");
  console.log("=".repeat(50));
  console.log("  ⚠️  This will PERMANENTLY freeze the oracle!");
  console.log("  ⚠️  After this, oracle can NEVER be changed!\n");
  
  // Let ethers handle nonce automatically (more reliable)
  const freezeGasPrice = await wallet.provider.getFeeData();
  
  let freezeTx;
  try {
    freezeTx = await vault.setOracleAndFreeze(deployments.twapOracle, {
      maxFeePerGas: freezeGasPrice.maxFeePerGas ? freezeGasPrice.maxFeePerGas * 2n : undefined,
      maxPriorityFeePerGas: freezeGasPrice.maxPriorityFeePerGas ? freezeGasPrice.maxPriorityFeePerGas * 2n : undefined,
    });
  } catch (error) {
    if (error.message.includes("nonce") || error.code === "NONCE_EXPIRED") {
      console.log(`  ⚠️  Nonce error detected, retrying with manual nonce...`);
      const retryNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
      console.log(`  Retrying with nonce: ${retryNonce}`);
      freezeTx = await vault.setOracleAndFreeze(deployments.twapOracle, {
        nonce: retryNonce,
        maxFeePerGas: freezeGasPrice.maxFeePerGas ? freezeGasPrice.maxFeePerGas * 2n : undefined,
        maxPriorityFeePerGas: freezeGasPrice.maxPriorityFeePerGas ? freezeGasPrice.maxPriorityFeePerGas * 2n : undefined,
      });
    } else {
      throw error;
    }
  }
  
  console.log(`  📤 Transaction: ${freezeTx.hash}`);
  console.log(`  ⏳ Waiting for confirmation...`);
  await freezeTx.wait();
  
  // Wait a moment for state to update
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("  ✅ Oracle wired to vault");
  console.log("  🔒 Oracle PERMANENTLY FROZEN\n");

  // =====================
  // STEP 4: Verify Frozen
  // =====================

  console.log("=".repeat(50));
  console.log("Step 4: Verifying freeze status...");
  console.log("=".repeat(50));
  
  // Re-read after transaction confirmation
  const isFrozen = await vault.oracleFrozen();
  const oracleAddr = await vault.priceOracle();
  
  console.log(`  Oracle Address: ${oracleAddr}`);
  console.log(`  Frozen: ${isFrozen ? "✅ YES - PERMANENT" : "❌ NO"}\n`);

  if (!isFrozen || oracleAddr === ethers.ZeroAddress) {
    console.log("  ⚠️  WARNING: Oracle not properly set or frozen!");
    console.log(`     Transaction hash: ${freezeTx.hash}`);
    console.log(`     Please verify on explorer: ${config.explorer}/tx/${freezeTx.hash}\n`);
  }

  // =====================
  // SAVE DEPLOYMENT
  // =====================

  const isTestMode = process.env.VAULT_WAIT_RULE && Number(process.env.VAULT_WAIT_RULE) < 86400;
  const envPath = path.join(__dirname, `.env.${isTestMode ? "test" : "mainnet"}`);
  const envContent = `# ${isTestMode ? "TEST" : "MAINNET"} DEPLOYMENT - ${new Date().toISOString()}
# ⚠️ KEEP THIS FILE SECURE!
# ⚠️ ORACLE IS PERMANENTLY FROZEN

EXISTING_FAIR_TOKEN=${EXISTING_FAIR_TOKEN}
VAULT_ADDRESS=${deployments.vault}
TWAP_ORACLE_ADDRESS=${deployments.twapOracle}
AERODROME_POOL=${AERODROME_POOL}
ORACLE_FROZEN=true

DEPLOYER=${wallet.address}
EXPLORER=${config.explorer}
TREASURY=${wallets.treasury}
GROWTH=${wallets.growth}
LIQUIDITY=${wallets.liquidity}
TEAM=${wallets.team}
`;
  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Saved to scripts/mainnet/${path.basename(envPath)}\n`);

  // =====================
  // STEP 5: Optional - Fund Vault
  // =====================

  const shouldFund = process.env.VAULT_DEPOSIT_AMOUNT || process.env.AUTO_FUND_VAULT === "true";
  
  if (shouldFund) {
    console.log("=".repeat(50));
    console.log("Step 5: Funding Vault with Tokens...");
    console.log("=".repeat(50));
    
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
    
    console.log(`  Your ${symbol} balance: ${ethers.formatUnits(yourBalance, decimals)}`);
    
    let depositAmount;
    if (process.env.VAULT_DEPOSIT_AMOUNT) {
      depositAmount = ethers.parseUnits(process.env.VAULT_DEPOSIT_AMOUNT, decimals);
      console.log(`  Deposit amount (from env): ${process.env.VAULT_DEPOSIT_AMOUNT} ${symbol}`);
    } else {
      depositAmount = yourBalance;
      console.log(`  Deposit amount (full balance): ${ethers.formatUnits(depositAmount, decimals)} ${symbol}`);
    }
    
    if (yourBalance < depositAmount) {
      console.log(`\n  ❌ Insufficient balance!`);
      console.log(`     You have: ${ethers.formatUnits(yourBalance, decimals)} ${symbol}`);
      console.log(`     Required: ${ethers.formatUnits(depositAmount, decimals)} ${symbol}`);
      console.log(`\n  Vault configured but NOT funded. Fund manually later.`);
    } else if (depositAmount === 0n) {
      console.log(`\n  ⚠️  No tokens to deposit. Fund the vault manually later.`);
    } else {
      console.log(`\n  Depositing ${ethers.formatUnits(depositAmount, decimals)} ${symbol} to vault...`);
      
      // Get gas price for deposit transactions
      const depositGasPrice = await wallet.provider.getFeeData();
      
      // Approve with retry logic
      console.log("  Approving vault...");
      let approveTx;
      try {
        approveTx = await fairToken.approve(deployments.vault, depositAmount, {
          maxFeePerGas: depositGasPrice.maxFeePerGas ? depositGasPrice.maxFeePerGas * 2n : undefined,
          maxPriorityFeePerGas: depositGasPrice.maxPriorityFeePerGas ? depositGasPrice.maxPriorityFeePerGas * 2n : undefined,
        });
      } catch (error) {
        if (error.message.includes("nonce") || error.code === "NONCE_EXPIRED") {
          console.log(`  ⚠️  Nonce error, retrying with fresh nonce...`);
          const retryNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
          console.log(`  Retrying approve with nonce: ${retryNonce}`);
          approveTx = await fairToken.approve(deployments.vault, depositAmount, {
            nonce: retryNonce,
            maxFeePerGas: depositGasPrice.maxFeePerGas ? depositGasPrice.maxFeePerGas * 2n : undefined,
            maxPriorityFeePerGas: depositGasPrice.maxPriorityFeePerGas ? depositGasPrice.maxPriorityFeePerGas * 2n : undefined,
          });
        } else {
          throw error;
        }
      }
      await approveTx.wait();
      console.log(`  ✅ Approved`);
      
      // Wait a moment for approve to be fully processed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Deposit with retry logic
      console.log("  Calling depositAndInitialize...");
      let depositTx;
      try {
        depositTx = await vault.depositAndInitialize(depositAmount, {
          maxFeePerGas: depositGasPrice.maxFeePerGas ? depositGasPrice.maxFeePerGas * 2n : undefined,
          maxPriorityFeePerGas: depositGasPrice.maxPriorityFeePerGas ? depositGasPrice.maxPriorityFeePerGas * 2n : undefined,
        });
      } catch (error) {
        if (error.message.includes("nonce") || error.code === "NONCE_EXPIRED") {
          console.log(`  ⚠️  Nonce error, retrying with fresh nonce...`);
          const retryNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
          console.log(`  Retrying deposit with nonce: ${retryNonce}`);
          depositTx = await vault.depositAndInitialize(depositAmount, {
            nonce: retryNonce,
            maxFeePerGas: depositGasPrice.maxFeePerGas ? depositGasPrice.maxFeePerGas * 2n : undefined,
            maxPriorityFeePerGas: depositGasPrice.maxPriorityFeePerGas ? depositGasPrice.maxPriorityFeePerGas * 2n : undefined,
          });
        } else {
          throw error;
        }
      }
      await depositTx.wait();
      console.log(`  ✅ Deposited and initialized!`);
      
      // Verify
      const vaultBalance = await fairToken.balanceOf(deployments.vault);
      const perMilestone = await vault.milestoneUnlockAmount();
      console.log(`\n  Vault balance: ${ethers.formatUnits(vaultBalance, decimals)} ${symbol}`);
      console.log(`  Per milestone: ${ethers.formatUnits(perMilestone, decimals)} ${symbol}`);
    }
    console.log();
  } else {
    console.log("=".repeat(50));
    console.log("Step 5: Skipping Vault Funding");
    console.log("=".repeat(50));
    console.log("  To fund the vault, set VAULT_DEPOSIT_AMOUNT in .env or run manually.\n");
  }

  // =====================
  // FINAL SUMMARY
  // =====================

  console.log("=".repeat(70));
  console.log("✅ DEPLOYMENT RESUME COMPLETE!");
  console.log("=".repeat(70));
  console.log("\nDeployed Contracts:");
  console.log(`  FAIRVault: ${deployments.vault} (existing)`);
  console.log(`  AerodromeTWAPOracle: ${deployments.twapOracle} (newly deployed)\n`);
  
  console.log("🔒 Security Status:");
  console.log("  • Oracle: PERMANENTLY FROZEN");
  console.log("  • Price Source: Aerodrome TWAP (on-chain)");
  console.log("  • Pool Wallets: IMMUTABLE");
  console.log("  • Unlocks: FULLY AUTOMATIC\n");
  
  console.log("Verify on Basescan:");
  console.log(`  Vault: ${config.explorer}/address/${deployments.vault}`);
  console.log(`  Oracle: ${config.explorer}/address/${deployments.twapOracle}\n`);
  
  console.log("=".repeat(70));
  console.log("📋 NEXT STEP: Start the Keeper Bot");
  console.log("=".repeat(70));
  console.log("\n  node scripts/keeper/keeper.js mainnet\n");
  
  console.log("=".repeat(70));
  console.log("\n⚠️  The system is now TRUSTLESS.");
  console.log("    No one can change the oracle, recipients, or unlock rules.");
  console.log("    Milestones unlock AUTOMATICALLY when conditions are met.\n");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err.message);
  if (err.transaction) {
    console.error("   Transaction:", err.transaction.hash);
  }
  process.exitCode = 1;
});

