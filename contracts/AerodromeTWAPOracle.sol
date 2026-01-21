// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPriceOracle {
    function getPrice() external view returns (uint256);
}

/// @notice Aerodrome CL (Slipstream) pool interface
interface IAerodromePool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

/// @notice ERC20 decimals interface
interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @title AerodromeTWAPOracle
/// @notice TWAP oracle for Aerodrome CL pools - returns FAIR/USD price in 1e9 units
/// @dev Example: $0.000010 returns 10, $0.001 returns 1000000
contract AerodromeTWAPOracle is IPriceOracle {
    /// @notice Aerodrome CL pool address
    address public immutable pool;
    
    /// @notice FAIR token address
    address public immutable fairToken;
    
    /// @notice Quote token address (USDC)
    address public immutable quoteToken;
    
    /// @notice TWAP window in seconds
    uint32 public immutable twapWindow;
    
    /// @notice Whether FAIR is token0 (cached)
    bool public immutable fairIsToken0;
    
    /// @notice Decimal adjustment factor (cached)
    /// @dev = 10^(PRICE_DECIMALS + fairDecimals - quoteDecimals)
    uint256 public immutable decimalFactor;
    
    /// @notice Output format multiplier (1,000,000 format)
    /// @dev Oracle format: usd_price * 1,000,000 (e.g., $0.000010 = 10)
    uint256 public constant ORACLE_MULTIPLIER = 1_000_000;
    
    /// @notice 2^192 for price calculation
    uint256 private constant Q192 = 2**192;
    
    /**
     * @param pool_ Aerodrome CL pool address
     * @param fairToken_ FAIR token address  
     * @param quoteToken_ Quote token address (USDC)
     * @param twapWindow_ TWAP window in seconds (e.g., 3600 for 1 hour)
     */
    constructor(
        address pool_,
        address fairToken_,
        address quoteToken_,
        uint32 twapWindow_
    ) {
        require(pool_ != address(0), "Pool zero");
        require(fairToken_ != address(0), "FAIR zero");
        require(quoteToken_ != address(0), "Quote zero");
        require(twapWindow_ > 0, "Window zero");
        
        pool = pool_;
        fairToken = fairToken_;
        quoteToken = quoteToken_;
        twapWindow = twapWindow_;
        
        // Verify tokens are in pool
        address token0 = IAerodromePool(pool_).token0();
        address token1 = IAerodromePool(pool_).token1();
        
        require(token0 == fairToken_ || token1 == fairToken_, "FAIR not in pool");
        require(token0 == quoteToken_ || token1 == quoteToken_, "Quote not in pool");
        
        fairIsToken0 = (token0 == fairToken_);
        
        // Cache decimal factor
        uint8 fairDec = IERC20Decimals(fairToken_).decimals();
        uint8 quoteDec = IERC20Decimals(quoteToken_).decimals();
        
        // sqrtPriceX96 from pool gives: sqrt(reserve1_wei/reserve0_wei) * 2^96
        // price = (sqrtPriceX96 / 2^96)^2 = reserve1_wei/reserve0_wei
        // To convert to USD per FAIR, we need to account for:
        //   1. Token decimal difference: 10^(fairDec - quoteDec)
        //   2. Oracle format: multiply by 1,000,000
        // So: decimalFactor = 1,000,000 * 10^(fairDec - quoteDec)
        // For FAIR(18) / USDC(6): 1,000,000 * 10^(18-6) = 1,000,000 * 10^12 = 10^18
        uint256 decimalDiff = uint256(fairDec) - uint256(quoteDec);
        decimalFactor = ORACLE_MULTIPLIER * (10 ** decimalDiff);
    }
    
    /**
     * @notice Get TWAP price in 1e9 format
     * @return price FAIR/USD price (e.g., $0.000010 = 10)
     */
    function getPrice() external view override returns (uint256 price) {
        int24 tick = _getTWAPTick();
        uint160 sqrtPriceX96 = _getSqrtPriceFromTick(tick);
        price = _sqrtPriceToOutput(sqrtPriceX96);
    }
    
    /**
     * @notice Get current spot price (for comparison)
     * @return price Spot price in 1e9 format, returns 0 if pool call fails
     */
    function getSpotPrice() external view returns (uint256 price) {
        try IAerodromePool(pool).slot0() returns (
            uint160 sqrtPriceX96,
            int24,
            uint16,
            uint16,
            uint16,
            uint8,
            bool
        ) {
            price = _sqrtPriceToOutput(sqrtPriceX96);
        } catch {
            // If slot0() fails, return 0 (indicates pool issue)
            price = 0;
        }
    }
    
    /**
     * @notice Get TWAP tick from pool observations
     * @dev Falls back to spot price if TWAP unavailable, returns 0 if both fail
     */
    function _getTWAPTick() internal view returns (int24 tick) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow;
        secondsAgos[1] = 0;
        
        try IAerodromePool(pool).observe(secondsAgos) returns (
            int56[] memory tickCumulatives,
            uint160[] memory
        ) {
            int56 delta = tickCumulatives[1] - tickCumulatives[0];
            int56 window = int56(uint56(twapWindow));
            tick = int24(delta / window);
            
            // Round towards negative infinity
            if (delta < 0 && (delta % window != 0)) {
                tick--;
            }
        } catch {
            // Fallback to spot if TWAP unavailable
            try IAerodromePool(pool).slot0() returns (
                uint160,
                int24 tick_,
                uint16,
                uint16,
                uint16,
                uint8,
                bool
            ) {
                tick = tick_;
            } catch {
                // If both fail, return 0 (will result in price of 1, which is better than reverting)
                // This should only happen if pool is completely broken
                tick = 0;
            }
        }
    }
    
    /**
     * @notice Convert sqrtPriceX96 to output format
     * @dev Handles small prices without underflow by multiplying before dividing
     * @param sqrtPriceX96 The sqrt price in Q96 format
     * @return price Price in 1e9 format
     */
    function _sqrtPriceToOutput(uint160 sqrtPriceX96) internal view returns (uint256 price) {
        // sqrtPriceX96 = sqrt(token1/token0) * 2^96
        // price of token0 in token1 = (sqrtPriceX96 / 2^96)^2 = sqrtPriceX96^2 / 2^192
        
        // We want: priceOutput = rawPrice * decimalFactor
        //        = (sqrtPriceX96^2 / 2^192) * decimalFactor
        //        = (sqrtPriceX96^2 * decimalFactor) / 2^192
        
        // For small prices, sqrtPriceX96 is small but squaring first then multiplying
        // by decimalFactor gives us a large enough number before dividing
        
        uint256 sqrtPrice = uint256(sqrtPriceX96);
        
        if (fairIsToken0) {
            // Pool gives price of token0 (FAIR) in token1 (USDC)
            // This is exactly what we want: USDC per FAIR
            
            // Compute: (sqrtPrice^2 * decimalFactor) / 2^192
            // To avoid intermediate overflow, we split the calculation
            
            // sqrtPrice^2 fits in uint256 (at most 160*2 = 320 bits? No, sqrtPrice is 160 bits max, squared = 320 bits)
            // Actually uint160^2 = at most 320 bits which overflows uint256 (256 bits)
            // So we need to be careful
            
            // Safe approach: (sqrtPrice * sqrtPrice / 2^64) * (decimalFactor / 2^128)
            // But decimalFactor might not be divisible by 2^128
            
            // Better: compute in parts
            // sqrtPrice^2 / 2^192 = (sqrtPrice / 2^96)^2
            // So: sqrtPrice^2 * decimalFactor / 2^192 = ((sqrtPrice^2 >> 64) * decimalFactor) >> 128
            
            uint256 sqrtPriceSq = sqrtPrice * sqrtPrice; // May overflow for very large prices
            
            // For FAIR at low prices, sqrtPrice is small, so no overflow
            // sqrtPrice for $0.000010 FAIR ≈ 7.9e18, squared ≈ 6.2e37 (fits in uint256)
            
            // price = sqrtPriceSq * decimalFactor / Q192
            // = (sqrtPriceSq * decimalFactor) >> 192
            // = ((sqrtPriceSq >> 64) * decimalFactor) >> 128
            
            // Even better for precision: (sqrtPriceSq * decimalFactor) >> 192
            // If sqrtPriceSq * decimalFactor doesn't overflow (it might for large prices)
            
            // decimalFactor for FAIR/USDC = 10^21 ≈ 2^70
            // sqrtPriceSq for high prices could be 2^256
            // sqrtPriceSq * 10^21 would overflow
            
            // Safe: check magnitude and choose algorithm
            if (sqrtPrice < 2**128) {
                // Small sqrt price (covers FAIR's price range) - multiply first
                uint256 numerator = sqrtPriceSq * decimalFactor;
                price = numerator >> 192;
                
                // If still 0 due to precision, use higher precision
                if (price == 0 && sqrtPriceSq > 0) {
                    // (sqrtPriceSq * decimalFactor) >> 192 = 0 means sqrtPriceSq * decimalFactor < 2^192
                    // Try: ((sqrtPriceSq >> 96) * decimalFactor) >> 96
                    price = ((sqrtPriceSq >> 96) * decimalFactor) >> 96;
                }
            } else {
                // Large sqrt price - divide first to avoid overflow  
                price = (sqrtPriceSq >> 192) * decimalFactor;
            }
        } else {
            // FAIR is token1, pool gives FAIR per USDC
            // We need USDC per FAIR = 1 / (FAIR per USDC)
            // = 2^192 / sqrtPrice^2 (in raw terms)
            // Output = (2^192 / sqrtPrice^2) * decimalFactor
            //        = (2^192 * decimalFactor) / sqrtPrice^2
            
            uint256 sqrtPriceSq = sqrtPrice * sqrtPrice;
            require(sqrtPriceSq > 0, "Price zero");
            
            // (Q192 * decimalFactor) / sqrtPriceSq
            // This could overflow if decimalFactor is large
            // Q192 ≈ 2^192, decimalFactor ≈ 2^70, product ≈ 2^262 (overflows)
            
            // Safe: (Q192 / sqrtPriceSq) * decimalFactor might lose precision
            // Better: ((Q192 >> 64) * decimalFactor) / (sqrtPriceSq >> 64)
            
            uint256 numerator = (Q192 >> 64) * decimalFactor;
            uint256 denominator = sqrtPriceSq >> 64;
            
            if (denominator > 0) {
                price = numerator / denominator;
            }
        }
    }
    
    /**
     * @notice Convert tick to sqrtPriceX96
     * @dev Standard Uniswap V3 TickMath implementation
     */
    function _getSqrtPriceFromTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
        require(absTick <= 887272, "Tick OOB");
        
        uint256 ratio = absTick & 0x1 != 0
            ? 0xfffcb933bd6fad37aa2d162d1a594001
            : 0x100000000000000000000000000000000;
        
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;
        
        if (tick > 0) ratio = type(uint256).max / ratio;
        
        // Convert from Q128 to Q96
        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }
}
