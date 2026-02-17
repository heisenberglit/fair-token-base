// scripts/mainnet/deploy-vault.js
// Deploy FAIRVault + AerodromeTWAPOracle for existing FAIR token
//
// REQUIREMENTS (set in .env):
//   EXISTING_FAIR_TOKEN=0x...     (your FAIR token address)
//   AERODROME_POOL_MAINNET=0x...  (your Aerodrome pool address)
//   TREASURY_WALLET=0x...
//   GROWTH_WALLET=0x...
//   LIQUIDITY_WALLET=0x...
//   TEAM_WALLET=0x...
//
// OPTIONAL:
//   VAULT_DEPOSIT_AMOUNT=9000000000  (tokens to deposit, defaults to full balance)
//
// PRODUCTION (90 days cooldown, 360 hours):
//   node scripts/mainnet/deploy-vault.js
//
// TEST MODE (4 hours cooldown, 2 periods):
//   set VAULT_WAIT_RULE=14400
//   set VAULT_GOOD_PERIODS=2  
//   set VAULT_PERIOD_INTERVAL=60
//   node scripts/mainnet/deploy-vault.js

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

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 FAIRVault Deployment");
  console.log("   For existing FAIR token with existing Aerodrome pool");
  console.log("=".repeat(70) + "\n");

  // =====================
  // VALIDATE REQUIREMENTS
  // =====================

  const EXISTING_FAIR_TOKEN = process.env.EXISTING_FAIR_TOKEN;
  const AERODROME_POOL = process.env.AERODROME_POOL_MAINNET;

  if (!EXISTING_FAIR_TOKEN) {
    console.log("❌ EXISTING_FAIR_TOKEN not set in .env");
    console.log("   Add: EXISTING_FAIR_TOKEN=0xYourFAIRTokenAddress\n");
    return;
  }

  if (!AERODROME_POOL) {
    console.log("❌ AERODROME_POOL_MAINNET not set in .env");
    console.log("   Add: AERODROME_POOL_MAINNET=0xYourPoolAddress\n");
    return;
  }

  const config = getNetworkConfig("mainnet");
  const wallet = getWallet("mainnet");
  
  let wallets;
  try {
    wallets = getWalletAddresses(true);
  } catch (e) {
    console.log("❌ Pool wallet addresses not set in .env");
    console.log("   Required:");
    console.log("     TREASURY_WALLET=0x...");
    console.log("     GROWTH_WALLET=0x...");
    console.log("     LIQUIDITY_WALLET=0x...");
    console.log("     TEAM_WALLET=0x...\n");
    return;
  }

  // =====================
  // TIMING CONFIGURATION
  // =====================
  
  // Production defaults, override with env vars for testing
  const WAIT_RULE = process.env.VAULT_WAIT_RULE || (90 * 24 * 60 * 60).toString(); // 90 days
  const REQUIRED_GOOD_PERIODS = process.env.VAULT_GOOD_PERIODS || "360"; // 360 periods
  const PERIOD_INTERVAL = process.env.VAULT_PERIOD_INTERVAL || "3600"; // 1 hour
  
  const isTestMode = WAIT_RULE !== (90 * 24 * 60 * 60).toString();

  // =====================
  // DISPLAY CONFIG
  // =====================

  console.log("⚠️  WARNING: This uses REAL ETH!");
  console.log("⚠️  WARNING: Oracle will be PERMANENTLY FROZEN!\n");
  
  console.log("Configuration:");
  console.log(`  Network: ${config.name}`);
  console.log(`  Deployer: ${wallet.address}`);
  console.log(`  FAIR Token: ${EXISTING_FAIR_TOKEN}`);
  console.log(`  Aerodrome Pool: ${AERODROME_POOL}`);
  console.log(`  USDC: ${config.usdc}`);
  console.log(`  TGE Timestamp: ${TGE_TIMESTAMP}`);
  console.log(`  Mode: ${isTestMode ? "⚡ TEST MODE" : "🏭 PRODUCTION"}\n`);
  
  console.log("Pool Wallets:");
  console.log(`  Treasury: ${wallets.treasury}`);
  console.log(`  Growth: ${wallets.growth}`);
  console.log(`  Liquidity: ${wallets.liquidity}`);
  console.log(`  Team: ${wallets.team}\n`);
  
  if (isTestMode) {
    console.log("⚡ TEST MODE - Shortened timings:");
    console.log(`   Wait Rule: ${Number(WAIT_RULE) / 3600} hours`);
    console.log(`   Good Periods: ${REQUIRED_GOOD_PERIODS}`);
    console.log(`   Period Interval: ${Number(PERIOD_INTERVAL) / 60} minutes\n`);
  } else {
    console.log("🏭 PRODUCTION - Standard timings:");
    console.log("   Wait Rule: 90 days");
    console.log("   Good Periods: 360 hours");
    console.log("   Period Interval: 1 hour\n");
  }

  // Check balance - 0.005 ETH minimum, 0.02 ETH recommended
  const balance = await checkBalance(wallet, "0.005");
  console.log(`Balance: ${balance} ETH`);
  if (balance < 0.02) {
    console.log(`  ⚠️  Warning: Less than 0.02 ETH recommended for safety`);
    console.log(`     Estimated cost: ~0.003-0.006 ETH (depends on gas price)\n`);
  } else {
    console.log(`  ✅ Sufficient balance for deployment\n`);
  }

  console.log("Press Ctrl+C to cancel, or wait 15 seconds...\n");
  await new Promise(resolve => setTimeout(resolve, 15000));

  const deployments = {};

  // =====================
  // STEP 1: Deploy FAIRVault
  // =====================

  console.log("=".repeat(50));
  console.log("Step 1: Deploying FAIRVault...");
  console.log("=".repeat(50));
  
  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, wallet);

  // MIN_LIQUIDITY_FLOOR: 0 = disabled (reserved for future use)
  const MIN_LIQUIDITY_FLOOR = process.env.VAULT_MIN_LIQUIDITY_FLOOR || "0";

  const vault = await vaultFactory.deploy(
    EXISTING_FAIR_TOKEN,
    wallet.address,
    wallets.treasury,
    wallets.liquidity,
    wallets.growth,
    wallets.team,
    TGE_TIMESTAMP,
    WAIT_RULE,
    REQUIRED_GOOD_PERIODS,
    PERIOD_INTERVAL,
    MIN_LIQUIDITY_FLOOR
  );

  await vault.waitForDeployment();
  deployments.vault = await vault.getAddress();
  console.log(`  ✅ FAIRVault: ${deployments.vault}`);
  console.log(`  📋 ${config.explorer}/address/${deployments.vault}\n`);

  // =====================
  // STEP 2: Deploy TWAP Oracle
  // =====================

  console.log("=".repeat(50));
  console.log("Step 2: Deploying AerodromeTWAPOracle...");
  console.log("=".repeat(50));
  
  // Check for pending transactions and wait if needed
  const pendingNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
  const latestNonce = await wallet.provider.getTransactionCount(wallet.address, "latest");
  
  if (pendingNonce > latestNonce) {
    console.log(`  ⚠️  Found ${pendingNonce - latestNonce} pending transaction(s)`);
    console.log(`  Waiting for them to confirm...`);
    
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
  
  const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
  const oracleFactory = new ethers.ContractFactory(oracleArtifact.abi, oracleArtifact.bytecode, wallet);

  // Use the nonce we already checked above (pendingNonce is the next available)
  const nonce = pendingNonce; // Always use pending - it's the next available nonce
  const gasPrice = await wallet.provider.getFeeData();
  
  console.log(`  Latest (confirmed) nonce: ${latestNonce}`);
  console.log(`  Pending nonce: ${pendingNonce}`);
  console.log(`  Using nonce: ${nonce}`);
  
  if (pendingNonce > latestNonce) {
    console.log(`  ⚠️  Note: ${pendingNonce - latestNonce} transaction(s) are pending`);
  }
  
  const twapOracle = await oracleFactory.deploy(
    AERODROME_POOL,
    EXISTING_FAIR_TOKEN,
    config.usdc,
    3600, // 1 hour TWAP window
    {
      nonce,
      // Use higher gas price to avoid replacement issues
      maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
    }
  );

  console.log(`  📤 Deployment transaction: ${twapOracle.deploymentTransaction().hash}`);
  console.log(`  ⏳ Waiting for confirmation...`);
  
  await twapOracle.waitForDeployment();
  deployments.twapOracle = await twapOracle.getAddress();
  console.log(`  ✅ AerodromeTWAPOracle: ${deployments.twapOracle}`);
  console.log(`  📋 ${config.explorer}/address/${deployments.twapOracle}\n`);

  // =====================
  // STEP 3: Test Oracle
  // =====================

  console.log("=".repeat(50));
  console.log("Step 3: Testing TWAP Oracle...");
  console.log("=".repeat(50));
  
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
  // STEP 4: Wire Oracle AND FREEZE
  // =====================

  console.log("=".repeat(50));
  console.log("Step 4: Wiring Oracle to Vault AND FREEZING...");
  console.log("=".repeat(50));
  console.log("  ⚠️  This will PERMANENTLY freeze the oracle!");
  console.log("  ⚠️  After this, oracle can NEVER be changed!\n");
  
  // Get fresh nonce - use pending to get the next available nonce
  const freezeNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
  const freezeGasPrice = await wallet.provider.getFeeData();
  
  console.log(`  Using nonce: ${freezeNonce}`);
  
  const freezeTx = await vault.setOracleAndFreeze(deployments.twapOracle, {
    nonce: freezeNonce,
    maxFeePerGas: freezeGasPrice.maxFeePerGas ? freezeGasPrice.maxFeePerGas * 2n : undefined,
    maxPriorityFeePerGas: freezeGasPrice.maxPriorityFeePerGas ? freezeGasPrice.maxPriorityFeePerGas * 2n : undefined,
  });
  
  console.log(`  📤 Transaction: ${freezeTx.hash}`);
  await freezeTx.wait();
  
  console.log("  ✅ Oracle wired to vault");
  console.log("  🔒 Oracle PERMANENTLY FROZEN\n");

  // =====================
  // STEP 5: Verify Frozen
  // =====================

  console.log("=".repeat(50));
  console.log("Step 5: Verifying freeze status...");
  console.log("=".repeat(50));
  
  const isFrozen = await vault.oracleFrozen();
  const oracleAddr = await vault.priceOracle();
  
  console.log(`  Oracle Address: ${oracleAddr}`);
  console.log(`  Frozen: ${isFrozen ? "✅ YES - PERMANENT" : "❌ NO"}\n`);

  if (!isFrozen) {
    console.log("  ⚠️  WARNING: Oracle not frozen! Something went wrong.\n");
  }

  // =====================
  // SAVE DEPLOYMENT
  // =====================

  const envPath = path.join(__dirname, `.env.${isTestMode ? "test" : "mainnet"}`);
  const envContent = `# ${isTestMode ? "TEST" : "MAINNET"} DEPLOYMENT - ${new Date().toISOString()}
# ⚠️ KEEP THIS FILE SECURE!
# ⚠️ ORACLE IS PERMANENTLY FROZEN

EXISTING_FAIR_TOKEN=${EXISTING_FAIR_TOKEN}
VAULT_ADDRESS=${deployments.vault}
TWAP_ORACLE_ADDRESS=${deployments.twapOracle}
AERODROME_POOL=${AERODROME_POOL}
ORACLE_FROZEN=true

# Timing Config
WAIT_RULE=${WAIT_RULE}
GOOD_PERIODS=${REQUIRED_GOOD_PERIODS}
PERIOD_INTERVAL=${PERIOD_INTERVAL}

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
  // STEP 6: Fund Vault with Tokens
  // =====================

  console.log("=".repeat(50));
  console.log("Step 6: Funding Vault with Tokens...");
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
  
  // Determine deposit amount (from env or use full balance)
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
    console.log(`\n  Vault deployed but NOT funded. Fund manually later.`);
  } else if (depositAmount === 0n) {
    console.log(`\n  ⚠️  No tokens to deposit. Fund the vault manually later.`);
  } else {
    console.log(`\n  Depositing ${ethers.formatUnits(depositAmount, decimals)} ${symbol} to vault...`);
    
    // Step 6a: Approve vault to spend tokens
    console.log("  Approving vault...");
    const approveTx = await fairToken.approve(deployments.vault, depositAmount);
    await approveTx.wait();
    console.log(`  ✅ Approved`);
    
    // Step 6b: Deposit and initialize
    console.log("  Calling depositAndInitialize...");
    const depositTx = await vault.depositAndInitialize(depositAmount);
    await depositTx.wait();
    console.log(`  ✅ Deposited and initialized!`);
    
    // Verify
    const vaultBalance = await fairToken.balanceOf(deployments.vault);
    const perMilestone = await vault.milestoneUnlockAmount();
    console.log(`\n  Vault balance: ${ethers.formatUnits(vaultBalance, decimals)} ${symbol}`);
    console.log(`  Per milestone: ${ethers.formatUnits(perMilestone, decimals)} ${symbol}`);
  }
  console.log();

  // =====================
  // FINAL SUMMARY
  // =====================

  const finalVaultBalance = await fairToken.balanceOf(deployments.vault);
  const isVaultFunded = finalVaultBalance > 0n;

  console.log("=".repeat(70));
  console.log("✅ DEPLOYMENT COMPLETE!");
  console.log("=".repeat(70));
  console.log("\nDeployed Contracts:");
  console.log(`  FAIRVault: ${deployments.vault}`);
  console.log(`  AerodromeTWAPOracle: ${deployments.twapOracle}\n`);
  
  console.log("🔒 Security Status:");
  console.log("  • Oracle: PERMANENTLY FROZEN");
  console.log("  • Price Source: Aerodrome TWAP (on-chain)");
  console.log("  • Pool Wallets: IMMUTABLE");
  console.log("  • Unlocks: FULLY AUTOMATIC\n");
  
  console.log("💰 Vault Status:");
  console.log(`  • Funded: ${isVaultFunded ? "✅ YES" : "❌ NO"}`);
  console.log(`  • Balance: ${ethers.formatUnits(finalVaultBalance, decimals)} ${symbol}\n`);

  console.log("Verify on Basescan:");
  console.log(`  Vault: ${config.explorer}/address/${deployments.vault}`);
  console.log(`  Oracle: ${config.explorer}/address/${deployments.twapOracle}\n`);

  if (isVaultFunded) {
    console.log("=".repeat(70));
    console.log("📋 NEXT STEP: Start the Keeper Bot");
    console.log("=".repeat(70));
    console.log("\n  node scripts/keeper/keeper.js mainnet\n");
  } else {
    console.log("=".repeat(70));
    console.log("📋 REMAINING STEPS:");
    console.log("=".repeat(70));
    console.log("\n  1. FUND THE VAULT:");
    console.log(`     Transfer ${symbol} tokens to: ${deployments.vault}`);
    console.log("     Then call: vault.initialize(amount)\n");
    console.log("  2. START KEEPER BOT:");
    console.log("     node scripts/keeper/keeper.js mainnet\n");
  }
  
  console.log("=".repeat(70));
  console.log("\n⚠️  The system is now TRUSTLESS.");
  console.log("    No one can change the oracle, recipients, or unlock rules.");
  console.log("    Milestones unlock AUTOMATICALLY when conditions are met.\n");
}

main().catch((err) => {
  console.error("❌ Deployment failed from main :", err.message);
  process.exitCode = 1;
});

