// scripts/local/test-standalone.js
// Runs on a local Hardhat node (NOT a fork - more stable)
//
// Start node: npx hardhat node
// Run test:   node scripts/local/test-standalone.js [count]
// Example:    node scripts/local/test-standalone.js 5

import { ethers } from "ethers";
import { loadArtifact, CONTRACTS } from "../shared/artifacts.js";

const RPC_URL = "http://localhost:8545";
// Hardhat default accounts
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TREASURY_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const LIQUIDITY_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const GROWTH_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
const TEAM_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";

// Helper to get fresh wallet with current nonce
async function getFreshSigner() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(OWNER_KEY, provider);
  return wallet;
}

// Helper to send transaction with fresh nonce and fixed gas
async function sendTx(contract, method, args = [], gasLimit = 500000) {
  const signer = await getFreshSigner();
  const nonce = await signer.getNonce();
  const contractWithSigner = contract.connect(signer);
  const tx = await contractWithSigner[method](...args, { nonce, gasLimit });
  await tx.wait();
  return tx;
}

async function main() {
  const count = parseInt(process.argv[2]) || 3;
  
  console.log("\n" + "=".repeat(60));
  console.log(`🧪 Testing ${count} Milestone Unlocks (Fresh Hardhat Network)`);
  console.log("=".repeat(60));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // Create wallets
  const owner = new ethers.Wallet(OWNER_KEY, provider);
  const treasury = new ethers.Wallet(TREASURY_KEY, provider);
  const liquidity = new ethers.Wallet(LIQUIDITY_KEY, provider);
  const growth = new ethers.Wallet(GROWTH_KEY, provider);
  const team = new ethers.Wallet(TEAM_KEY, provider);
  
  console.log(`\nOwner: ${owner.address}`);
  console.log(`Treasury: ${treasury.address}`);

  // Load artifacts
  const oracleArtifact = loadArtifact(CONTRACTS.MOCK_ORACLE);
  const fairArtifact = loadArtifact(CONTRACTS.FAIR_TESTNET);

  // Deploy MockOracle
  console.log("\nDeploying MockOracle...");
  const OracleFactory = new ethers.ContractFactory(
    oracleArtifact.abi,
    oracleArtifact.bytecode,
    owner
  );
  const oracle = await OracleFactory.deploy();
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log(`MockOracle: ${oracleAddress}`);

  // Set initial price
  await sendTx(oracle, "setPrice", [10]); // $0.000010

  // Get current timestamp
  const block = await provider.getBlock("latest");
  const tgeTimestamp = block.timestamp;

  // Deploy FAIRTestnet
  console.log("\nDeploying FAIRTestnet...");
  const freshOwner = await getFreshSigner();
  const FAIRFactory = new ethers.ContractFactory(
    fairArtifact.abi,
    fairArtifact.bytecode,
    freshOwner
  );
  const fair = await FAIRFactory.deploy(
    owner.address,
    treasury.address,
    liquidity.address,
    growth.address,
    team.address,
    tgeTimestamp
  );
  await fair.waitForDeployment();
  const fairAddress = await fair.getAddress();
  console.log(`FAIRTestnet: ${fairAddress}`);

  // Set oracle
  await sendTx(fair, "setOracle", [oracleAddress]);
  console.log("Oracle set on FAIR contract");

  // Get constants
  const WAIT_RULE = Number(await fair.WAIT_RULE());
  const PERIOD_INTERVAL = Number(await fair.PERIOD_INTERVAL());
  const REQUIRED_GOOD_PERIODS = Number(await fair.REQUIRED_GOOD_PERIODS());
  
  console.log(`\nContract Parameters:`);
  console.log(`  Wait Rule: ${WAIT_RULE} seconds`);
  console.log(`  Period Interval: ${PERIOD_INTERVAL} seconds`);
  console.log(`  Required Good Periods: ${REQUIRED_GOOD_PERIODS}`);

  // Unlock milestones
  let unlockedCount = 0;
  
  for (let m = 1; m <= Math.min(count, 18); m++) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`📍 Unlocking Milestone ${m}`);
    console.log(`${"─".repeat(50)}`);
    
    const status = await fair.getMilestoneStatus(m);
    const priceTarget = Number(status.priceTarget);
    console.log(`  Price Target: ${priceTarget} ($${(priceTarget / 1e9).toFixed(6)})`);
    
    // Set price above target
    const currentPrice = Number(await oracle.getPrice());
    if (currentPrice < priceTarget) {
      const newPrice = priceTarget * 2;
      await sendTx(oracle, "setPrice", [newPrice]);
      console.log(`  Set price: ${newPrice}`);
    }
    
    // Fast forward past cooldown
    await provider.send("evm_increaseTime", [WAIT_RULE + 60]);
    await provider.send("evm_mine", []);
    console.log(`  Fast-forwarded cooldown`);
    
    // Accumulate good periods
    console.log(`  Accumulating ${REQUIRED_GOOD_PERIODS} good periods...`);
    for (let i = 0; i < REQUIRED_GOOD_PERIODS + 2; i++) {  // +2 extra to ensure finalization
      // Check if already unlocked
      const isUnlocked = await fair.milestoneUnlocked(m);
      if (isUnlocked) {
        console.log("\n  (Already unlocked)");
        break;
      }
      
      await provider.send("evm_increaseTime", [PERIOD_INTERVAL + 1]);
      await provider.send("evm_mine", []);
      
      try {
        await sendTx(fair, "tryUnlock", [m]);
        process.stdout.write(".");
      } catch (e) {
        // May fail if already unlocked
        break;
      }
    }
    console.log("");
    
    // Check result
    const unlocked = await fair.milestoneUnlocked(m);
    if (unlocked) {
      console.log(`  ✅ Milestone ${m} UNLOCKED!`);
      unlockedCount++;
    } else {
      console.log(`  ⏳ Milestone ${m} not yet unlocked`);
      const newStatus = await fair.getMilestoneStatus(m);
      console.log(`  Good Periods: ${newStatus.goodPeriods}/${REQUIRED_GOOD_PERIODS}`);
    }
  }
  
  // Final summary
  console.log("\n" + "=".repeat(60));
  console.log(`✅ Summary: ${unlockedCount}/${count} milestones unlocked`);
  
  // Show pool balances
  const treasuryBal = await fair.balanceOf(treasury.address);
  const growthBal = await fair.balanceOf(growth.address);
  const liquidityBal = await fair.balanceOf(liquidity.address);
  const teamBal = await fair.balanceOf(team.address);
  const contractBal = await fair.balanceOf(fairAddress);
  
  console.log("\nBalances:");
  console.log(`  Contract (locked): ${ethers.formatEther(contractBal)} FAIR`);
  console.log(`  Treasury: ${ethers.formatEther(treasuryBal)} FAIR`);
  console.log(`  Growth: ${ethers.formatEther(growthBal)} FAIR`);
  console.log(`  Liquidity: ${ethers.formatEther(liquidityBal)} FAIR`);
  console.log(`  Team: ${ethers.formatEther(teamBal)} FAIR`);
  console.log("=".repeat(60) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
