# FAIR Token - 10B Fairnomics System

FAIR token with milestone-based unlock system on Base blockchain.

## 📊 Tokenomics

| Parameter | Value |
|-----------|-------|
| **Total Supply** | 10,000,000,000 FAIR |
| **TGE Distribution** | 1,000,000,000 (10%) |
| **Locked Supply** | 9,000,000,000 (90%) |
| **Milestones** | 18 |
| **Per Milestone** | 500,000,000 (5%) |
| **Start Price** | $0.000010 |

## 🏗️ Project Structure

```
contracts/
├── FAIR.sol              # Production token (90-day cooldown, 360 hours)
├── FAIRTestnet.sol       # Testnet token (10-min cooldown, 10 periods)
├── AerodromeTWAPOracle.sol  # Production price oracle
└── MockOracle.sol        # Testing oracle

scripts/
├── local/                # Local Hardhat fork testing (FREE)
│   ├── deploy.js
│   ├── test.js
│   └── README.md
├── testnet/              # Base Sepolia testnet
│   ├── deploy.js
│   ├── test.js
│   └── README.md
├── mainnet/              # Base mainnet (PRODUCTION)
│   ├── deploy.js
│   ├── deploy-twap.js
│   └── README.md
├── keeper/               # Keeper bot
│   ├── keeper.js
│   └── README.md
└── shared/               # Shared utilities
    ├── config.js
    ├── provider.js
    └── artifacts.js
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Compile Contracts

```bash
npx hardhat compile
```

### 3. Local Testing (FREE)

```bash
# Terminal 1: Start Hardhat fork
npx hardhat node --fork https://mainnet.base.org

# Terminal 2: Deploy and test
node scripts/local/deploy.js
node scripts/local/test.js --fast-forward
```

### 4. Testnet Deployment (Base Sepolia)

```bash
# Set up .env
echo "PRIVATE_KEY=your_key" >> .env
echo "BASE_SEPOLIA_RPC_URL=https://sepolia.base.org" >> .env

# Deploy
node scripts/testnet/deploy.js
node scripts/testnet/test.js
```

### 5. Mainnet Deployment (Base)

```bash
# Set up .env with real addresses
# See scripts/mainnet/README.md for full checklist

node scripts/mainnet/deploy.js
```

## 📋 Environment Configuration

Create a `.env` file:

```bash
# Network RPC URLs
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_MAINNET_RPC_URL=https://mainnet.base.org

# Deployer private key
PRIVATE_KEY=your_private_key

# Pool wallet addresses (required for mainnet)
TREASURY_WALLET=0x...
GROWTH_WALLET=0x...
LIQUIDITY_WALLET=0x...
TEAM_WALLET=0x...

# TGE Timestamp (Jan 1, 2026 00:00 GMT)
TGE_TIMESTAMP=1735689600

# Keeper (optional)
KEEPER_PRIVATE_KEY=your_keeper_key
```

## 🔧 Testing Environments

| Environment | Cost | Cooldown | Good Periods | Use Case |
|-------------|------|----------|--------------|----------|
| **Local** | FREE | 10 min | 10 | Development |
| **Testnet** | Free ETH | 10 min | 10 | Pre-production |
| **Mainnet** | ~$50 | 90 days | 360 hours | Production |

## 📖 Documentation

- **Local Testing**: [`scripts/local/README.md`](scripts/local/README.md)
- **Testnet Guide**: [`scripts/testnet/README.md`](scripts/testnet/README.md)
- **Mainnet Guide**: [`scripts/mainnet/README.md`](scripts/mainnet/README.md)
- **Keeper Bot**: [`scripts/keeper/README.md`](scripts/keeper/README.md)
- **Full Guide**: [`FAIR_10B_COMPLETE_GUIDE.md`](FAIR_10B_COMPLETE_GUIDE.md)

## 🔐 Security

- **No upgradeability** - Contracts are immutable
- **Immutable pool addresses** - Set at deployment
- **No owner withdrawals** - Locked tokens cannot be retrieved
- **TWAP oracle** - Manipulation resistant pricing

## 📞 Support

For issues:
1. Check environment-specific README
2. Verify contract addresses
3. Check wallet balances
4. Contact Ben with transaction hashes
