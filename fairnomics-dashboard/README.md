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

## Deployment to Vercel

### Prerequisites

- A [Vercel account](https://vercel.com/signup) (free tier works)
- Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)
- Contract ABIs extracted (run `npm run extract-abis` before deploying)

### Deployment Steps

#### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import project to Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New..." → "Project"
   - Import your Git repository
   - Select the repository containing your dashboard

3. **Configure project settings**:
   - **Framework Preset**: Vite
   - **Root Directory**: `fairnomics-dashboard` (if dashboard is in a subdirectory)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Add environment variables**:
   Click "Environment Variables" and add:
   ```
   VITE_VAULT_ADDRESS=0x...
   VITE_BASE_RPC_URL=https://mainnet.base.org
   VITE_FAIR_TOKEN_ADDRESS=0x... (optional)
   ```
   
   **Important**: Make sure to add these for all environments (Production, Preview, Development)

5. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete
   - Your dashboard will be live at `https://your-project.vercel.app`

#### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Navigate to dashboard directory**:
   ```bash
   cd fairnomics-dashboard
   ```

4. **Deploy**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project or create new
   - Confirm settings (Vite preset should be auto-detected)
   - Add environment variables when prompted

5. **Set environment variables** (if not set during deploy):
   ```bash
   vercel env add VITE_VAULT_ADDRESS
   vercel env add VITE_BASE_RPC_URL
   vercel env add VITE_FAIR_TOKEN_ADDRESS  # optional
   ```

6. **Deploy to production**:
   ```bash
   vercel --prod
   ```

### Environment Variables in Vercel

After deployment, you can manage environment variables:

1. **Via Dashboard**:
   - Go to Project Settings → Environment Variables
   - Add/edit variables for Production, Preview, and Development

2. **Via CLI**:
   ```bash
   vercel env ls                    # List all variables
   vercel env add VITE_VAULT_ADDRESS # Add new variable
   vercel env rm VITE_VAULT_ADDRESS  # Remove variable
   ```

### Build Configuration

Vercel should auto-detect Vite, but if needed, create `vercel.json` in the `fairnomics-dashboard` directory:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "installCommand": "npm install"
}
```

### Post-Deployment

1. **Verify deployment**:
   - Visit your Vercel URL
   - Check browser console for errors
   - Verify data is loading from blockchain

2. **Custom domain** (optional):
   - Go to Project Settings → Domains
   - Add your custom domain
   - Follow DNS configuration instructions

3. **Monitor deployments**:
   - All deployments are tracked in Vercel Dashboard
   - Preview deployments are created for each PR
   - Production deployments require manual approval (configurable)

### Troubleshooting

**Build fails with "ABI not found"**:
- Make sure you've run `npm run extract-abis` before deploying
- Check that `src/services/contracts.js` exists and has content

**Environment variables not working**:
- Ensure variables start with `VITE_` prefix
- Redeploy after adding/changing environment variables
- Check variable names match exactly (case-sensitive)

**RPC connection errors**:
- Verify `VITE_BASE_RPC_URL` is correct
- Consider using a more reliable RPC provider (Alchemy, Infura)
- Check CORS settings if using a custom RPC endpoint

**Blank page after deployment**:
- Check browser console for errors
- Verify all environment variables are set
- Ensure contract addresses are valid Base mainnet addresses

### Continuous Deployment

Vercel automatically deploys:
- **Production**: On push to main/master branch
- **Preview**: On every push to other branches or PR

To disable auto-deployment:
- Go to Project Settings → Git
- Configure deployment settings as needed

## Notes

- The dashboard automatically refreshes every 30 seconds
- If the oracle is not configured or pool has insufficient history, price may show as $0.000000
- All prices are displayed in USD (converted from oracle format: `price * 1,000,000`)
- Vercel provides free SSL certificates and global CDN
- Preview deployments are perfect for testing before production
