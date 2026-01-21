// scripts/shared/artifacts.js
// Contract artifact loading utilities

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACTS_DIR = path.join(__dirname, "..", "..", "artifacts", "contracts");

/**
 * Load contract artifact by name
 * @param {string} contractName - Name of the contract (e.g., 'FAIR', 'FAIRTestnet', 'MockOracle')
 */
export function loadArtifact(contractName) {
  const artifactPath = path.join(ARTIFACTS_DIR, `${contractName}.sol`, `${contractName}.json`);
  
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`
      Artifact not found: ${contractName}
      Path: ${artifactPath}
      
      Run 'npx hardhat compile' first.
    `);
  }
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode,
  };
}

/**
 * Get all available contract artifacts
 */
export function listArtifacts() {
  const contracts = [];
  
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    console.log("No artifacts found. Run 'npx hardhat compile' first.");
    return contracts;
  }
  
  const dirs = fs.readdirSync(ARTIFACTS_DIR);
  for (const dir of dirs) {
    if (dir.endsWith(".sol")) {
      const name = dir.replace(".sol", "");
      contracts.push(name);
    }
  }
  
  return contracts;
}

/**
 * Contract names available in the system
 */
export const CONTRACTS = {
  // Production (10B) - creates new token
  FAIR: "FAIR",
  FAIR_TESTNET: "FAIRTestnet",
  
  // Vault - for existing token (timing configurable via constructor)
  FAIR_VAULT: "FAIRVault",
  
  // Oracles
  MOCK_ORACLE: "MockOracle",
  TWAP_ORACLE: "AerodromeTWAPOracle", // For CL/Slipstream pools
  V2_ORACLE: "AerodromeV2Oracle", // For V2 pools
  UNISWAP_V3_ORACLE: "UniswapV3Oracle", // For Uniswap V3 pools
  AGGREGATE_ORACLE: "AggregateOracle", // Multi-source aggregate oracle
  CHAINLINK_ADAPTER: "ChainlinkOracleAdapter", // Chainlink price feed adapter
};


