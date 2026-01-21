// scripts/shared/provider.js
// Provider and wallet utilities

import { ethers } from "ethers";
import { getNetworkConfig } from "./config.js";
import "dotenv/config";

/**
 * Get provider for specified network
 * @param {string} network - 'local', 'testnet', or 'mainnet'
 */
export function getProvider(network) {
  const config = getNetworkConfig(network);
  return new ethers.JsonRpcProvider(config.rpcUrl);
}

/**
 * Get wallet connected to provider
 * @param {string} network - 'local', 'testnet', or 'mainnet'
 * @param {string} [privateKey] - Optional private key (uses env if not provided)
 */
export function getWallet(network, privateKey) {
  const provider = getProvider(network);
  
  // For local, use Hardhat's default account
  if (network === "local") {
    const defaultKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    return new ethers.Wallet(defaultKey, provider);
  }
  
  const key = privateKey || process.env.PRIVATE_KEY;
  if (!key) {
    throw new Error("PRIVATE_KEY not set in .env");
  }
  
  const pk = key.startsWith("0x") ? key : `0x${key}`;
  return new ethers.Wallet(pk, provider);
}

/**
 * Get wallet balance in ETH
 * @param {ethers.Wallet} wallet
 */
export async function getBalance(wallet) {
  const balance = await wallet.provider.getBalance(wallet.address);
  return ethers.formatEther(balance);
}

/**
 * Check if wallet has minimum balance
 * @param {ethers.Wallet} wallet
 * @param {string} minEth - Minimum ETH required
 */
export async function checkBalance(wallet, minEth = "0.01") {
  const balance = await wallet.provider.getBalance(wallet.address);
  const minBalance = ethers.parseEther(minEth);
  
  if (balance < minBalance) {
    throw new Error(`Insufficient balance: ${ethers.formatEther(balance)} ETH (need ${minEth} ETH)`);
  }
  
  return ethers.formatEther(balance);
}




