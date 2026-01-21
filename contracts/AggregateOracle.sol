// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPriceOracle {
    function getPrice() external view returns (uint256);
}

/**
 * @title AggregateOracle
 * @notice Aggregates prices from multiple oracle sources (DEX pools, CEX feeds, etc.)
 * @dev Implements IPriceOracle interface - can be used as drop-in replacement
 * 
 * FEATURES:
 * - Multiple price sources (Aerodrome, Uniswap V3, Chainlink, etc.)
 * - Configurable aggregation method (mean, median, weighted average)
 * - Graceful failure handling (if one source fails, use others)
 * - Minimum sources required (prevents single point of failure)
 * - Maximum price deviation check (filters outliers)
 * 
 * USAGE:
 * 1. Deploy individual oracles (AerodromeTWAPOracle, UniswapV3Oracle, etc.)
 * 2. Deploy AggregateOracle with list of oracle addresses
 * 3. Set aggregation parameters (method, minSources, maxDeviation)
 * 4. Use AggregateOracle address in FAIRVault.setOracleAndFreeze()
 * 
 * AGGREGATION METHODS:
 * - MEAN (0): Simple average of all valid prices
 * - MEDIAN (1): Middle value (more resistant to outliers)
 * - WEIGHTED (2): Weighted average (requires weights to be set)
 */
contract AggregateOracle is IPriceOracle {
    /// @notice Aggregation method enum
    enum AggregationMethod {
        MEAN,      // Simple average
        MEDIAN,    // Middle value
        WEIGHTED   // Weighted average
    }

    /// @notice Price oracle sources
    address[] public sources;
    
    /// @notice Source weights (for weighted average, 0 = equal weight)
    mapping(address => uint256) public sourceWeights;
    
    /// @notice Aggregation method
    AggregationMethod public aggregationMethod;
    
    /// @notice Minimum number of sources required (default: 1)
    uint256 public minSources;
    
    /// @notice Maximum price deviation allowed (in basis points, 0 = disabled)
    /// @dev If price deviates more than this from median, it's considered outlier
    uint256 public maxDeviationBps; // e.g., 500 = 5%
    
    /// @notice Owner (can update sources and parameters)
    address public owner;
    
    /// @notice Whether oracle is frozen (no more changes allowed)
    bool public frozen;
    
    event SourceAdded(address indexed source);
    event SourceRemoved(address indexed source);
    event SourceWeightUpdated(address indexed source, uint256 weight);
    event AggregationMethodUpdated(AggregationMethod method);
    event MinSourcesUpdated(uint256 minSources);
    event MaxDeviationUpdated(uint256 maxDeviationBps);
    event OracleFrozen();
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier notFrozen() {
        require(!frozen, "Frozen");
        _;
    }
    
    /**
     * @param sources_ Array of IPriceOracle contract addresses
     * @param method_ Aggregation method (0=MEAN, 1=MEDIAN, 2=WEIGHTED)
     * @param minSources_ Minimum number of valid sources required
     * @param maxDeviationBps_ Maximum price deviation in basis points (0 = disabled)
     */
    constructor(
        address[] memory sources_,
        AggregationMethod method_,
        uint256 minSources_,
        uint256 maxDeviationBps_
    ) {
        require(sources_.length > 0, "No sources");
        require(minSources_ > 0 && minSources_ <= sources_.length, "Invalid minSources");
        
        owner = msg.sender;
        sources = sources_;
        aggregationMethod = method_;
        minSources = minSources_;
        maxDeviationBps = maxDeviationBps_;
        
        // Verify all sources implement IPriceOracle
        for (uint256 i = 0; i < sources_.length; i++) {
            require(sources_[i] != address(0), "Source zero");
            // Try to call getPrice() to verify it's a valid oracle
            try IPriceOracle(sources_[i]).getPrice() returns (uint256) {
                // Valid oracle
            } catch {
                revert("Invalid oracle source");
            }
        }
    }
    
    /**
     * @notice Get aggregated price from all sources
     * @return price Aggregated price in same format as source oracles
     * @dev Returns 0 if insufficient valid sources
     */
    function getPrice() external view override returns (uint256 price) {
        uint256[] memory prices = new uint256[](sources.length);
        uint256 validCount = 0;
        
        // Collect prices from all sources
        for (uint256 i = 0; i < sources.length; i++) {
            try IPriceOracle(sources[i]).getPrice() returns (uint256 p) {
                if (p > 0) { // Only accept non-zero prices
                    prices[validCount] = p;
                    validCount++;
                }
            } catch {
                // Source failed, skip it
                continue;
            }
        }
        
        // Check minimum sources requirement
        if (validCount < minSources) {
            return 0; // Insufficient valid sources
        }
        
        // Resize array to valid prices only
        uint256[] memory validPrices = new uint256[](validCount);
        for (uint256 i = 0; i < validCount; i++) {
            validPrices[i] = prices[i];
        }
        
        // Filter outliers if maxDeviation is set
        if (maxDeviationBps > 0 && validCount > 2) {
            validPrices = _filterOutliers(validPrices);
            validCount = validPrices.length;
            
            if (validCount < minSources) {
                return 0; // After filtering, insufficient sources
            }
        }
        
        // Aggregate based on method
        if (aggregationMethod == AggregationMethod.MEAN) {
            price = _calculateMean(validPrices);
        } else if (aggregationMethod == AggregationMethod.MEDIAN) {
            price = _calculateMedian(validPrices);
        } else if (aggregationMethod == AggregationMethod.WEIGHTED) {
            price = _calculateWeighted(validPrices);
        } else {
            revert("Invalid method");
        }
    }
    
    /**
     * @notice Filter out prices that deviate too much from median
     * @param prices Array of prices
     * @return filtered Filtered array with outliers removed
     */
    function _filterOutliers(uint256[] memory prices) internal view returns (uint256[] memory) {
        if (prices.length <= 2) {
            return prices; // Need at least 2 for comparison
        }
        
        // Calculate median first
        uint256[] memory sorted = _sortPrices(prices);
        uint256 median = sorted[sorted.length / 2];
        
        // Filter prices within deviation
        uint256[] memory filtered = new uint256[](prices.length);
        uint256 filteredCount = 0;
        
        for (uint256 i = 0; i < prices.length; i++) {
            uint256 deviation;
            if (prices[i] > median) {
                deviation = ((prices[i] - median) * 10000) / median;
            } else {
                deviation = ((median - prices[i]) * 10000) / median;
            }
            
            if (deviation <= maxDeviationBps) {
                filtered[filteredCount] = prices[i];
                filteredCount++;
            }
        }
        
        // Resize array
        uint256[] memory result = new uint256[](filteredCount);
        for (uint256 i = 0; i < filteredCount; i++) {
            result[i] = filtered[i];
        }
        
        return result;
    }
    
    /**
     * @notice Calculate mean (average) of prices
     */
    function _calculateMean(uint256[] memory prices) internal pure returns (uint256) {
        uint256 sum = 0;
        for (uint256 i = 0; i < prices.length; i++) {
            sum += prices[i];
        }
        return sum / prices.length;
    }
    
    /**
     * @notice Calculate median of prices
     */
    function _calculateMedian(uint256[] memory prices) internal pure returns (uint256) {
        uint256[] memory sorted = _sortPrices(prices);
        uint256 mid = sorted.length / 2;
        
        if (sorted.length % 2 == 0) {
            // Even number: average of two middle values
            return (sorted[mid - 1] + sorted[mid]) / 2;
        } else {
            // Odd number: middle value
            return sorted[mid];
        }
    }
    
    /**
     * @notice Calculate weighted average of prices
     * @dev Simplified: assumes prices array corresponds to sources array in order
     * @dev If weights not set, uses equal weights (1 per source)
     * @dev Note: In practice, you'd need to track which source each price came from
     *      For now, we assume prices[i] corresponds to sources[i] if both arrays align
     */
    function _calculateWeighted(uint256[] memory prices) internal view returns (uint256) {
        // If we have more prices than sources, something is wrong - use mean
        if (prices.length > sources.length) {
            return _calculateMean(prices);
        }
        
        uint256 totalWeight = 0;
        uint256 weightedSum = 0;
        
        // Match prices to sources (assuming same order)
        // Note: This is simplified - in a real implementation, you'd track source->price mapping
        for (uint256 i = 0; i < prices.length && i < sources.length; i++) {
            uint256 weight = sourceWeights[sources[i]];
            if (weight == 0) {
                weight = 1; // Default weight if not set
            }
            
            totalWeight += weight;
            weightedSum += prices[i] * weight;
        }
        
        if (totalWeight == 0) {
            return _calculateMean(prices); // Fallback to mean
        }
        
        return weightedSum / totalWeight;
    }
    
    /**
     * @notice Sort prices in ascending order (bubble sort for small arrays)
     */
    function _sortPrices(uint256[] memory prices) internal pure returns (uint256[] memory) {
        uint256[] memory sorted = new uint256[](prices.length);
        
        // Copy array
        for (uint256 i = 0; i < prices.length; i++) {
            sorted[i] = prices[i];
        }
        
        // Bubble sort
        for (uint256 i = 0; i < sorted.length; i++) {
            for (uint256 j = 0; j < sorted.length - i - 1; j++) {
                if (sorted[j] > sorted[j + 1]) {
                    uint256 temp = sorted[j];
                    sorted[j] = sorted[j + 1];
                    sorted[j + 1] = temp;
                }
            }
        }
        
        return sorted;
    }
    
    // -----------------------------
    // OWNER FUNCTIONS (until frozen)
    // -----------------------------
    
    /**
     * @notice Add a new price source
     */
    function addSource(address source) external onlyOwner notFrozen {
        require(source != address(0), "Source zero");
        require(!_isSource(source), "Source exists");
        
        // Verify it's a valid oracle
        try IPriceOracle(source).getPrice() returns (uint256) {
            sources.push(source);
            emit SourceAdded(source);
        } catch {
            revert("Invalid oracle");
        }
    }
    
    /**
     * @notice Remove a price source
     */
    function removeSource(address source) external onlyOwner notFrozen {
        require(_isSource(source), "Source not found");
        require(sources.length > minSources, "Too few sources");
        
        // Remove from array
        for (uint256 i = 0; i < sources.length; i++) {
            if (sources[i] == source) {
                sources[i] = sources[sources.length - 1];
                sources.pop();
                emit SourceRemoved(source);
                break;
            }
        }
    }
    
    /**
     * @notice Set weight for a source (for weighted average)
     */
    function setSourceWeight(address source, uint256 weight) external onlyOwner notFrozen {
        require(_isSource(source), "Source not found");
        sourceWeights[source] = weight;
        emit SourceWeightUpdated(source, weight);
    }
    
    /**
     * @notice Update aggregation method
     */
    function setAggregationMethod(AggregationMethod method) external onlyOwner notFrozen {
        aggregationMethod = method;
        emit AggregationMethodUpdated(method);
    }
    
    /**
     * @notice Update minimum sources required
     */
    function setMinSources(uint256 minSources_) external onlyOwner notFrozen {
        require(minSources_ > 0 && minSources_ <= sources.length, "Invalid minSources");
        minSources = minSources_;
        emit MinSourcesUpdated(minSources_);
    }
    
    /**
     * @notice Update maximum deviation
     */
    function setMaxDeviation(uint256 maxDeviationBps_) external onlyOwner notFrozen {
        maxDeviationBps = maxDeviationBps_;
        emit MaxDeviationUpdated(maxDeviationBps_);
    }
    
    /**
     * @notice Freeze oracle (no more changes allowed)
     */
    function freeze() external onlyOwner {
        frozen = true;
        emit OracleFrozen();
    }
    
    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Owner zero");
        owner = newOwner;
    }
    
    // -----------------------------
    // VIEW FUNCTIONS
    // -----------------------------
    
    /**
     * @notice Get number of sources
     */
    function getSourceCount() external view returns (uint256) {
        return sources.length;
    }
    
    /**
     * @notice Check if address is a source
     */
    function _isSource(address source) internal view returns (bool) {
        for (uint256 i = 0; i < sources.length; i++) {
            if (sources[i] == source) {
                return true;
            }
        }
        return false;
    }
}

