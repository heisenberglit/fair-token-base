# Testnet Deployment (Base Sepolia)

## Overview

Deploy and test FAIR 10B on Base Sepolia testnet. Uses free testnet ETH.

## Prerequisites

1. **Get Testnet ETH**:
   - https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
   - Need ~0.01-0.02 ETH

2. **Set Environment Variables** in `.env`:
   ```bash
   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   PRIVATE_KEY=your_private_key
   
   # Optional: Set pool addresses (uses test addresses if not set)
   TREASURY_WALLET=0x...
   GROWTH_WALLET=0x...
   LIQUIDITY_WALLET=0x...
   TEAM_WALLET=0x...
   ```

## Quick Start

```bash
# 1. Deploy contracts
node scripts/testnet/deploy.js

# 2. Test deployment
node scripts/testnet/test.js
```

## Available Scripts

| Script | Purpose |
|--------|---------|
| `deploy.js` | Deploy FAIRTestnet + MockOracle |
| `test.js` | Test contracts and milestone status |

## Deployment Output

Addresses saved to `scripts/testnet/.env.testnet`:

```
FAIR_ADDRESS=0x...
ORACLE_ADDRESS=0x...
```

## Testing Workflow

1. **Deploy**:
   ```bash
   node scripts/testnet/deploy.js
   ```

2. **Verify on Explorer**:
   - https://sepolia.basescan.org/address/YOUR_ADDRESS

3. **Test Milestone Flow**:
   ```bash
   node scripts/testnet/test.js
   ```

4. **Manual Testing** (optional):
   - Update oracle price
   - Call `processMilestonePeriod(1)` hourly
   - Check milestone status

## Testnet vs Production

| Parameter | Testnet | Production |
|-----------|---------|------------|
| Cooldown | 10 minutes | 90 days |
| Good Periods | 10 | 360 hours |
| Period Interval | 1 minute | 1 hour |
| Token | FAIRTestnet (tFAIR) | FAIR |

## Cost Estimate

- Deploy FAIRTestnet: ~$0.20
- Deploy MockOracle: ~$0.10
- Transactions: ~$0.01 each
- **Total: ~$0.50-1.00**

## Next Steps

After testnet testing:
1. Test milestone unlock flow
2. Create Aerodrome pool (optional)
3. Deploy to mainnet




