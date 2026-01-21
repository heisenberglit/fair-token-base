# Utility Scripts

Helper scripts for calculations and information.

## Scripts

### `calculate-milestone-prices.js`
**Calculate milestone price targets** - Shows all milestone price targets.

**Usage:**
```bash
node scripts/mainnet/utils/calculate-milestone-prices.js
```

**Output:**
- All 18 milestone price targets
- Price in oracle units (1e6 format)
- Price in USD
- Multiplier from previous milestone

**Example Output:**
```
Milestone 1:  10 oracle units = $0.000010 USD (1.50x from start)
Milestone 2:  15 oracle units = $0.000015 USD (1.50x from milestone 1)
Milestone 3:  22.5 oracle units = $0.0000225 USD (1.50x from milestone 2)
...
```

**Use this to:**
- Understand milestone price targets
- Plan testing strategy
- Verify price calculations

---

## Price Format

All prices are in **oracle units** (1e6 format):
- `10` = $0.000010 USD
- `15` = $0.000015 USD
- `1000000` = $1.00 USD

The oracle multiplies USD price by 1,000,000 to avoid decimals.

---

## Milestone Progression

Each milestone requires:
1. **Cooldown elapsed** - Time since last unlock (90 days prod, 4 hours test)
2. **Good periods reached** - Price above target for required periods (360 prod, 2 test)
3. **Current price ≥ target** - TWAP price must be at or above milestone target

Price targets increase by **1.5x** each milestone:
- Milestone 1: 10 (1.5x from start price of ~6.67)
- Milestone 2: 15 (1.5x from 10)
- Milestone 3: 22.5 (1.5x from 15)
- ... and so on

---

## Related Scripts

- **Check current price**: `../diagnostics/check-spot-price.js`
- **Adjust price**: `../pool-management/adjust-price-to-target.js`
- **Verify system**: `../diagnostics/verify-keeper-ready.js`

