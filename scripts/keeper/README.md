# FAIR Keeper Bot

## Overview

The keeper bot runs hourly to:
1. Record good hours when price is above target
2. Unlock milestones when all conditions are met

**Works with both:**
- `FAIR.sol` - Contract that creates new token
- `FAIRVault.sol` - Vault for existing token (auto-detected)

## Setup

### 1. Create Keeper Wallet

Create a dedicated EOA wallet for the keeper:
- Generate new wallet (don't use founder wallet)
- Fund with ~0.01 ETH (enough for months of operation)
- Add to `.env` in project root:

```bash
KEEPER_PRIVATE_KEY=your_keeper_private_key
```

**Note**: You can use the same `PRIVATE_KEY` as deployment if you prefer, but a dedicated wallet is recommended for security.

### 2. Set Vault Address

The keeper will automatically find your vault address from:
1. `VAULT_ADDRESS` in `.env` (highest priority)
2. `scripts/mainnet/.env.test` (if test mode deployment)
3. `scripts/mainnet/.env.mainnet` (if production deployment)

**Option A**: Add to `.env` (recommended):
```bash
VAULT_ADDRESS=0xYourVaultAddress
```

**Option B**: The keeper will auto-detect from deployment files if `VAULT_ADDRESS` is not in `.env`

### 3. Test Run (Recommended First)

Before running continuously, test once to verify everything works:

```bash
# Test once on mainnet
node scripts/keeper/keeper.js mainnet --once
```

This will:
- Connect to your vault
- Check current milestone status
- Try to record a good period or unlock if ready
- Show detailed status information

**Expected output:**
- ✅ Shows current milestone number
- ✅ Shows good periods accumulated
- ✅ Shows price target vs current price
- ✅ Either records a good period OR unlocks milestone

### 4. Production Deployment

#### Option A: DigitalOcean Droplet

```bash
# 1. Create $5/month droplet (Basic, 1GB RAM)
# 2. SSH into server
ssh root@your_droplet_ip

# 3. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Clone repo
git clone <your_repo>
cd fair-token

# 5. Install dependencies
npm install

# 6. Create .env
cat > .env << EOF
BASE_MAINNET_RPC_URL=https://mainnet.base.org
KEEPER_PRIVATE_KEY=your_keeper_private_key
FAIR_ADDRESS=0x...
EOF

# 7. Run with pm2
npm install -g pm2
pm2 start scripts/keeper/keeper.js --name fair-keeper -- mainnet
pm2 save
pm2 startup

# 8. Check logs
pm2 logs fair-keeper
```

#### Option B: Run on Your Server

```bash
# Using systemd
sudo cat > /etc/systemd/system/fair-keeper.service << EOF
[Unit]
Description=FAIR Keeper Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/fair-token
ExecStart=/usr/bin/node scripts/keeper/keeper.js mainnet
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable fair-keeper
sudo systemctl start fair-keeper
sudo systemctl status fair-keeper
```

## Commands

```bash
# Test once (verify setup)
node scripts/keeper/keeper.js mainnet --once

# Run continuously (production)
node scripts/keeper/keeper.js mainnet

# Test mode (1 minute intervals - for testing only)
node scripts/keeper/keeper.js mainnet --test

# Check testnet
node scripts/keeper/keeper.js testnet --once
```

## How It Works

1. **Reads PERIOD_INTERVAL from contract**: Automatically uses the interval configured in your vault (1 hour for production, 1 minute for test mode)

2. **Finds current milestone**: Checks which milestone (1-18) is next to unlock

3. **Calls `tryUnlock()`**: This function:
   - Records a good period if price is above target and enough time has passed
   - Unlocks the milestone if all conditions are met (cooldown elapsed, good periods reached, price above target)

4. **Runs on schedule**: Repeats every `PERIOD_INTERVAL` seconds (from contract)

## Logs

Logs are written to `scripts/keeper/logs/`:
- `keeper-YYYY-MM-DD.log`

## Gas Costs

| Operation | Gas | Cost (Base) |
|-----------|-----|-------------|
| tryUnlock | ~50-100k | ~$0.01-0.02 |
| Per hour | ~50k | ~$0.01 |
| Per day | ~1.2M | ~$0.24 |
| Per month | ~36M | ~$7-8 |

## Monitoring

### Check Status

```bash
# pm2
pm2 status fair-keeper
pm2 logs fair-keeper --lines 50

# systemd
sudo journalctl -u fair-keeper -f
```

### Alert Setup (Optional)

Add webhook notifications for:
- Milestone unlocked
- Low balance warning
- Transaction failures

## Security

- ✅ Use dedicated keeper wallet
- ✅ Keep minimal balance (0.01-0.05 ETH)
- ✅ Never share keeper private key
- ✅ Use .env file (not hardcoded)
- ✅ Restrict server access

## Troubleshooting

**"Insufficient funds"**
- Fund keeper wallet with more ETH

**"Transaction failed"**
- Check gas price
- Check contract conditions
- Review logs for error details

**"Cannot connect"**
- Check RPC URL is correct
- Check network connectivity
- Try alternative RPC endpoint


