# Deployment Scripts

Scripts for deploying and configuring the FAIRVault system.

## Scripts

### `deploy-vault.js`
**Main deployment script** - Deploys the complete system.

Deploys:
- `FAIRVault` contract
- `AerodromeTWAPOracle` contract
- Wires oracle to vault and freezes it
- Automatically deposits tokens to vault

**Usage:**
```bash
# Production (90 days cooldown, 360 periods)
node scripts/mainnet/deployment/deploy-vault.js

# Test mode (4 hours cooldown, 2 periods)
VAULT_WAIT_RULE=14400 VAULT_GOOD_PERIODS=2 VAULT_PERIOD_INTERVAL=60 \
  node scripts/mainnet/deployment/deploy-vault.js
```

**Environment Variables:**
- `EXISTING_FAIR_TOKEN` - Your FAIR token address
- `AERODROME_POOL_MAINNET` - Aerodrome pool address
- `VAULT_DEPOSIT_AMOUNT` - Amount to deposit (optional, defaults to full balance)
- `VAULT_WAIT_RULE` - Cooldown period (optional, defaults to 90 days)
- `VAULT_GOOD_PERIODS` - Required good periods (optional, defaults to 360)
- `VAULT_PERIOD_INTERVAL` - Period interval in seconds (optional, defaults to 3600)

---

### `resume-deployment.js`
**Resume failed deployment** - Continues deployment if it failed partway.

Use this if:
- Deployment failed at Step 2 (oracle deployment)
- You have a vault but oracle isn't set
- You need to complete the setup

**Usage:**
```bash
# Auto-detect vault from .env
node scripts/mainnet/deployment/resume-deployment.js

# Specify vault address
node scripts/mainnet/deployment/resume-deployment.js <VAULT_ADDRESS>
```

**What it does:**
1. Verifies existing vault
2. Deploys `AerodromeTWAPOracle`
3. Wires oracle to vault and freezes it
4. Optionally funds vault (if `VAULT_DEPOSIT_AMOUNT` is set)

---

### `deposit-tokens.js`
**Deposit tokens to vault** - Standalone script to fund an existing vault.

Use this if:
- Vault is deployed but not funded
- You want to add more tokens later
- Initial deposit failed

**Usage:**
```bash
# Auto-detect vault from .env
node scripts/mainnet/deployment/deposit-tokens.js

# Specify vault address
node scripts/mainnet/deployment/deposit-tokens.js <VAULT_ADDRESS>
```

**Environment Variables:**
- `VAULT_DEPOSIT_AMOUNT` - Amount to deposit (optional, defaults to full balance)

---

### `deploy-aggregate-oracle.js`
**Deploy aggregate oracle** - Deploys `AggregateOracle` for multiple price sources.

Use this if:
- You want to aggregate prices from multiple DEX pools
- You have Aerodrome + Uniswap V3 pools

**Usage:**
```bash
# Set oracle sources in .env
ORACLE_SOURCES=0x123...,0x456...
AGGREGATION_METHOD=0  # 0=MEAN, 1=MEDIAN, 2=WEIGHTED
MIN_SOURCES=1
MAX_DEVIATION_BPS=500

node scripts/mainnet/deployment/deploy-aggregate-oracle.js
```

**Environment Variables:**
- `ORACLE_SOURCES` - Comma-separated oracle addresses
- `AGGREGATION_METHOD` - 0=MEAN, 1=MEDIAN, 2=WEIGHTED
- `MIN_SOURCES` - Minimum valid sources required
- `MAX_DEVIATION_BPS` - Max price deviation (basis points, 0=disabled)

---

## Deployment Flow

### First Time Deployment

1. **Setup environment** - Create `.env` file in project root
2. **Deploy system** - Run `deploy-vault.js`
3. **Verify** - Run `../diagnostics/verify-keeper-ready.js`
4. **Start keeper** - Run `../../keeper/keeper.js mainnet`

### Resume Failed Deployment

1. **Check vault** - Verify vault address on Basescan
2. **Resume** - Run `resume-deployment.js <VAULT_ADDRESS>`
3. **Verify** - Run `../diagnostics/verify-keeper-ready.js`

### Add More Tokens

1. **Deposit** - Run `deposit-tokens.js <VAULT_ADDRESS>`
2. **Verify** - Check vault balance

---

## Common Issues

### "replacement transaction underpriced"
- **Solution**: Use `resume-deployment.js` - it handles this automatically

### "nonce too low"
- **Solution**: Wait a few minutes, then use `resume-deployment.js`

### "insufficient funds"
- **Solution**: Ensure you have enough ETH for gas and tokens to deposit

---

## Next Steps

After deployment:
1. ✅ Verify: `../diagnostics/verify-keeper-ready.js`
2. ✅ Start keeper: `../../keeper/keeper.js mainnet`
3. ✅ Monitor: Check keeper logs regularly

