# Local Testing (Hardhat Fork)

## Overview

Test FAIR 10B contracts locally using a Hardhat fork of Base mainnet. **Completely FREE** - no real ETH required.

## Quick Start

```bash
# Terminal 1: Start Hardhat fork
npx hardhat node --fork https://mainnet.base.org

# Terminal 2: Deploy and test
node scripts/local/deploy.js
node scripts/local/test.js --fast-forward
```

## Available Scripts

| Script | Purpose |
|--------|---------|
| `deploy.js` | Deploy FAIRTestnet + MockOracle |
| `test.js` | Test milestone unlock flow |

## Test Parameters

The `FAIRTestnet` contract uses shortened timings for faster testing:

| Parameter | Testnet | Production |
|-----------|---------|------------|
| Cooldown | 10 minutes | 90 days |
| Good Periods | 10 | 360 hours |
| Period Interval | 1 minute | 1 hour |

## Testing Workflow

1. **Deploy Contracts**:
   ```bash
   node scripts/local/deploy.js
   ```

2. **Test Milestone Unlock**:
   ```bash
   # Manual testing (step by step)
   node scripts/local/test.js
   
   # Auto fast-forward (completes unlock instantly)
   node scripts/local/test.js --fast-forward
   ```

## Addresses

After deployment, addresses are saved to `scripts/local/.env.local`:

```
FAIR_ADDRESS=0x...
ORACLE_ADDRESS=0x...
```

## Advantages

- ✅ **FREE** - No real ETH required
- ✅ **Fast** - Instant transactions
- ✅ **Safe** - Can't lose real money
- ✅ **Time Control** - Can fast-forward time

## Limitations

- ❌ Only works locally
- ❌ State resets when fork restarts
- ❌ Can't interact with real Aerodrome pools

## Troubleshooting

**"Connection refused"**
- Make sure Hardhat fork is running on port 8545

**"Artifact not found"**
- Run `npx hardhat compile` first

**"Already unlocked"**
- Restart the Hardhat fork to reset state




