// scripts/mainnet/build-pool-history.js
// Make small swaps on the pool to build observation history
// Usage: node scripts/mainnet/build-pool-history.js [POOL_ADDRESS] [NUM_SWAPS]

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔄 Build Pool Observation History");
  console.log("=".repeat(70) + "\n");

  const network = process.env.NETWORK || "mainnet";
  const config = getNetworkConfig(network);
  const wallet = getWallet(network);

  const AERODROME_POOL = process.env.AERODROME_POOL_MAINNET || process.env.AERODROME_POOL || process.argv[2];
  const NUM_SWAPS = parseInt(process.argv[3] || process.env.NUM_SWAPS || "50", 10);
  const SWAP_AMOUNT_USDC = process.env.SWAP_AMOUNT_USDC || "0.01"; // 0.01 USDC per swap
  const SWAP_DELAY_MS = parseInt(process.env.SWAP_DELAY_MS || "2000", 10); // 2 seconds between swaps

  if (!AERODROME_POOL) {
    console.log("❌ Please provide pool address:");
    console.log("   node scripts/mainnet/build-pool-history.js <POOL_ADDRESS> [NUM_SWAPS]");
    console.log("   OR set AERODROME_POOL_MAINNET in .env\n");
    process.exit(1);
  }

  console.log(`📡 Network: ${network}`);
  console.log(`👤 Wallet: ${wallet.address}`);
  console.log(`🏊 Pool: ${AERODROME_POOL}`);
  console.log(`🔄 Number of swaps: ${NUM_SWAPS}`);
  console.log(`💰 Swap amount: ${SWAP_AMOUNT_USDC} USDC per swap`);
  console.log(`⏱️  Delay between swaps: ${SWAP_DELAY_MS}ms`);
  console.log(`📋 ${config.explorer}/address/${AERODROME_POOL}\n`);

  // Get token addresses
  const FAIR_TOKEN = process.env.EXISTING_FAIR_TOKEN || process.env.FAIR_TOKEN_MAINNET;
  const USDC_ADDRESS = config.usdc;

  if (!FAIR_TOKEN) {
    console.log("❌ Please set EXISTING_FAIR_TOKEN or FAIR_TOKEN_MAINNET in .env\n");
    process.exit(1);
  }

  // ERC20 ABI
  const erc20Abi = [
    "function decimals() external view returns (uint8)",
    "function balanceOf(address) external view returns (uint256)",
    "function approve(address, uint256) external returns (bool)",
    "function allowance(address, address) external view returns (uint256)",
  ];

  // Pool ABI for direct swaps (CL pool)
  const poolAbi = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data) external returns (int256 amount0, int256 amount1)",
  ];

  // Aerodrome Router ABI (V2 style - may need adjustment)
  const routerAbi = [
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
  ];

  const fairToken = new ethers.Contract(FAIR_TOKEN, erc20Abi, wallet);
  const usdcToken = new ethers.Contract(USDC_ADDRESS, erc20Abi, wallet);
  const poolContract = new ethers.Contract(AERODROME_POOL, poolAbi, wallet);

  try {
    // Check balances
    console.log("=".repeat(70));
    console.log("Checking Balances");
    console.log("=".repeat(70));

    const fairDecimals = await fairToken.decimals();
    const usdcDecimals = await usdcToken.decimals();
    const swapAmount = ethers.parseUnits(SWAP_AMOUNT_USDC, usdcDecimals);

    const fairBalance = await fairToken.balanceOf(wallet.address);
    const usdcBalance = await usdcToken.balanceOf(wallet.address);

    console.log(`   FAIR Balance: ${ethers.formatUnits(fairBalance, fairDecimals)} FAIR`);
    console.log(`   USDC Balance: ${ethers.formatUnits(usdcBalance, usdcDecimals)} USDC`);
    console.log(`   Swap Amount: ${SWAP_AMOUNT_USDC} USDC\n`);

    // Check if we have enough USDC
    const totalUsdcNeeded = swapAmount * BigInt(Math.floor(NUM_SWAPS / 2)); // Half swaps are USDC -> FAIR
    if (usdcBalance < totalUsdcNeeded) {
      console.log(`   ⚠️  Warning: May not have enough USDC for all swaps`);
      console.log(`      Have: ${ethers.formatUnits(usdcBalance, usdcDecimals)} USDC`);
      console.log(`      Need: ~${ethers.formatUnits(totalUsdcNeeded, usdcDecimals)} USDC\n`);
    }

    // Get pool tokens to determine swap direction
    const token0 = await poolContract.token0();
    const token1 = await poolContract.token1();
    const fairIsToken0 = token0.toLowerCase() === FAIR_TOKEN.toLowerCase();

    console.log(`   Pool Token0: ${token0}`);
    console.log(`   Pool Token1: ${token1}`);
    console.log(`   FAIR is Token0: ${fairIsToken0}\n`);

    // For CL pools, we'll use a simpler approach: direct pool interaction
    // But first, let's try to find the Aerodrome router
    // Base mainnet Aerodrome router: 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E45 (V2) or check for V3
    // Actually, for CL pools, we might need to use a different router
    
    // Alternative: Use a simple swap interface that works with CL pools
    // We'll use the pool's swap function directly, but it's complex
    
    // Better approach: Use Aerodrome's router if available, or guide user
    // Aerodrome router addresses on Base mainnet
    // V2 Router (for basic pools): 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E45
    // For CL pools, we need to check which router supports them
    // Base mainnet Aerodrome router that supports CL: 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E45
    // Actually, Aerodrome uses a unified router that supports both V2 and CL pools
    const routerAddressRaw = process.env.AERODROME_ROUTER || "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E45";
    const AERODROME_ROUTER = ethers.getAddress(routerAddressRaw.toLowerCase()); // Properly checksum the address
    
    console.log("=".repeat(70));
    console.log("Swap Method");
    console.log("=".repeat(70));
    console.log(`   For CL pools, we'll use the Aerodrome router.`);
    console.log(`   Router: ${AERODROME_ROUTER}`);
    console.log(`   Note: If this router doesn't work, you may need to update AERODROME_ROUTER in .env\n`);
    
    console.log("=".repeat(70));
    console.log("Starting Swaps");
    console.log("=".repeat(70));
    console.log(`   Making ${NUM_SWAPS} swaps alternating directions...\n`);

    let successCount = 0;
    let failCount = 0;

    // Approve tokens if needed
    const routerAddress = AERODROME_ROUTER; // Already checksummed
    const router = new ethers.Contract(routerAddress, routerAbi, wallet);

    // Check and approve USDC
    const usdcAllowance = await usdcToken.allowance(wallet.address, routerAddress);
    if (usdcAllowance < totalUsdcNeeded) {
      console.log(`   Approving USDC for router...`);
      const approveUsdc = await usdcToken.approve(routerAddress, ethers.MaxUint256);
      await approveUsdc.wait();
      console.log(`   ✅ USDC approved\n`);
    }

    // Check and approve FAIR
    const fairAllowance = await fairToken.allowance(wallet.address, routerAddress);
    if (fairAllowance < swapAmount * BigInt(10)) { // Approve more than needed
      console.log(`   Approving FAIR for router...`);
      const approveFair = await fairToken.approve(routerAddress, ethers.MaxUint256);
      await approveFair.wait();
      console.log(`   ✅ FAIR approved\n`);
    }

    // Determine swap path (order matters for router)
    const pathUsdcToFair = [USDC_ADDRESS, FAIR_TOKEN];
    const pathFairToUsdc = [FAIR_TOKEN, USDC_ADDRESS];

    for (let i = 0; i < NUM_SWAPS; i++) {
      const isUsdcToFair = i % 2 === 0; // Alternate directions
      const direction = isUsdcToFair ? "USDC → FAIR" : "FAIR → USDC";
      
      try {
        const gasPrice = await wallet.provider.getFeeData();
        const nonce = await wallet.provider.getTransactionCount(wallet.address, "pending");

        let tx;
        const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

        if (isUsdcToFair) {
          // USDC -> FAIR
          const amountOutMin = 0; // Accept any amount out (slippage)
          tx = await router.swapExactTokensForTokens(
            swapAmount,
            amountOutMin,
            pathUsdcToFair,
            wallet.address,
            deadline,
            {
              nonce,
              maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
              maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
            }
          );
        } else {
          // FAIR -> USDC
          // Get quote: how much FAIR for 0.01 USDC, then swap that amount back
          try {
            const amounts = await router.getAmountsOut(swapAmount, pathUsdcToFair);
            const fairAmountFor01Usdc = amounts[1]; // Amount of FAIR equivalent to 0.01 USDC
            
            // Swap that FAIR amount back to USDC
            const amountOutMin = 0;
            tx = await router.swapExactTokensForTokens(
              fairAmountFor01Usdc,
              amountOutMin,
              pathFairToUsdc,
              wallet.address,
              deadline,
              {
                nonce,
                maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
                maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
              }
            );
          } catch (quoteError) {
            // If quote fails, use a small fixed FAIR amount (roughly equivalent to 0.01 USDC at low price)
            // At $0.00001 per FAIR, 0.01 USDC = 1000 FAIR
            const smallFairAmount = ethers.parseUnits("1000", fairDecimals);
            const amountOutMin = 0;
            tx = await router.swapExactTokensForTokens(
              smallFairAmount,
              amountOutMin,
              pathFairToUsdc,
              wallet.address,
              deadline,
              {
                nonce,
                maxFeePerGas: gasPrice.maxFeePerGas ? gasPrice.maxFeePerGas * 2n : undefined,
                maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? gasPrice.maxPriorityFeePerGas * 2n : undefined,
              }
            );
          }
        }

        console.log(`   [${i + 1}/${NUM_SWAPS}] ${direction}: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`      ✅ Confirmed (gas: ${receipt.gasUsed.toString()})`);
        successCount++;

        // Wait before next swap
        if (i < NUM_SWAPS - 1) {
          await new Promise(resolve => setTimeout(resolve, SWAP_DELAY_MS));
        }
      } catch (error) {
        console.log(`   [${i + 1}/${NUM_SWAPS}] ${direction}: ❌ Failed`);
        console.log(`      Error: ${error.message}`);
        failCount++;
        
        // Wait a bit longer on error
        await new Promise(resolve => setTimeout(resolve, SWAP_DELAY_MS * 2));
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("Summary");
    console.log("=".repeat(70));
    console.log(`   ✅ Successful swaps: ${successCount}`);
    console.log(`   ❌ Failed swaps: ${failCount}`);
    console.log(`   📊 Total: ${successCount + failCount} / ${NUM_SWAPS}\n`);

    if (successCount > 0) {
      console.log(`   🎉 Made ${successCount} swaps to build pool history!`);
      console.log(`   💡 Check observation history:`);
      console.log(`      node scripts/mainnet/check-pool-observations.js\n`);
    }

  } catch (error) {
    console.log(`\n❌ Error: ${error.message}\n`);
    console.log(`   This might be due to:`);
    console.log(`   - Router address incorrect`);
    console.log(`   - Insufficient balance`);
    console.log(`   - Pool/router interface mismatch\n`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Script failed:");
    console.error(error);
    process.exit(1);
  });

