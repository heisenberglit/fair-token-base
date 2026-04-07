# FAIR Token — Fairnomics System

FAIR is the utility token of the [Fairmark Network](https://fairmark.net), a trust system for the AI age. FAIR is governed by *Fairnomics*, an open, transparent, rules-based tokenomics model for long-term builders. Built on Coinbase Base.

Contract: [0xbC780134E48b2DFa8eDAC84E7bbe38e5af9DBc9C](https://basescan.org/token/0xbC780134E48b2DFa8eDAC84E7bbe38e5af9DBc9C)

## 📊 Tokenomics

| Parameter | Value |
|-----------|-------|
| **Total Supply** | 1,000,000,000 FAIR (1B) |
| **Milestones** | 18 |
| **Per Milestone** | ~47.2M FAIR (1/18 of locked supply) |
| **Start Price** | 0.0002 USDC |
| **Price Multiplier** | 1.5× per milestone |
| **Good Hours Required** | 360 (TWAP must hold above target) |
| **Cooldown Between Unlocks** | 90 days |

## 🏦 Token Allocation

| Pool | Amount | % |
|------|--------|---|
| **CONTRACT VAULT** | 850,000,000 FAIR | 85% |
| **Seed Liquidity** | 150,000,000 FAIR | 15% |
| **Treasury** | 500,000,000 FAIR | 50% |
| **Reserve** | 50,000,000 FAIR | 5% |
| **Team** | 100,000,000 FAIR | 10% |

The Fairnomics Contract Vault holds the full locked supply. 

## 🔒 Unlock Rules

1. **360 Good Hours** — 1-hour TWAP must stay at or above the milestone price target for 360 cumulative hours
2. **90-Day Cooldown** — Minimum 90 days between any two unlock events
3. **1.5× Price Multiplier** — Each milestone target is 1.5× the previous one
4. **Sequential** — Milestones must unlock in order; no skipping
5. **No partial payments** — If vault is underfunded at unlock time, milestone is marked pending and paid in full once the Safe refills the vault

## 🏗️ Project Structure

```
contracts/
├── FAIRVault.sol              # Immutable milestone-based escrow vault
├── AerodromeTWAPOracle.sol    # 1-hour TWAP oracle (Aerodrome Slipstream)
└── MockOracle.sol             # Testing oracle

scripts/
├── mainnet/                   # Base mainnet deployment & management
│   ├── deployment/
│   │   └── deploy-vault.js
│   └── pool-management/
│       ├── increase-pool-cardinality.js
│       └── build-pool-history.js
├── keeper/                    # Keeper bot (calls tryUnlock every hour)
│   └── keeper.js
└── shared/                    # Shared utilities
    ├── config.js
    ├── artifacts.js
    └── provider.js

fairnomics-dashboard/          # React Vite dashboard (read-only blockchain UI)
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

### 3. Configure Environment

Create a `.env` file:

```bash
# Deployer / keeper wallet
PRIVATE_KEY=your_private_key
KEEPER_PRIVATE_KEY=your_keeper_key   # can be same as PRIVATE_KEY

# Base mainnet RPC (Alchemy recommended)
RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY

# Deployed addresses
VAULT_ADDRESS=0x354753c5f8225F6688c94f00336fDa687643f183
TWAP_ORACLE_ADDRESS=0x...

# Total FAIR to be distributed across all 18 milestones
VAULT_DEPOSIT_AMOUNT=850000000
```

### 4. Deploy Vault

```bash
node scripts/mainnet/deployment/deploy-vault.js
```

### 5. Run Keeper Bot (local)

```bash
node scripts/keeper/keeper.js mainnet
```

## 🤖 Keeper Bot

The keeper is a permissionless bot that calls `tryUnlock()` every hour. It:
- Records good periods when TWAP is above target
- Triggers milestone unlock when all conditions are met
- Calls `releasePending()` if a milestone was earned while vault was underfunded

### Deploy on Railway

1. Push repo to GitHub
2. New Railway project → Deploy from GitHub
3. Set environment variables in Railway dashboard:
   - `PRIVATE_KEY`
   - `VAULT_ADDRESS`
   - `RPC_URL`
4. Railway runs `node scripts/keeper/keeper.js mainnet` continuously via `Procfile`

## 📈 Staged Funding Model

The Treasury Safe holds the full FAIR supply. Tokens are pre-loaded to the vault in tranches before each milestone:

1. Safe sends FAIR to vault (e.g. 3 milestones ahead)
2. Vault `initialize(totalAmount)` is called once to set `milestoneUnlockAmount`
3. When a milestone unlocks, vault distributes `milestoneUnlockAmount` to recipient pools
4. If vault balance is insufficient at unlock time → milestone marked **pending**, no partial payment, full amount paid once Safe refills vault

The Safe never sends tokens directly to recipients — the vault enforces all unlock rules.

## 🔐 Security

- **Immutable** — No upgradeability, no admin override, no emergency withdrawal
- **Trustless** — All unlock conditions enforced on-chain
- **TWAP oracle** — 1-hour Aerodrome Slipstream TWAP, manipulation resistant
- **Sequential** — Strict milestone ordering enforced in contract
- **No partial payments** — Either full amount releases or nothing (pending mechanism)

## 🌐 Links

- Dashboard: fairnomics-dashboard (React Vite, reads live chain state)
- Fairmark Network: [fairmark.net](https://fairmark.net)
- FairCam: [faircam.io](https://faircam.io)
- BaseScan: [0xbC780134...](https://basescan.org/token/0xbC780134E48b2DFa8eDAC84E7bbe38e5af9DBc9C)
