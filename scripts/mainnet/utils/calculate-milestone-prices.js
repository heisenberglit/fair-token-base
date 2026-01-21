// scripts/mainnet/calculate-milestone-prices.js
// Calculate all milestone price targets for reference

const START_PRICE = 10; // $0.00001 in oracle format (usd_price * 1,000,000)
const PRICE_MULTIPLIER_NUM = 15;
const PRICE_MULTIPLIER_DEN = 10;
const TOTAL_MILESTONES = 18;

// Oracle format: price = usd_price * 1,000,000
// Example: $0.00001 = 10, $0.000015 = 15, $0.001 = 1,000,000
const ORACLE_MULTIPLIER = 1000000;

console.log("\n" + "=".repeat(80));
console.log("Milestone Price Targets");
console.log("=".repeat(80));
console.log("\nFormat: Price (oracle units) = USD Price");
console.log("Oracle format: price = usd_price * 1,000,000");
console.log("Each milestone requires price to be >= target price\n");

let price = START_PRICE;

for (let i = 1; i <= TOTAL_MILESTONES; i++) {
  // Convert oracle price back to USD: usd_price = price / 1,000,000
  const usdPrice = price / ORACLE_MULTIPLIER;
  const multiplier = price / START_PRICE;
  
  // Format USD price nicely
  const usdPriceFormatted = usdPrice.toFixed(6).replace(/\.?0+$/, '');
  
  console.log(`Milestone ${i.toString().padStart(2, ' ')}: ${price.toString().padStart(10, ' ')} = $${usdPriceFormatted} (${multiplier.toFixed(2)}x)`);
  
  price = Math.floor((price * PRICE_MULTIPLIER_NUM) / PRICE_MULTIPLIER_DEN);
}

console.log("\n" + "=".repeat(80));
console.log("Testing Tips:");
console.log("=".repeat(80));
console.log("1. Set pool liquidity range: Full range (0 to ∞) for testing");
console.log("2. Current price should start around Milestone 1: $0.000010");
console.log("3. To test higher milestones, swap USDC → HONEST to increase price");
console.log("4. Price needs to stay above target for TWAP window (1 hour)");
console.log("5. Use: node scripts/mainnet/check-oracle.js to check current TWAP price\n");

