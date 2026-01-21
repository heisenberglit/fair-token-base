# Diagnostic Scripts

Scripts for checking, testing, and verifying the FAIRVault system.

## Quick Reference

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `verify-keeper-ready.js` | **Complete system check** | Before starting keeper |
| `check-oracle.js` | Oracle and pool status | Troubleshooting price issues |
| `test-oracle.js` | Test oracle before deployment | Pre-deployment verification |
| `check-pool-type.js` | Check if pool is CL or V2 | Pool compatibility check |
| `check-pool-observations.js` | Check pool observation history | TWAP history issues |
| `check-spot-price.js` | Compare spot vs TWAP price | Price discrepancy issues |
| `check-vault-balance.js` | Check vault token balance | Verify funding |

## Main Diagnostic Scripts

### `verify-keeper-ready.js` ⭐
**Complete system verification** - Checks everything before running keeper.

**Usage:**
```bash
# Auto-detect vault from .env
node scripts/mainnet/diagnostics/verify-keeper-ready.js

# Specify vault address
node scripts/mainnet/diagnostics/verify-keeper-ready.js <VAULT_ADDRESS>
```

**Checks:**
- ✅ Vault initialization
- ✅ Oracle configuration and freezing
- ✅ Oracle `getPrice()` functionality
- ✅ Milestone status
- ✅ Keeper bot configuration

**Use this before starting the keeper bot!**

---

### `check-oracle.js`
**Comprehensive oracle check** - Detailed diagnostics for oracle and pool.

**Usage:**
```bash
node scripts/mainnet/diagnostics/check-oracle.js [VAULT_ADDRESS]
```

**Checks:**
- Vault initialization and oracle address
- Oracle contract details (pool, tokens, TWAP window)
- Aerodrome pool details (tick, cardinality, history)
- Oracle `getPrice()` test
- Vault `getMilestoneStatus()` test

**Use this when:**
- Oracle price seems wrong
- Getting "missing revert data" errors
- Pool history issues

---

### `test-oracle.js`
**Pre-deployment oracle test** - Test oracle before using in vault.

**Usage:**
```bash
# Test existing oracle
node scripts/mainnet/diagnostics/test-oracle.js <ORACLE_ADDRESS>

# Deploy and test new oracle
node scripts/mainnet/diagnostics/test-oracle.js
```

**Tests:**
- Oracle configuration
- Pool status
- `getSpotPrice()` functionality
- `getPrice()` (TWAP) functionality
- Price consistency

**Use this before:**
- Deploying a new oracle
- Adding oracle to AggregateOracle

---

## Pool Diagnostics

### `check-pool-type.js`
**Check pool type** - Determines if pool is CL (Concentrated) or V2 (Basic).

**Usage:**
```bash
node scripts/mainnet/diagnostics/check-pool-type.js <POOL_ADDRESS>
```

**Output:**
- Pool type (CL or V2)
- Compatibility with `AerodromeTWAPOracle`
- Interface test results

**Use this when:**
- Creating a new pool
- Verifying pool compatibility
- Getting "incompatible pool" errors

---

### `check-pool-observations.js`
**Check observation history** - Analyzes pool's TWAP observation history.

**Usage:**
```bash
node scripts/mainnet/diagnostics/check-pool-observations.js <POOL_ADDRESS>
```

**Checks:**
- Current tick and cardinality
- Observation history for various time windows
- Pool age estimation
- Recommendations for building history

**Use this when:**
- TWAP returns incorrect price
- "Insufficient history" errors
- Need to build pool history

---

## Price Diagnostics

### `check-spot-price.js`
**Compare spot vs TWAP** - Shows both spot and TWAP prices.

**Usage:**
```bash
node scripts/mainnet/diagnostics/check-spot-price.js [VAULT_ADDRESS]
```

**Output:**
- Spot price (immediate)
- TWAP price (time-weighted average)
- Difference analysis
- Milestone target comparison

**Use this when:**
- Price seems stuck
- After making swaps
- Understanding TWAP delay

---

### `check-price-after-swap.js`
**Check price after swap** - Verifies if swap moved the price.

**Usage:**
```bash
node scripts/mainnet/diagnostics/check-price-after-swap.js [VAULT_ADDRESS]
```

**Output:**
- Spot price vs TWAP price
- Analysis of price movement
- Milestone target status

**Use this:**
- Immediately after swapping
- To see if TWAP will catch up

---

### `compare-oracle-ui-price.js`
**Compare oracle vs UI** - Compares on-chain oracle price with UI price.

**Usage:**
```bash
node scripts/mainnet/diagnostics/compare-oracle-ui-price.js [VAULT_ADDRESS]
```

**Use this when:**
- Oracle price differs from UI
- Suspecting oracle calculation issues

---

### `debug-oracle-calculation.js`
**Debug oracle calculation** - Deep dive into oracle price calculation.

**Usage:**
```bash
node scripts/mainnet/diagnostics/debug-oracle-calculation.js [VAULT_ADDRESS]
```

**Output:**
- Manual price calculations
- Token ordering analysis
- Comparison with oracle output

**Use this when:**
- Oracle price is completely wrong
- Need to understand calculation logic

---

## Compatibility Checks

### `check-oracle-compatibility.js`
**Verify oracle compatibility** - Checks if pool is compatible with oracle.

**Usage:**
```bash
node scripts/mainnet/diagnostics/check-oracle-compatibility.js <POOL_ADDRESS>
```

**Checks:**
- Pool interface compatibility
- Oracle contract requirements
- Price format compatibility

---

### `check-oracle-pool-match.js`
**Check oracle-pool match** - Verifies oracle is configured for correct pool.

**Usage:**
```bash
node scripts/mainnet/diagnostics/check-oracle-pool-match.js <ORACLE_ADDRESS> <POOL_ADDRESS>
```

---

## Vault Diagnostics

### `check-vault-balance.js`
**Check vault balance** - Shows vault's token balance.

**Usage:**
```bash
node scripts/mainnet/diagnostics/check-vault-balance.js [VAULT_ADDRESS]
```

**Use this to:**
- Verify vault was funded
- Check remaining balance
- Before/after milestone unlocks

---

## Troubleshooting Guide

### Oracle returns 0 or reverts
1. Run `check-oracle.js` - Check pool history
2. Run `check-pool-observations.js` - Check if history is sufficient
3. Run `check-pool-type.js` - Verify pool is CL type

### Price seems wrong
1. Run `check-spot-price.js` - Compare spot vs TWAP
2. Run `debug-oracle-calculation.js` - Deep dive into calculation
3. Run `compare-oracle-ui-price.js` - Compare with UI

### Keeper fails
1. Run `verify-keeper-ready.js` - Complete system check
2. Check oracle: `check-oracle.js`
3. Check vault: `check-vault-balance.js`

### Pool compatibility issues
1. Run `check-pool-type.js` - Verify pool type
2. Run `check-oracle-compatibility.js` - Check compatibility
3. Run `test-oracle.js` - Test oracle with pool

---

## Best Practices

1. **Before deployment**: Run `test-oracle.js`
2. **After deployment**: Run `verify-keeper-ready.js`
3. **When troubleshooting**: Start with `check-oracle.js`
4. **Before keeper**: Always run `verify-keeper-ready.js`

