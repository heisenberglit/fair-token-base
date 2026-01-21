// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPriceOracle {
    function getPrice() external view returns (uint256);
}

/// @notice Uniswap V3 pool interface (same as Aerodrome CL)
interface IUniswapV3Pool {
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

/// @title UniswapV3Oracle
/// @notice TWAP oracle for Uniswap V3 pools - returns FAIR/USD price in 1e6 format
/// @dev Same implementation as AerodromeTWAPOracle, works with Uniswap V3 pools
/// @dev Example: $0.000010 returns 10, $0.001 returns 1000000
contract UniswapV3Oracle is IPriceOracle {
    address public immutable pool;
    address public immutable fairToken;
    address public immutable quoteToken;
    uint32 public immutable twapWindow;
    bool public immutable fairIsToken0;
    uint256 public immutable decimalFactor;
    
    uint256 public constant ORACLE_MULTIPLIER = 1_000_000;
    uint256 private constant Q192 = 2**192;
    
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
        address token0 = IUniswapV3Pool(pool_).token0();
        address token1 = IUniswapV3Pool(pool_).token1();
        
        require(token0 == fairToken_ || token1 == fairToken_, "FAIR not in pool");
        require(token0 == quoteToken_ || token1 == quoteToken_, "Quote not in pool");
        
        fairIsToken0 = (token0 == fairToken_);
        
        // Cache decimal factor (same as AerodromeTWAPOracle)
        uint8 fairDec = IERC20Decimals(fairToken_).decimals();
        uint8 quoteDec = IERC20Decimals(quoteToken_).decimals();
        uint256 decimalDiff = uint256(fairDec) - uint256(quoteDec);
        decimalFactor = ORACLE_MULTIPLIER * (10 ** decimalDiff);
    }
    
    function getPrice() external view override returns (uint256 price) {
        int24 tick = _getTWAPTick();
        uint160 sqrtPriceX96 = _getSqrtPriceFromTick(tick);
        price = _sqrtPriceToOutput(sqrtPriceX96);
    }
    
    function getSpotPrice() external view returns (uint256 price) {
        try IUniswapV3Pool(pool).slot0() returns (
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
            price = 0;
        }
    }
    
    function _getTWAPTick() internal view returns (int24 tick) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow;
        secondsAgos[1] = 0;
        
        try IUniswapV3Pool(pool).observe(secondsAgos) returns (
            int56[] memory tickCumulatives,
            uint160[] memory
        ) {
            int56 delta = tickCumulatives[1] - tickCumulatives[0];
            int56 window = int56(uint56(twapWindow));
            tick = int24(delta / window);
            
            if (delta < 0 && (delta % window != 0)) {
                tick--;
            }
        } catch {
            try IUniswapV3Pool(pool).slot0() returns (
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
                tick = 0;
            }
        }
    }
    
    function _sqrtPriceToOutput(uint160 sqrtPriceX96) internal view returns (uint256 price) {
        uint256 sqrtPrice = uint256(sqrtPriceX96);
        
        if (fairIsToken0) {
            uint256 sqrtPriceSq = sqrtPrice * sqrtPrice;
            
            if (sqrtPrice < 2**128) {
                uint256 numerator = sqrtPriceSq * decimalFactor;
                price = numerator >> 192;
                
                if (price == 0 && sqrtPriceSq > 0) {
                    price = ((sqrtPriceSq >> 96) * decimalFactor) >> 96;
                }
            } else {
                price = (sqrtPriceSq >> 192) * decimalFactor;
            }
        } else {
            uint256 sqrtPriceSq = sqrtPrice * sqrtPrice;
            require(sqrtPriceSq > 0, "Price zero");
            
            uint256 numerator = (Q192 >> 64) * decimalFactor;
            uint256 denominator = sqrtPriceSq >> 64;
            
            if (denominator > 0) {
                price = numerator / denominator;
            }
        }
    }
    
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
        
        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }
}

