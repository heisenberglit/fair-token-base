// scripts/shared/config.js
// Centralized configuration for all environments

import "dotenv/config";

/**
 * FAIR 10B Tokenomics Configuration
 */
export const TOKENOMICS = {
  TOTAL_SUPPLY: "10000000000", // 10B
  MILESTONE_UNLOCK: "500000000", // 500M per milestone (5%)
  TGE_AMOUNT: "1000000000", // 1B (10%)
  LOCKED_AMOUNT: "9000000000", // 9B (90%)
  START_PRICE: 10, // $0.000010 in 1e9 units
  MILESTONES: 18,
  COOLDOWN_DAYS: 90,
  GOOD_HOURS: 360,
};

/**
 * Pool distribution percentages
 */
export const POOLS = {
  TREASURY: 5000, // 55.56%
  GROWTH: 2000, // 22.22%
  LIQUIDITY: 1000, // 11.11%
  TEAM: 1000, // 11.11%
  TOTAL: 9000,
};

/**
 * TGE Timestamp: January 1, 2026 00:00 GMT
 */
export const TGE_TIMESTAMP = process.env.TGE_TIMESTAMP || 1735689600;

/**
 * Network configurations
 */
export const NETWORKS = {
  local: {
    name: "Local Hardhat Fork",
    rpcUrl: "http://localhost:8545",
    chainId: 31337,
    explorer: null,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // From fork
  },
  testnet: {
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    chainId: 84532,
    explorer: "https://sepolia.basescan.org",
    usdc: process.env.USDC_SEPOLIA || "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  mainnet: {
    name: "Base Mainnet",
    rpcUrl: process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org",
    chainId: 8453,
    explorer: "https://basescan.org",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
};

/**
 * Pool wallet addresses (recipients of milestone unlocks)
 * IMPORTANT: Set these in .env before deployment!
 */
export const WALLETS = {
  treasury: process.env.TREASURY_WALLET,
  growth: process.env.GROWTH_WALLET,
  liquidity: process.env.LIQUIDITY_WALLET,
  team: process.env.TEAM_WALLET,
};

/**
 * Placeholder addresses for local testing only
 */
export const TEST_WALLETS = {
  treasury: "0x62c944758F34D598CC817F2bfB7205b467Cf5C3b",
  growth: "0x8FeAD17f278B4d7b15138a742bb997f1163Ccb20",
  liquidity: "0x70Cf1c0469ddB9bE9319c152232FFac3B584D09A",
  team: "0x6E542b2283242D1B896698c8Be0292480bc3e1c3",
};

/**
 * Get wallet addresses for deployment
 * @param {boolean} requireReal - If true, throws error if real addresses not set
 */
export function getWalletAddresses(requireReal = false) {
  if (requireReal) {
    if (!WALLETS.treasury || !WALLETS.growth || !WALLETS.liquidity || !WALLETS.team) {
      throw new Error(`
        ❌ WALLET ADDRESSES NOT SET!
        
        Set these in .env:
          TREASURY_WALLET=0x...
          GROWTH_WALLET=0x...
          LIQUIDITY_WALLET=0x...
          TEAM_WALLET=0x...
      `);
    }
    return WALLETS;
  }
  
  // For testing, fall back to test addresses
  return {
    treasury: WALLETS.treasury || TEST_WALLETS.treasury,
    growth: WALLETS.growth || TEST_WALLETS.growth,
    liquidity: WALLETS.liquidity || TEST_WALLETS.liquidity,
    team: WALLETS.team || TEST_WALLETS.team,
  };
}

/**
 * Get network configuration
 * @param {string} network - 'local', 'testnet', or 'mainnet'
 */
export function getNetworkConfig(network) {
  if (!NETWORKS[network]) {
    throw new Error(`Unknown network: ${network}. Use: local, testnet, or mainnet`);
  }
  return NETWORKS[network];
}


