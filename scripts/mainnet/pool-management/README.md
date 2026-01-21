# Pool Management Scripts

Scripts for managing Aerodrome pool liquidity, history, and price.

## Scripts

### `build-pool-history.js`
**Build observation history** - Performs small swaps to build TWAP observation history.

**Why:** New pools don't have enough observation history for accurate TWAP. This script creates observations by making small swaps.

**Usage:**
```bash
# Default: 50 swaps of 0.01 USDC each
node scripts/mainnet/pool-management/build-pool-history.js

# Custom parameters
SWAP_COUNT=100 SWAP_AMOUNT=0.05 DELAY_SECONDS=30 \
  node scripts/mainnet/pool-management/build-pool-history.js
```

**Environment Variables:**
- `SWAP_COUNT` - Number of swaps to perform (default: 50)
- `SWAP_AMOUNT` - Amount per swap in USDC (default: 0.01)
- `DELAY_SECONDS` - Delay between swaps in seconds (default: 10)

**Use this when:**
- Pool is new and has no history
- TWAP returns incorrect price
- `check-pool-observations.js` shows insufficient history

**Note:** Requires USDC balance in wallet for swaps.

---

### `increase-pool-cardinality.js`
**Increase observation cardinality** - Increases the number of observations a pool can store.

**Why:** Low cardinality means older observations get overwritten. Higher cardinality preserves more history.

**Usage:**
```bash
# Increase to 100 (recommended minimum)
node scripts/mainnet/pool-management/increase-pool-cardinality.js <POOL_ADDRESS> 100

# Increase to 200 (for high-volume pools)
node scripts/mainnet/pool-management/increase-pool-cardinality.js <POOL_ADDRESS> 200
```

**Parameters:**
- `POOL_ADDRESS` - Aerodrome pool address
- `TARGET_CARDINALITY` - Target observation cardinality

**Use this when:**
- Pool has low cardinality (< 50)
- Observations are being overwritten too quickly
- Need to preserve longer history

**Note:** Requires ETH for gas. Cardinality can only be increased, not decreased.

---

### `adjust-price-to-target.js`
**Adjust pool price** - Calculates and optionally executes swaps to reach target price.

**Why:** For testing milestones, you may need to move the pool price to a specific target.

**Usage:**
```bash
# Calculate swap needed (dry run)
node scripts/mainnet/pool-management/adjust-price-to-target.js 10

# Execute swap automatically
node scripts/mainnet/pool-management/adjust-price-to-target.js 10 --execute

# Specify exact swap amount
node scripts/mainnet/pool-management/adjust-price-to-target.js 10 --execute --amount 100

# Iterative mode (keep swapping until target)
node scripts/mainnet/pool-management/adjust-price-to-target.js 10 --execute --iterative
```

**Parameters:**
- `TARGET_PRICE` - Target price in oracle units (e.g., 10 = $0.000010)
- `--execute` - Actually perform the swap
- `--amount AMOUNT` - Specify exact USDC amount to swap
- `--iterative` - Keep swapping until target reached

**Use this when:**
- Testing milestone unlocks
- Need to move price to specific target
- Price is below milestone target

**Important Notes:**
- **TWAP updates slowly** (10-30 minutes for 1-hour window)
- **Spot price updates immediately** but keeper uses TWAP
- **Large swaps needed** for pools with high liquidity ($50-100+ USDC)
- **Price impact** - Check Aerodrome UI for price impact before large swaps

**Example Workflow:**
```bash
# 1. Check current price
node ../diagnostics/check-spot-price.js

# 2. Calculate swap needed for target
node scripts/mainnet/pool-management/adjust-price-to-target.js 10

# 3. Execute swap
node scripts/mainnet/pool-management/adjust-price-to-target.js 10 --execute --amount 100

# 4. Wait 10-15 minutes for TWAP to update

# 5. Check price again
node ../diagnostics/check-spot-price.js

# 6. If still below target, swap more
node scripts/mainnet/pool-management/adjust-price-to-target.js 10 --execute --amount 50
```

---

## Common Workflows

### Setting Up a New Pool

1. **Create pool** on Aerodrome (CL/Slipstream type)
2. **Add liquidity** with full range or wide range
3. **Increase cardinality** - Run `increase-pool-cardinality.js` to 100
4. **Build history** - Run `build-pool-history.js` (50 swaps)
5. **Test oracle** - Run `../diagnostics/test-oracle.js`
6. **Deploy vault** - Use pool in `deploy-vault.js`

### Testing Milestone Unlocks

1. **Check current price** - `../diagnostics/check-spot-price.js`
2. **Calculate target** - Check milestone target (e.g., 10 for milestone 1)
3. **Adjust price** - `adjust-price-to-target.js 10 --execute --amount 100`
4. **Wait for TWAP** - 10-30 minutes
5. **Verify price** - `../diagnostics/check-spot-price.js`
6. **Start keeper** - `../../keeper/keeper.js mainnet`

### Fixing Insufficient History

1. **Check history** - `../diagnostics/check-pool-observations.js`
2. **Increase cardinality** - `increase-pool-cardinality.js <POOL> 100`
3. **Build history** - `build-pool-history.js` (50-100 swaps)
4. **Verify** - `../diagnostics/check-pool-observations.js` again

---

## Price Manipulation Tips

### Understanding Price Movement

- **To increase price**: Swap USDC → FAIR (buy FAIR)
- **To decrease price**: Swap FAIR → USDC (sell FAIR)
- **Price impact**: Larger swaps = more price movement
- **TWAP delay**: TWAP averages over 1 hour, updates slowly

### Swap Size Guidelines

For a **11% price increase** (9 → 10 oracle units):
- **Small pool** (< $10k liquidity): $50-100 USDC
- **Medium pool** ($10k-$100k): $100-500 USDC
- **Large pool** (> $100k): $500-2000+ USDC

### Best Practices

1. **Start small** - Try $50-100 USDC first
2. **Check price impact** - Use Aerodrome UI to see impact
3. **Wait for TWAP** - Don't expect immediate TWAP update
4. **Multiple swaps** - Better than one large swap (helps TWAP update faster)
5. **Monitor** - Use `check-spot-price.js` to track progress

---

## Troubleshooting

### "Price not moving"
- **Cause**: Swap too small for pool liquidity
- **Solution**: Increase swap amount ($100-200 USDC)

### "TWAP still wrong after swap"
- **Cause**: TWAP needs time to update (10-30 min)
- **Solution**: Wait, or make more swaps to accelerate

### "Insufficient history"
- **Cause**: Pool is new or cardinality too low
- **Solution**: Run `build-pool-history.js` and `increase-pool-cardinality.js`

### "High price impact warning"
- **Cause**: Swap is large relative to liquidity
- **Solution**: This is normal for price manipulation, proceed if intentional

---

## Safety Notes

⚠️ **Price manipulation is for testing only!**

- Don't manipulate price in production
- Large swaps can cause significant slippage
- Always check price impact before executing
- TWAP will eventually reflect true market price

