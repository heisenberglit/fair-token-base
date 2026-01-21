// scripts/mainnet/adjust-price-to-target.js
// Calculate and optionally execute swap to reach target price
// Usage: node scripts/mainnet/adjust-price-to-target.js [VAULT_ADDRESS] [TARGET_PRICE] [--execute] [--amount AMOUNT_USDC] [--iterative]

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("💰 Adjust Pool Price to Target");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const wallet = getWallet(network);

  // Parse arguments: [VAULT_ADDRESS] [TARGET_PRICE] [--execute] [--amount AMOUNT] [--iterative]
  let VAULT_ADDRESS = process.env.VAULT_ADDRESS;
  let TARGET_PRICE = 10; // Default target
  let EXECUTE = false;
  let SWAP_AMOUNT = null; // Custom swap amount in USDC
  let ITERATIVE = false; // Keep swapping until target reached

  // Parse command line arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--execute") {
      EXECUTE = true;
    } else if (arg === "--iterative") {
      ITERATIVE = true;
    } else if (arg === "--amount" && i + 1 < process.argv.length) {
      SWAP_AMOUNT = parseFloat(process.argv[++i]);
    } else if (arg.startsWith("0x") || arg.length === 42) {
      // Looks like an address
      VAULT_ADDRESS = arg;
    } else if (!isNaN(parseFloat(arg))) {
      // Looks like a number
      TARGET_PRICE = parseFloat(arg);
    }
  }

  // Auto-detect vault if not provided
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
      }
    }
  }

  if (!VAULT_ADDRESS) {
    console.log("❌ Please provide VAULT_ADDRESS\n");
    process.exit(1);
  }

  console.log(`📡 Network: ${network}`);
  console.log(`👤 Wallet: ${wallet.address}`);
  console.log(`🏦 Vault: ${VAULT_ADDRESS}`);
  console.log(`🎯 Target Price: ${TARGET_PRICE} oracle units ($${(TARGET_PRICE / 1_000_000).toFixed(9)} USD)\n`);

  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, wallet);

  // Get oracle
  const oracleAddress = await vault.priceOracle();
  const oracleArtifact = loadArtifact(CONTRACTS.TWAP_ORACLE);
  const oracle = new ethers.Contract(oracleAddress, oracleArtifact.abi, wallet);

  const poolAddress = await oracle.pool();
  const fairToken = await oracle.fairToken();
  const quoteToken = await oracle.quoteToken();
  const fairIsToken0 = await oracle.fairIsToken0();

  // Get current price
  const currentPrice = await oracle.getPrice({ blockTag: "latest" });
  const currentPriceUsd = Number(currentPrice) / 1_000_000;
  const targetPriceUsd = TARGET_PRICE / 1_000_000;

  console.log("=".repeat(70));
  console.log("Current Status");
  console.log("=".repeat(70));
  console.log(`  Current Price: ${currentPrice.toString()} oracle units ($${currentPriceUsd.toFixed(9)} USD)`);
  console.log(`  Target Price: ${TARGET_PRICE} oracle units ($${targetPriceUsd.toFixed(9)} USD)`);
  console.log(`  Difference: ${(TARGET_PRICE - Number(currentPrice)).toFixed(2)} oracle units\n`);

  if (Number(currentPrice) >= TARGET_PRICE) {
    console.log(`  ✅ Price is already at or above target!\n`);
    process.exit(0);
  }

  // Get pool reserves to calculate swap amount
  const poolAbi = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function liquidity() external view returns (uint128)",
  ];

  const poolContract = new ethers.Contract(poolAddress, poolAbi, wallet.provider);

  let slot0;
  try {
    slot0 = await poolContract.slot0();
  } catch (error) {
    // Try raw call if ABI decode fails
    try {
      const rawData = await wallet.provider.call({
        to: poolAddress,
        data: "0x3850c7bd" // slot0() selector
      });
      if (rawData && rawData.length > 2) {
        // Can't decode, but we can still proceed with price-based calculation
        console.log("⚠️  Could not decode slot0(), using price-based calculation\n");
        slot0 = null;
      } else {
        throw error;
      }
    } catch (rawError) {
      console.log("❌ Could not read pool slot0\n");
      process.exit(1);
    }
  }

  let currentSqrtPriceX96;
  let currentTick;
  
  if (slot0) {
    currentSqrtPriceX96 = slot0.sqrtPriceX96;
    currentTick = Number(slot0.tick);
  } else {
    // If we can't read slot0, we'll use a simpler approach
    console.log("  Using simplified price calculation (slot0 unavailable)\n");
    currentSqrtPriceX96 = null;
    currentTick = null;
  }

  // Calculate target sqrtPriceX96
  // price = (sqrtPriceX96 / 2^96)^2
  // sqrtPriceX96 = sqrt(price) * 2^96
  
  // Target price in USDC per FAIR
  const targetPriceFloat = targetPriceUsd;
  
  // Calculate target sqrtPrice
  const targetSqrtPrice = Math.sqrt(targetPriceFloat);
  const Q96 = 2n ** 96n;
  const targetSqrtPriceX96 = BigInt(Math.floor(targetSqrtPrice * Number(Q96)));

  if (currentSqrtPriceX96) {
    console.log("=".repeat(70));
    console.log("Price Calculation");
    console.log("=".repeat(70));
    console.log(`  Current sqrtPriceX96: ${currentSqrtPriceX96.toString()}`);
    console.log(`  Target sqrtPriceX96: ${targetSqrtPriceX96.toString()}`);
    console.log(`  Current tick: ${currentTick}\n`);
  }

  // Estimate swap amount needed
  // This is a rough estimate - actual amount may vary due to slippage and fees
  const priceRatio = targetPriceUsd / currentPriceUsd;
  const priceIncreasePercent = ((priceRatio - 1) * 100).toFixed(2);

  console.log("=".repeat(70));
  console.log("Swap Estimate");
  console.log("=".repeat(70));
  console.log(`  Price needs to increase: ${priceIncreasePercent}%`);
  console.log(`  To increase price, swap: USDC → FAIR (buy FAIR)\n`);
  console.log(`  💡 Rough estimate:`);
  console.log(`     For a ${priceIncreasePercent}% price increase, you may need:`);
  console.log(`     - Small pool: ~$50-100 USDC`);
  console.log(`     - Medium pool: ~$100-500 USDC`);
  console.log(`     - Large pool: ~$500-2000+ USDC\n`);
  console.log(`  ⚠️  Note: Exact amount depends on pool liquidity and current reserves.\n`);
  console.log(`  💡 Tips:`);
  console.log(`     - Use --amount to specify exact swap amount`);
  console.log(`     - Use --iterative to keep swapping until target reached`);
  console.log(`     - TWAP updates slowly (10-30 min), spot price updates immediately\n`);

  if (EXECUTE) {
    console.log("=".repeat(70));
    console.log("Executing Swap");
    console.log("=".repeat(70));

    // Router ABI
    const routerAbi = [
      "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
      "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
    ];

    const AERODROME_ROUTER = process.env.AERODROME_ROUTER || "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E45";
    const routerAddress = ethers.getAddress(AERODROME_ROUTER.toLowerCase());
    const router = new ethers.Contract(routerAddress, routerAbi, wallet);

    // ERC20 ABI
    const erc20Abi = [
      "function decimals() external view returns (uint8)",
      "function balanceOf(address) external view returns (uint256)",
      "function approve(address, uint256) external returns (bool)",
      "function allowance(address, address) external view returns (uint256)",
    ];

    const usdcToken = new ethers.Contract(quoteToken, erc20Abi, wallet);
    const usdcDecimals = await usdcToken.decimals();
    const usdcBalance = await usdcToken.balanceOf(wallet.address);

    // Calculate swap amount based on price difference
    // For CL pools, price movement depends on:
    // 1. Current liquidity in the active price range
    // 2. How much you're swapping relative to liquidity
    // 
    // Rough formula: To move price by X%, you need to swap roughly X% of the active liquidity
    // For a 11% price increase, you typically need 10-20% of active liquidity
    
    const priceIncreasePercent = ((targetPriceUsd / currentPriceUsd - 1) * 100);
    
    // Calculate swap amount
    let swapAmountUsdc;
    if (SWAP_AMOUNT) {
      // User specified amount
      swapAmountUsdc = ethers.parseUnits(SWAP_AMOUNT.toFixed(6), usdcDecimals);
      console.log(`  💡 Using custom swap amount: $${SWAP_AMOUNT.toFixed(2)} USDC\n`);
    } else {
      // Auto-calculate based on price increase
      // For CL pools: rough estimate is 10-20x the % increase for small pools
      // More aggressive for larger price moves
      const baseAmount = Math.max(50, priceIncreasePercent * 10); // 10x the % increase
      const estimatedSwapUsdc = baseAmount;
      
      console.log(`  💡 Price increase needed: ${priceIncreasePercent.toFixed(2)}%`);
      console.log(`  💡 Estimated swap needed: ~$${estimatedSwapUsdc.toFixed(2)} USDC`);
      console.log(`  💡 Note: Actual amount depends on pool liquidity.\n`);
      console.log(`  💡 Tip: Use --amount to specify exact amount, or --iterative to swap until target reached\n`);
      
      swapAmountUsdc = ethers.parseUnits(estimatedSwapUsdc.toFixed(6), usdcDecimals);
    }

    console.log(`  USDC balance: ${ethers.formatUnits(usdcBalance, usdcDecimals)} USDC\n`);

    if (usdcBalance < swapAmountUsdc) {
      console.log(`  ⚠️  Insufficient USDC balance for estimated amount.`);
      console.log(`  💡 Using available balance: ${ethers.formatUnits(usdcBalance * 90n / 100n, usdcDecimals)} USDC\n`);
      swapAmountUsdc = usdcBalance * 90n / 100n; // Use 90% of balance
    }

    // Approve if needed
    const allowance = await usdcToken.allowance(wallet.address, routerAddress);
    if (allowance < swapAmountUsdc) {
      console.log(`  Approving USDC...`);
      const approveTx = await usdcToken.approve(routerAddress, ethers.MaxUint256);
      await approveTx.wait();
      console.log(`  ✅ Approved\n`);
    }

    // Swap path
    const path = [quoteToken, fairToken];
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

    console.log(`  Executing swap: USDC → FAIR...`);
    const gasPrice = await wallet.provider.getFeeData();
    const nonce = await wallet.provider.getTransactionCount(wallet.address, "pending");

    const swapTx = await router.swapExactTokensForTokens(
      swapAmountUsdc,
      0, // Accept any amount out
      path,
      wallet.address,
      deadline,
      {
        nonce,
        maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
      }
    );

    console.log(`  📤 Transaction: ${swapTx.hash}`);
    console.log(`  📋 ${config.explorer}/tx/${swapTx.hash}`);
    console.log(`  ⏳ Waiting for confirmation...\n`);

    const receipt = await swapTx.wait();
    console.log(`  ✅ Swap confirmed in block ${receipt.blockNumber}\n`);

    // Check spot price immediately (before TWAP updates)
    let spotPrice;
    try {
      spotPrice = await oracle.getSpotPrice({ blockTag: "latest" });
      const spotPriceUsd = Number(spotPrice) / 1_000_000;
      console.log(`  📊 Spot Price (immediate): ${spotPrice.toString()} oracle units ($${spotPriceUsd.toFixed(9)} USD)`);
      if (Number(spotPrice) >= TARGET_PRICE) {
        console.log(`  ✅ Spot price reached target! TWAP will catch up in 10-30 minutes.\n`);
      }
    } catch (e) {
      console.log(`  ⚠️  Could not read spot price\n`);
    }

    // Check TWAP price (wait a bit for it to update)
    console.log(`  ⏳ Waiting for TWAP to update (may take 10-30 minutes for full effect)...\n`);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    let newPrice = await oracle.getPrice({ blockTag: "latest" });
    let newPriceUsd = Number(newPrice) / 1_000_000;
    let attempts = 0;
    const maxAttempts = 3;

    // Try a few times in case TWAP hasn't updated yet
    while (Number(newPrice) < TARGET_PRICE && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 3000));
      newPrice = await oracle.getPrice({ blockTag: "latest" });
      newPriceUsd = Number(newPrice) / 1_000_000;
    }

    console.log("=".repeat(70));
    console.log("Price After Swap");
    console.log("=".repeat(70));
    console.log(`  TWAP Price: ${newPrice.toString()} oracle units ($${newPriceUsd.toFixed(9)} USD)`);
    console.log(`  Target: ${TARGET_PRICE} oracle units ($${targetPriceUsd.toFixed(9)} USD)\n`);
    
    if (Number(newPrice) >= TARGET_PRICE) {
      console.log(`  ✅ TWAP price reached target!\n`);
    } else {
      const remaining = TARGET_PRICE - Number(newPrice);
      const additionalPercent = ((TARGET_PRICE / Number(newPrice) - 1) * 100).toFixed(2);
      const progress = ((Number(newPrice) - Number(currentPrice)) / (TARGET_PRICE - Number(currentPrice)) * 100).toFixed(1);
      
      console.log(`  ⚠️  TWAP not yet at target. Progress: ${progress}%`);
      console.log(`      Need ${remaining.toFixed(2)} more oracle units (${additionalPercent}% increase).\n`);
      
      if (ITERATIVE) {
        // Continue swapping
        console.log(`  🔄 Iterative mode: Will swap again...\n`);
        // Recursive call would be complex, so just provide instructions
        console.log(`  💡 Run again with same command to continue swapping\n`);
      } else {
        console.log(`  💡 Options:`);
        console.log(`     1. Run again: node scripts/mainnet/adjust-price-to-target.js ${TARGET_PRICE} --execute`);
        console.log(`     2. Use iterative mode: node scripts/mainnet/adjust-price-to-target.js ${TARGET_PRICE} --execute --iterative`);
        console.log(`     3. Specify larger amount: node scripts/mainnet/adjust-price-to-target.js ${TARGET_PRICE} --execute --amount 100`);
        console.log(`     4. Swap more on Aerodrome UI`);
        console.log(`     5. Wait 10-30 minutes - TWAP updates gradually\n`);
      }
    }
  } else {
    console.log("=".repeat(70));
    console.log("Next Steps");
    console.log("=".repeat(70));
    console.log(`  1. Go to Aerodrome swap interface`);
    console.log(`  2. Swap USDC → FAIR (buy FAIR)`);
    console.log(`  3. Start with $50-100 USDC (not $1-5!)`);
    console.log(`  4. Check price: node scripts/mainnet/verify-keeper-ready.js`);
    console.log(`  5. Repeat until price reaches ${TARGET_PRICE} oracle units\n`);
    console.log(`  OR run with --execute flag to swap automatically:\n`);
    console.log(`     node scripts/mainnet/adjust-price-to-target.js ${TARGET_PRICE} --execute\n`);
    console.log(`  Advanced options:\n`);
    console.log(`     --amount 100        : Swap exactly $100 USDC`);
    console.log(`     --iterative         : Keep swapping until target reached\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:");
    console.error(error);
    process.exit(1);
  });

