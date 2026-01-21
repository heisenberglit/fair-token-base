# FAIRVault Mainnet Scripts

Scripts organized by purpose for deploying, managing, and monitoring the FAIRVault system.

## 📁 Folder Structure

```
scripts/mainnet/
├── deployment/          # Deploy contracts and configure system
├── diagnostics/         # Check, test, and verify system
├── pool-management/    # Manage pool liquidity, history, and price
└── utils/              # Utility scripts and calculations
```

## 🚀 Quick Start

### 1. Setup Environment

**IMPORTANT**: The `.env` file must be in the **project root folder** (same level as `package.json`), not in `scripts/mainnet/`.

You can use `scripts/mainnet/env.test` as a template - copy it to `.env` in the root folder.

```bash
# Your existing token and pool
EXISTING_FAIR_TOKEN=0xYourFAIRTokenAddress
AERODROME_POOL_MAINNET=0xYourAerodromePoolAddress

# Deployer wallet
MAINNET_RPC_URL=https://mainnet.base.org
MAINNET_PRIVATE_KEY=0xYourPrivateKey

# Pool wallets (receive tokens on unlock)
TREASURY_WALLET=0x...
GROWTH_WALLET=0x...
LIQUIDITY_WALLET=0x...
TEAM_WALLET=0x...
```

### 2. Deploy System

```bash
# Production (90 days cooldown, 360 periods)
node scripts/mainnet/deployment/deploy-vault.js

# Test mode (4 hours cooldown, 2 periods)
VAULT_WAIT_RULE=14400 VAULT_GOOD_PERIODS=2 VAULT_PERIOD_INTERVAL=60 \
  node scripts/mainnet/deployment/deploy-vault.js
```

### 3. Verify Deployment

```bash
# Complete system check
node scripts/mainnet/diagnostics/verify-keeper-ready.js
```

### 4. Start Keeper Bot

```bash
node scripts/keeper/keeper.js mainnet
```

## 📚 Script Categories

### 🔧 Deployment (`deployment/`)
Scripts for deploying and configuring the system.

- **`deploy-vault.js`** - Main deployment (vault + oracle)
- **`resume-deployment.js`** - Resume failed deployment
- **`deposit-tokens.js`** - Fund existing vault
- **`deploy-aggregate-oracle.js`** - Deploy multi-source oracle

📖 [See deployment README](./deployment/README.md)

### 🔍 Diagnostics (`diagnostics/`)
Scripts for checking, testing, and verifying.

- **`verify-keeper-ready.js`** ⭐ - Complete system check
- **`check-oracle.js`** - Oracle and pool diagnostics
- **`test-oracle.js`** - Pre-deployment oracle test
- **`check-pool-type.js`** - Verify pool compatibility
- **`check-spot-price.js`** - Compare spot vs TWAP

📖 [See diagnostics README](./diagnostics/README.md)

### 💧 Pool Management (`pool-management/`)
Scripts for managing pool liquidity and price.

- **`build-pool-history.js`** - Build TWAP observation history
- **`increase-pool-cardinality.js`** - Increase observation capacity
- **`adjust-price-to-target.js`** - Adjust pool price for testing

📖 [See pool management README](./pool-management/README.md)

### 🛠️ Utils (`utils/`)
Utility scripts and calculations.

- **`calculate-milestone-prices.js`** - Show all milestone price targets

📖 [See utils README](./utils/README.md)

## 📋 Common Workflows

### First Time Deployment

1. **Setup** - Create `.env` file in project root
2. **Deploy** - `deployment/deploy-vault.js`
3. **Verify** - `diagnostics/verify-keeper-ready.js`
4. **Start keeper** - `../../keeper/keeper.js mainnet`

### Resume Failed Deployment

1. **Resume** - `deployment/resume-deployment.js <VAULT_ADDRESS>`
2. **Verify** - `diagnostics/verify-keeper-ready.js`

### Testing Milestone Unlocks

1. **Check price** - `diagnostics/check-spot-price.js`
2. **Adjust price** - `pool-management/adjust-price-to-target.js 10 --execute`
3. **Wait 10-30 min** - TWAP needs time to update
4. **Verify** - `diagnostics/check-spot-price.js` again
5. **Start keeper** - `../../keeper/keeper.js mainnet`

### Fixing Pool Issues

1. **Check pool** - `diagnostics/check-pool-type.js`
2. **Build history** - `pool-management/build-pool-history.js`
3. **Increase cardinality** - `pool-management/increase-pool-cardinality.js`
4. **Test oracle** - `diagnostics/test-oracle.js`

## ⚙️ Timing Parameters

| Parameter | Production | Test Mode |
|-----------|------------|-----------|
| Cooldown | 90 days | 4 hours |
| Good Periods | 360 | 2 |
| Period Interval | 1 hour | 1 minute |

## 🔒 Security

After deployment:
- ✅ Oracle is **permanently frozen**
- ✅ Pool wallets are **immutable**
- ✅ Unlocks are **fully automatic**
- ✅ No human can override unlock rules

## 📖 Documentation

Each folder has its own README with detailed documentation:
- [Deployment Scripts](./deployment/README.md)
- [Diagnostic Scripts](./diagnostics/README.md)
- [Pool Management Scripts](./pool-management/README.md)
- [Utility Scripts](./utils/README.md)
