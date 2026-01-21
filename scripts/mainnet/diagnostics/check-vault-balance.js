// scripts/mainnet/check-vault-balance.js
// Check vault balance and provide withdrawal options

import { ethers } from "ethers";
import { getWallet } from "../shared/provider.js";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";
import { getNetworkConfig } from "../shared/config.js";
import "dotenv/config";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 Vault Balance & Withdrawal Options");
  console.log("=".repeat(70) + "\n");

  const VAULT_ADDRESS = process.argv[2] || process.env.VAULT_ADDRESS;
  
  if (!VAULT_ADDRESS) {
    console.log("❌ Please provide VAULT_ADDRESS:");
    console.log("   node scripts/mainnet/check-vault-balance.js <VAULT_ADDRESS>\n");
    process.exit(1);
  }

  const config = getNetworkConfig("mainnet");
  const wallet = getWallet("mainnet");
  const provider = wallet.provider;

  console.log(`Vault Address: ${VAULT_ADDRESS}`);
  console.log(`Network: ${config.name}`);
  console.log(`Explorer: ${config.explorer}/address/${VAULT_ADDRESS}\n`);

  const vaultArtifact = loadArtifact(CONTRACTS.FAIR_VAULT);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultArtifact.abi, provider);

  try {
    // Check vault state
    const fairTokenAddr = await vault.fairToken();
    const initialized = await vault.initialized();
    const totalDeposited = await vault.totalDeposited();
    const owner = await vault.owner();
    const oracleFrozen = await vault.oracleFrozen();
    const oracleAddr = await vault.priceOracle();

    console.log("=".repeat(70));
    console.log("Vault Status");
    console.log("=".repeat(70));
    console.log(`  Owner: ${owner}`);
    console.log(`  Your Address: ${wallet.address}`);
    console.log(`  Owner Match: ${owner.toLowerCase() === wallet.address.toLowerCase() ? "✅ YES" : "❌ NO"}`);
    console.log(`  Initialized: ${initialized ? "✅ YES" : "❌ NO"}`);
    console.log(`  Oracle Frozen: ${oracleFrozen ? "✅ YES" : "❌ NO"}`);
    console.log(`  Oracle Address: ${oracleAddr}\n`);

    // Check token balance
    const erc20Abi = [
      "function balanceOf(address) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
    ];
    const fairToken = new ethers.Contract(fairTokenAddr, erc20Abi, provider);
    
    const symbol = await fairToken.symbol();
    const decimals = await fairToken.decimals();
    const vaultBalance = await fairToken.balanceOf(VAULT_ADDRESS);
    
    console.log("=".repeat(70));
    console.log("Token Balance");
    console.log("=".repeat(70));
    console.log(`  Token: ${symbol} (${fairTokenAddr})`);
    console.log(`  Vault Balance: ${ethers.formatUnits(vaultBalance, decimals)} ${symbol}`);
    console.log(`  Total Deposited: ${ethers.formatUnits(totalDeposited, decimals)} ${symbol}\n`);

    // Check if owner can withdraw
    console.log("=".repeat(70));
    console.log("Withdrawal Options");
    console.log("=".repeat(70));

    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log("  ❌ You are not the owner of this vault.");
      console.log("     Only the owner can perform administrative actions.\n");
      return;
    }

    if (!initialized) {
      console.log("  ✅ GOOD NEWS: Vault is NOT initialized!");
      console.log("     Since the vault is not initialized, the tokens are not locked yet.");
      console.log("     However, the contract doesn't have a withdrawal function.");
      console.log("     \n");
      console.log("     Options:");
      console.log("     1. Deploy a new vault with the correct oracle type");
      console.log("     2. The tokens will remain in this vault (they're not locked, but can't be withdrawn)");
      console.log("     3. Contact a developer to add a withdrawal function (requires new deployment)\n");
      return;
    }

    console.log("  ⚠️  Vault is INITIALIZED - tokens are locked!");
    console.log("     The FAIRVault contract is designed to be trustless and does NOT have");
    console.log("     a withdrawal function. Once initialized, tokens can only be unlocked");
    console.log("     through the milestone system.\n");

    console.log("  💡 Solutions:\n");

    console.log("  Option 1: Fix the Oracle (Recommended)");
    console.log("    - Create a CL/Slipstream pool on Aerodrome (not V2)");
    console.log("    - Deploy a new vault with the CL pool address");
    console.log("    - Transfer tokens from old vault to new vault");
    console.log("    - Note: You'll need to wait for milestones to unlock in old vault\n");

    console.log("  Option 2: Wait for Milestones");
    console.log("    - Tokens will unlock automatically when milestones are met");
    console.log("    - However, the oracle won't work with V2 pool, so milestones won't unlock");
    console.log("    - This is not a viable solution\n");

    console.log("  Option 3: Deploy New Vault with Withdrawal Function");
    console.log("    - I can create a modified vault contract with an owner withdrawal function");
    console.log("    - Deploy the new vault");
    console.log("    - You can withdraw from old vault (if we add the function) or wait for unlocks");
    console.log("    - Transfer tokens to new vault\n");

    // Check if oracle is working
    if (oracleAddr !== ethers.ZeroAddress) {
      console.log("=".repeat(70));
      console.log("Oracle Status");
      console.log("=".repeat(70));
      
      try {
        const oracleAbi = ["function getPrice() external view returns (uint256)"];
        const oracle = new ethers.Contract(oracleAddr, oracleAbi, provider);
        const price = await oracle.getPrice();
        console.log(`  ✅ Oracle is working!`);
        console.log(`  Current Price: ${price} (1e9 units = $${(Number(price) / 1e9).toFixed(9)})\n`);
      } catch (error) {
        console.log(`  ❌ Oracle is NOT working: ${error.message}`);
        console.log(`     This confirms the oracle is incompatible with your V2 pool.\n`);
      }
    }

    console.log("=".repeat(70));
    console.log("Recommended Action");
    console.log("=".repeat(70));
    console.log("  1. Create a CL/Slipstream pool on Aerodrome");
    console.log("  2. Deploy a new vault with the CL pool");
    console.log("  3. Wait for milestones to unlock in old vault (or add withdrawal function)");
    console.log("  4. Transfer unlocked tokens to new vault\n");

  } catch (error) {
    console.log(`❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exitCode = 1;
});

