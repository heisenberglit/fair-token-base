import "dotenv/config";

const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "";
const BASE_MAINNET_RPC_URL = process.env.BASE_MAINNET_RPC_URL ?? "https://mainnet.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";

const networks: any = {
  localhost: {
    type: "http",
    url: "http://127.0.0.1:8545",
    // Hardhat node provides accounts automatically
  },
};

// Only add baseMainnet if we have a valid URL
if (BASE_MAINNET_RPC_URL) {
  networks.baseMainnet = {
    type: "http",
    url: BASE_MAINNET_RPC_URL,
    accounts: PRIVATE_KEY !== "" ? [PRIVATE_KEY] : [],
  };
}

// Only add baseSepolia if we have a valid URL
if (BASE_SEPOLIA_RPC_URL) {
  networks.baseSepolia = {
    type: "http",
    url: BASE_SEPOLIA_RPC_URL,
    accounts: PRIVATE_KEY !== "" ? [PRIVATE_KEY] : [],
  };
}

export default {
  solidity: "0.8.24",
  networks,
};