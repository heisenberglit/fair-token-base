# FAIR Token Dashboard

A modern, sleek dashboard for visualizing FAIR Token Fairnomics milestone unlocks on Base blockchain.

## Features

- **Real-time Blockchain Data**: Reads directly from FAIRVault contract
- **Milestone Tracking**: View all 18 milestones and their unlock progress
- **Price Monitoring**: Current price vs. milestone targets
- **Modern UI**: Sleek black/grey design with glassmorphism effects
- **Auto-refresh**: Updates every 30 seconds

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Extract contract ABIs** (after compiling contracts):
   ```bash
   # From project root, compile contracts first:
   npx hardhat compile
   
   # Then extract ABIs for dashboard:
   cd fairnomics-dashboard
   npm run extract-abis
   ```

3. **Configure environment variables**:
   Create a `.env` file in the `fairnomics-dashboard` directory:
   ```env
   # Base Network RPC URL (required)
   VITE_BASE_RPC_URL=https://mainnet.base.org
   # Or use a custom RPC provider
   # VITE_RPC_URL=https://mainnet.base.org

   # Vault Contract Address (required)
   VITE_VAULT_ADDRESS=0x...

   # FAIR Token Contract Address (optional, will be read from vault if not set)
   VITE_FAIR_TOKEN_ADDRESS=0x...
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Build for production**:
   ```bash
   npm run build
   ```

## Environment Variables

- `VITE_VAULT_ADDRESS`: The FAIRVault contract address (required)
- `VITE_FAIR_TOKEN_ADDRESS`: The FAIR token contract address (optional, auto-detected from vault)
- `VITE_BASE_RPC_URL` or `VITE_RPC_URL`: Base mainnet RPC endpoint (required)

## Data Sources

The dashboard reads data from:
- **FAIRVault Contract**: Milestone status, good periods, price targets
- **Oracle Contract**: Current TWAP price from Aerodrome pool
- **FAIR Token Contract**: Total supply and locked amounts

## Notes

- The dashboard automatically refreshes every 30 seconds
- If the oracle is not configured or pool has insufficient history, price may show as $0.000000
- All prices are displayed in USD (converted from oracle format: `price * 1,000,000`)
