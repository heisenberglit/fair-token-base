/**
 * Format token amounts from wei (18 decimals) to human-readable format
 */

const TOKEN_DECIMALS = 18
const DECIMAL_FACTOR = 10n ** BigInt(TOKEN_DECIMALS)

/**
 * Format token amount from wei to human-readable string
 * @param {number|string|bigint} amount - Amount in wei (smallest unit)
 * @returns {string} Formatted string (e.g., "50.0M FAIR", "1.5B FAIR")
 */
export function formatTokenAmount(amount) {
  if (!amount || amount === 0 || amount === '0' || amount === 0n) {
    return '0 FAIR'
  }
  
  let tokens
  
  // Handle different input types
  if (typeof amount === 'bigint') {
    // Already BigInt, convert to tokens
    tokens = Number(amount) / Number(DECIMAL_FACTOR)
  } else if (typeof amount === 'string') {
    // String - check if it contains 'e' (scientific notation)
    if (amount.includes('e') || amount.includes('E')) {
      // Scientific notation - parse as float first
      const num = parseFloat(amount)
      // Assume it's in wei if very large
      tokens = num / Number(DECIMAL_FACTOR)
    } else {
      // Try to parse as BigInt first, then convert
      try {
        const amountBigInt = BigInt(amount)
        tokens = Number(amountBigInt) / Number(DECIMAL_FACTOR)
      } catch (e) {
        // If BigInt conversion fails, try parsing as number
        const num = parseFloat(amount)
        // If it's already in token units (small number), use as-is
        // Otherwise assume it's in wei
        if (num < 1e12) {
          tokens = num
        } else {
          tokens = num / Number(DECIMAL_FACTOR)
        }
      }
    }
  } else {
    // Number - check if it's in scientific notation or very large
    const num = Number(amount)
    const numStr = num.toString()
    
    // If it's in scientific notation, handle it directly
    if (numStr.includes('e') || numStr.includes('E')) {
      // Scientific notation - assume it's in wei and convert
      tokens = num / Number(DECIMAL_FACTOR)
    } else if (num >= 1e12) {
      // Very large number (likely in wei), convert to tokens
      tokens = num / Number(DECIMAL_FACTOR)
    } else {
      // Small number (likely already in tokens)
      tokens = num
    }
  }
  
  // Format based on size
  if (tokens >= 1e9) {
    return `${(tokens / 1e9).toFixed(1)}B FAIR`
  } else if (tokens >= 1e6) {
    return `${(tokens / 1e6).toFixed(1)}M FAIR`
  } else if (tokens >= 1e3) {
    return `${(tokens / 1e3).toFixed(1)}K FAIR`
  } else {
    return `${tokens.toFixed(2)} FAIR`
  }
}

/**
 * Format token amount as a number (for calculations)
 * @param {number|string|bigint} amount - Amount in wei
 * @returns {number} Amount in tokens
 */
export function tokenAmountToNumber(amount) {
  if (!amount || amount === 0 || amount === '0' || amount === 0n) {
    return 0
  }
  const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount.toString())
  return Number(amountBigInt) / Number(DECIMAL_FACTOR)
}

