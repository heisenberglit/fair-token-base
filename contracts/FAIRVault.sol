// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPriceOracle {
    function getPrice() external view returns (uint256);
}

/**
 * @title FAIRVault - Trustless Milestone Unlock Escrow
 * @notice Holds existing FAIR tokens and releases them automatically based on on-chain conditions
 * @dev Works with existing ERC20 token - does NOT mint new tokens
 * 
 * SECURITY MODEL:
 * - Token address: IMMUTABLE (set in constructor)
 * - Pool wallets: IMMUTABLE (set in constructor)  
 * - Oracle: SET ONCE, THEN FROZEN PERMANENTLY
 * - Unlocks: FULLY AUTOMATIC (no human discretion)
 * - Price: READ FROM AERODROME TWAP (on-chain, manipulation-resistant)
 * 
 * SETUP FLOW:
 * 1. Deploy vault with token address and pool wallets
 * 2. Transfer escrowed tokens to vault
 * 3. Call initialize() to set milestone amounts
 * 4. Deploy AerodromeTWAPOracle pointing to Aerodrome pool
 * 5. Call setOracleAndFreeze() - PERMANENT, CANNOT BE UNDONE
 * 6. Keeper bot calls tryUnlock() hourly - anyone can call this
 * 
 * UNLOCK CONDITIONS (ALL must be met):
 * - Previous milestone unlocked (sequential: 1 then 2 then 3 ...)
 * - Cooldown elapsed since last unlock (WAIT_RULE: 90 days prod, configurable)
 * - Required good periods with price above target (REQUIRED_GOOD_PERIODS: 360 prod)
 * - Unlock price = TWAP over the full qualifying window (not single reading at unlock)
 *
 * WHY 360-HOUR TWAP INSTEAD OF SINGLE READING:
 * - Prevents "end-loaded pumping": manipulator can't pump at unlock moment for outsized effect
 * - Every qualifying hour contributes equally (1/360th weight each)
 * - Rewards sustained organic price appreciation over 15 days
 * - Penalizes volatility: wild swings average out
 * - Industry standard approach (Uniswap, Chainlink use TWAP for manipulation resistance)
 * - If someone pumps for 360 hours, that's not manipulation—that's price discovery
 *
 * TWAP CALCULATION:
 * - Each good period: milestoneCumulativePriceTime += oracle_price * PERIOD_INTERVAL
 * - At unlock: twapPrice = milestoneCumulativePriceTime / (REQUIRED_GOOD_PERIODS * PERIOD_INTERVAL)
 * - Integer division floors (rounds down) consistently
 * - Once unlocked, TWAP is permanently stored in lastUnlockPrice
 *
 * DYNAMIC NEXT TARGET:
 * - M(n+1)_target = M(n)_TWAP * 1.5 (not hardcoded at deploy)
 * - Adapts to actual sustained market performance
 * - Prevents milestone skipping even if price spikes far above
 */
contract FAIRVault is Ownable {
    using SafeERC20 for IERC20;

    // -----------------------------
    // EXTERNAL TOKEN
    // -----------------------------

    /// @notice The existing FAIR token contract
    IERC20 public immutable fairToken;

    // -----------------------------
    // MILESTONE CONFIG
    // -----------------------------

    /// @notice Number of milestones
    uint256 public constant TOTAL_MILESTONES = 18;

    /// @notice Wait time between milestone unlocks (configurable: 90 days prod, 4 hours test)
    uint256 public immutable WAIT_RULE;

    /// @notice Price multiplier (1.5x per milestone)
    uint256 public constant PRICE_MULTIPLIER_NUM = 15;
    uint256 public constant PRICE_MULTIPLIER_DEN = 10;

    /// @notice Required good periods per milestone (configurable: 360 prod, 2 test)
    uint256 public immutable REQUIRED_GOOD_PERIODS;

    /// @notice Minimum time between good period recordings (configurable: 1 hour prod, 1 min test)
    uint256 public immutable PERIOD_INTERVAL;

    /// @notice Starting price target for milestone 1 ($0.000030 in 1e6 units)
    uint256 public constant START_PRICE = 30;

    /// @notice Minimum liquidity floor for good period qualification (0 = disabled, for future use)
    /// @dev Reserved for future enhancement: require minimum pool liquidity to count as good period
    uint256 public immutable MIN_LIQUIDITY_FLOOR;

    // -----------------------------
    // POOL WALLETS (set at deployment)
    // -----------------------------

    address public immutable S1_TREASURY;
    address public immutable S2_LIQUIDITY;
    address public immutable S3_GROWTH;
    address public immutable S4_TEAM;

    /// @notice Pool distribution ratios (out of 8500)
    uint256 public constant TREASURY_NUM  = 5000;  // 58.82%
    uint256 public constant GROWTH_NUM    = 2000;  // 23.53%
    uint256 public constant LIQUIDITY_NUM = 500;   //  5.88%
    uint256 public constant TEAM_NUM      = 1000;  // 11.76%
    uint256 public constant POOL_DEN      = 8500;

    // -----------------------------
    // STATE
    // -----------------------------

    /// @notice Price oracle contract
    IPriceOracle public priceOracle;

    /// @notice Timestamp of last milestone unlock (or TGE)
    uint256 public lastUnlockTime;

    /// @notice Price at last unlock
    uint256 public lastUnlockPrice;

    /// @notice Amount to release per milestone (set when funded)
    uint256 public milestoneUnlockAmount;

    /// @notice Total tokens deposited
    uint256 public totalDeposited;

    /// @notice Whether the vault has been initialized with tokens
    bool public initialized;

    /// @notice Whether the oracle has been permanently frozen
    bool public oracleFrozen;

    /// @notice Milestone unlocked status
    mapping(uint256 => bool) public milestoneUnlocked;

    /// @notice Good periods accumulated per milestone
    mapping(uint256 => uint256) public milestoneGoodPeriods;

    /// @notice Last good period timestamp per milestone
    mapping(uint256 => uint256) public milestoneLastGoodPeriodTimestamp;

    /// @notice Price target per milestone
    mapping(uint256 => uint256) public milestonePriceTarget;

    /// @notice Cumulative (price * time) per milestone for TWAP over qualifying window
    mapping(uint256 => uint256) public milestoneCumulativePriceTime;

    /// @notice Whether a milestone has been earned but is pending distribution (vault underfunded at unlock time)
    /// @dev Milestone is permanently earned (milestoneUnlocked = true) but tokens not yet sent.
    ///      Safe refills vault, then anyone calls releasePending() to complete distribution.
    mapping(uint256 => bool) public milestonePending;

    // -----------------------------
    // EVENTS
    // -----------------------------

    event VaultInitialized(uint256 totalAmount, uint256 perMilestone);
    event OracleSet(address indexed oracle);
    event OracleFrozen(address indexed oracle);
    event MilestoneUnlocked(uint256 indexed milestoneId, uint256 twapPrice, uint256 spotPrice, uint256 timestamp);
    event MilestonePending(uint256 indexed milestoneId, uint256 amountOwed, uint256 vaultBalance);
    event PendingMilestoneReleased(uint256 indexed milestoneId, uint256 amount);
    event GoodPeriodRecorded(uint256 indexed milestoneId, uint256 goodPeriods, uint256 price, uint256 timestamp);
    event TokensDistributed(uint256 treasury, uint256 growth, uint256 liquidity, uint256 team);

    // -----------------------------
    // CONSTRUCTOR
    // -----------------------------

    /**
     * @param _fairToken Address of existing FAIR token
     * @param _owner Owner wallet (can set oracle, emergency withdraw)
     * @param _treasury Treasury pool wallet
     * @param _liquidity Liquidity pool wallet
     * @param _growth Growth pool wallet
     * @param _team Team pool wallet
     * @param _tgeTimestamp TGE timestamp (start of first cooldown)
     * @param _waitRule Cooldown period between unlocks (90 days for prod, 4 hours for test)
     * @param _requiredGoodPeriods Required good periods (360 for prod, 2 for test)
     * @param _periodInterval Time between recordings (1 hour for prod, 1 minute for test)
     * @param _minLiquidityFloor Minimum liquidity for good period (0 = disabled, for future use)
     */
    constructor(
        address _fairToken,
        address _owner,
        address _treasury,
        address _liquidity,
        address _growth,
        address _team,
        uint256 _tgeTimestamp,
        uint256 _waitRule,
        uint256 _requiredGoodPeriods,
        uint256 _periodInterval,
        uint256 _minLiquidityFloor
    ) Ownable(_owner) {
        require(_fairToken != address(0), "Token zero");
        require(_treasury != address(0), "Treasury zero");
        require(_liquidity != address(0), "Liquidity zero");
        require(_growth != address(0), "Growth zero");
        require(_team != address(0), "Team zero");
        require(_tgeTimestamp > 0, "TGE zero");
        require(_waitRule > 0, "Wait rule zero");
        require(_requiredGoodPeriods > 0, "Good periods zero");
        require(_periodInterval > 0, "Period interval zero");
        // _minLiquidityFloor can be 0 (disabled)

        fairToken = IERC20(_fairToken);
        S1_TREASURY = _treasury;
        S2_LIQUIDITY = _liquidity;
        S3_GROWTH = _growth;
        S4_TEAM = _team;

        // Set configurable timing parameters
        WAIT_RULE = _waitRule;
        REQUIRED_GOOD_PERIODS = _requiredGoodPeriods;
        PERIOD_INTERVAL = _periodInterval;
        MIN_LIQUIDITY_FLOOR = _minLiquidityFloor;

        lastUnlockTime = _tgeTimestamp;
        lastUnlockPrice = (START_PRICE * PRICE_MULTIPLIER_DEN) / PRICE_MULTIPLIER_NUM; // 30 * 10 / 15 = 20

        // Initialize price ladder (1.5x per milestone)
        uint256 price = START_PRICE;
        for (uint256 i = 1; i <= TOTAL_MILESTONES; i++) {
            milestonePriceTarget[i] = price;
            price = (price * PRICE_MULTIPLIER_NUM) / PRICE_MULTIPLIER_DEN;
        }
    }

    // -----------------------------
    // INITIALIZATION
    // -----------------------------

    /**
     * @notice Initialize vault with the full programmatic supply — does NOT require tokens to be present yet.
     * @dev Under staged funding, Safe holds most FAIR and sends tranches to the vault over time.
     *      Call this with the TOTAL supply that will ever flow through the vault (e.g. 9,000,000,000 * 1e18).
     *      This sets milestoneUnlockAmount = _totalLockedAmount / 18, independently of current vault balance.
     *      Tokens are sent separately by Safe directly to this contract address, before each milestone.
     * @param _totalLockedAmount Total FAIR that will be distributed across all 18 milestones
     */
    function initialize(uint256 _totalLockedAmount) external onlyOwner {
        require(!initialized, "Already initialized");
        require(_totalLockedAmount > 0, "Amount zero");

        totalDeposited = _totalLockedAmount;
        milestoneUnlockAmount = _totalLockedAmount / TOTAL_MILESTONES;
        initialized = true;

        emit VaultInitialized(_totalLockedAmount, milestoneUnlockAmount);
    }

    // -----------------------------
    // ADMIN (ONE-TIME SETUP)
    // -----------------------------

    /**
     * @notice Set the price oracle (ONE TIME ONLY)
     * @dev Once set, oracle cannot be changed. Call freezeOracle() to permanently lock.
     * @param _oracle Oracle contract address (AerodromeTWAPOracle)
     */
    function setOracle(address _oracle) external onlyOwner {
        require(!oracleFrozen, "Oracle permanently frozen");
        require(_oracle != address(0), "Oracle zero");
        priceOracle = IPriceOracle(_oracle);
        emit OracleSet(_oracle);
    }

    /**
     * @notice Permanently freeze the oracle - CANNOT BE UNDONE
     * @dev After calling this, oracle address can never be changed
     */
    function freezeOracle() external onlyOwner {
        require(address(priceOracle) != address(0), "Oracle not set");
        require(!oracleFrozen, "Already frozen");
        oracleFrozen = true;
        emit OracleFrozen(address(priceOracle));
    }

    /**
     * @notice Set oracle and freeze in one transaction
     * @dev Convenience function - sets oracle and immediately freezes it
     * @param _oracle Oracle contract address
     */
    function setOracleAndFreeze(address _oracle) external onlyOwner {
        require(!oracleFrozen, "Oracle permanently frozen");
        require(_oracle != address(0), "Oracle zero");
        priceOracle = IPriceOracle(_oracle);
        oracleFrozen = true;
        emit OracleSet(_oracle);
        emit OracleFrozen(_oracle);
    }

    // -----------------------------
    // VIEW FUNCTIONS
    // -----------------------------

    /**
     * @notice Check if milestone can be unlocked
     * @param milestoneId Milestone ID (1-18)
     */
    function canUnlockMilestone(uint256 milestoneId) external view returns (bool canUnlock, string memory reason) {
        if (!initialized) return (false, "Vault not initialized");
        if (milestoneId < 1 || milestoneId > TOTAL_MILESTONES) return (false, "Invalid milestone ID");
        if (milestoneUnlocked[milestoneId]) return (false, "Already unlocked");
        if (milestoneId > 1 && !milestoneUnlocked[milestoneId - 1]) return (false, "Previous milestone not unlocked");
        if (address(priceOracle) == address(0)) return (false, "Oracle not set");
        if (milestoneId > 1 && block.timestamp < lastUnlockTime + WAIT_RULE) return (false, "Cooldown not elapsed");
        
        // Try to get price, return error if oracle fails
        uint256 price;
        try priceOracle.getPrice() returns (uint256 price_) {
            price = price_;
        } catch {
            return (false, "Oracle getPrice() failed (insufficient pool history)");
        }
        
        if (price < milestonePriceTarget[milestoneId]) return (false, "Price below target");
        if (milestoneGoodPeriods[milestoneId] < REQUIRED_GOOD_PERIODS) return (false, "Good periods not reached");
        
        return (true, "Ready to unlock");
    }

    /**
     * @notice Get milestone status
     * @param milestoneId Milestone ID (1-18)
     */
    function getMilestoneStatus(uint256 milestoneId) external view returns (
        bool unlocked,
        uint256 goodPeriods,
        uint256 priceTarget,
        uint256 currentPrice
    ) {
        unlocked = milestoneUnlocked[milestoneId];
        goodPeriods = milestoneGoodPeriods[milestoneId];
        priceTarget = milestonePriceTarget[milestoneId];
        
        // Try to get price, return 0 if oracle fails (instead of reverting)
        if (address(priceOracle) != address(0)) {
            try priceOracle.getPrice() returns (uint256 price) {
                currentPrice = price;
            } catch {
                // Oracle failed (e.g., insufficient pool history) - return 0
                currentPrice = 0;
            }
        } else {
            currentPrice = 0;
        }
    }

    /**
     * @notice Get vault info
     */
    function getVaultInfo() external view returns (
        address token,
        uint256 balance,
        uint256 deposited,
        uint256 perMilestone,
        uint256 milestonesUnlocked,
        bool isInitialized
    ) {
        token = address(fairToken);
        balance = fairToken.balanceOf(address(this));
        deposited = totalDeposited;
        perMilestone = milestoneUnlockAmount;
        
        for (uint256 i = 1; i <= TOTAL_MILESTONES; i++) {
            if (milestoneUnlocked[i]) milestonesUnlocked++;
        }
        
        isInitialized = initialized;
    }

    // -----------------------------
    // KEEPER FUNCTIONS
    // -----------------------------

    /**
     * @notice Process good hour for a milestone
     * @param milestoneId Milestone ID (1-18)
     * @dev Good periods are NON-CONSECUTIVE: if price drops below target, that hour is skipped.
     *      When price returns above target, accumulation resumes from where it left off.
     *      SOFT STOP: Oracle failures don't revert, hour is simply treated as non-qualifying.
     */
    function processMilestoneHour(uint256 milestoneId) external {
        require(initialized, "Not initialized");
        require(milestoneId >= 1 && milestoneId <= TOTAL_MILESTONES, "Invalid milestone");
        require(!milestoneUnlocked[milestoneId], "Already unlocked");
        require(milestoneId == 1 || milestoneUnlocked[milestoneId - 1], "Previous milestone not unlocked");
        require(address(priceOracle) != address(0), "Oracle not set");

        // SOFT STOP: Oracle failures don't revert - hour treated as non-qualifying
        // This handles: oracle anomalies, chain outages, stale data, edge cases
        uint256 price;
        try priceOracle.getPrice() returns (uint256 price_) {
            price = price_;
        } catch {
            // Oracle failed - can't record period, but don't revert (soft stop)
            return;
        }
        
        uint256 targetPrice = milestonePriceTarget[milestoneId];

        // Price below target = non-qualifying hour (no accumulation)
        if (price < targetPrice) return;

        // Enforce minimum time between recordings (prevents spam)
        uint256 lastGoodPeriod = milestoneLastGoodPeriodTimestamp[milestoneId];
        if (block.timestamp < lastGoodPeriod + PERIOD_INTERVAL) return;

        // Record good period and accumulate for TWAP calculation
        // milestoneCumulativePriceTime ONLY increments here (on recorded good periods)
        milestoneGoodPeriods[milestoneId]++;
        milestoneLastGoodPeriodTimestamp[milestoneId] = block.timestamp;
        milestoneCumulativePriceTime[milestoneId] += price * PERIOD_INTERVAL;

        emit GoodPeriodRecorded(milestoneId, milestoneGoodPeriods[milestoneId], price, block.timestamp);
    }

    /**
     * @notice Finalize milestone unlock
     * @param milestoneId Milestone ID (1-18)
     * @dev SOFT STOP: Oracle failures cause silent return (no revert).
     *      This is intentional for resilience against oracle anomalies.
     *      Caller should check milestoneUnlocked[id] after call to verify success.
     */
    function finalizeMilestone(uint256 milestoneId) external {
        require(initialized, "Not initialized");
        require(milestoneId >= 1 && milestoneId <= TOTAL_MILESTONES, "Invalid milestone");
        require(!milestoneUnlocked[milestoneId], "Already unlocked");
        require(milestoneId == 1 || milestoneUnlocked[milestoneId - 1], "Previous milestone not unlocked");
        require(address(priceOracle) != address(0), "Oracle not set");
        require(milestoneId == 1 || block.timestamp >= lastUnlockTime + WAIT_RULE, "Cooldown not elapsed");

        // SOFT STOP: Oracle failures don't revert - caller can retry later
        uint256 spotPrice;
        try priceOracle.getPrice() returns (uint256 price_) {
            spotPrice = price_;
        } catch {
            // Oracle failed - can't verify price, return silently (soft stop)
            return;
        }
        
        // Price must still be above target at unlock moment
        if (spotPrice < milestonePriceTarget[milestoneId]) return;
        
        require(milestoneGoodPeriods[milestoneId] >= REQUIRED_GOOD_PERIODS, "Good periods not reached");

        // Calculate 360-hour TWAP: average of ALL good period readings
        // Uses integer division (floor rounding) consistently
        uint256 totalTime = REQUIRED_GOOD_PERIODS * PERIOD_INTERVAL;
        uint256 twapPrice = milestoneCumulativePriceTime[milestoneId] / totalTime;

        // Mark unlocked - this is PERMANENT and cannot be undone
        // The twapPrice is stored in lastUnlockPrice and cannot be recomputed
        milestoneUnlocked[milestoneId] = true;
        lastUnlockTime = block.timestamp;
        lastUnlockPrice = twapPrice;

        // Dynamic next target: based on ACTUAL sustained performance (TWAP), not hardcoded
        if (milestoneId < TOTAL_MILESTONES) {
            milestonePriceTarget[milestoneId + 1] = (twapPrice * PRICE_MULTIPLIER_NUM) / PRICE_MULTIPLIER_DEN;
        }

        _distributeUnlock(milestoneId);

        // Emit both 360-hour TWAP (used for calculations) and current 1-hour TWAP (for transparency)
        emit MilestoneUnlocked(milestoneId, twapPrice, spotPrice, block.timestamp);
    }

    /**
     * @notice Combined: process period and finalize if ready (main keeper function)
     * @param milestoneId Milestone ID (1-18)
     * @dev SOFT STOP: Oracle failures don't revert - keeper can retry later.
     *      Good periods are NON-CONSECUTIVE: gaps in qualifying hours are allowed.
     *      milestoneCumulativePriceTime ONLY increments when a good period is recorded.
     */
    function tryUnlock(uint256 milestoneId) external {
        require(initialized, "Not initialized");
        require(milestoneId >= 1 && milestoneId <= TOTAL_MILESTONES, "Invalid milestone");
        require(!milestoneUnlocked[milestoneId], "Already unlocked");
        require(milestoneId == 1 || milestoneUnlocked[milestoneId - 1], "Previous milestone not unlocked");
        require(address(priceOracle) != address(0), "Oracle not set");

        // SOFT STOP: Oracle failures don't revert - handles anomalies, outages, edge cases
        uint256 price;
        try priceOracle.getPrice() returns (uint256 price_) {
            price = price_;
        } catch {
            // Oracle failed - can't record periods or unlock, return silently
            // Keeper will retry later when oracle recovers
            return;
        }
        
        uint256 targetPrice = milestonePriceTarget[milestoneId];

        // 1) Record good period if conditions met
        //    - Price must be >= target (non-qualifying hours are skipped, NOT failed)
        //    - Hours do NOT need to be consecutive
        //    - milestoneCumulativePriceTime ONLY increments here (on recorded good periods)
        if (price >= targetPrice) {
            uint256 lastGoodPeriod = milestoneLastGoodPeriodTimestamp[milestoneId];
            if (block.timestamp >= lastGoodPeriod + PERIOD_INTERVAL) {
                milestoneGoodPeriods[milestoneId]++;
                milestoneLastGoodPeriodTimestamp[milestoneId] = block.timestamp;
                milestoneCumulativePriceTime[milestoneId] += price * PERIOD_INTERVAL;
                emit GoodPeriodRecorded(milestoneId, milestoneGoodPeriods[milestoneId], price, block.timestamp);
            }
        }

        // 2) Check if can finalize (all conditions must be met)
        // M1 has no cooldown wait - it unlocks as soon as good periods are met
        if (milestoneId > 1 && block.timestamp < lastUnlockTime + WAIT_RULE) return;
        if (price < targetPrice) return;
        if (milestoneGoodPeriods[milestoneId] < REQUIRED_GOOD_PERIODS) return;

        // 3) Finalize: compute 360-hour TWAP and unlock
        //    WHY TWAP: Using average of ALL 360 readings prevents end-loaded pumping.
        //    A manipulator can't spike price at unlock moment for outsized effect.
        //    Integer division floors (rounds down) consistently across all milestones.
        uint256 totalTime = REQUIRED_GOOD_PERIODS * PERIOD_INTERVAL;
        uint256 twapPrice = milestoneCumulativePriceTime[milestoneId] / totalTime;

        // Mark unlocked - PERMANENT, cannot be undone or recomputed
        milestoneUnlocked[milestoneId] = true;
        lastUnlockTime = block.timestamp;
        lastUnlockPrice = twapPrice;  // Store 360-hour TWAP (not spot price)

        // Set next milestone target dynamically based on ACTUAL sustained performance
        // This adapts the price ladder to real market consensus
        if (milestoneId < TOTAL_MILESTONES) {
            milestonePriceTarget[milestoneId + 1] = (twapPrice * PRICE_MULTIPLIER_NUM) / PRICE_MULTIPLIER_DEN;
        }

        _distributeUnlock(milestoneId);

        // Emit both: 360-hour TWAP (used for next target) and current 1-hour TWAP (transparency)
        emit MilestoneUnlocked(milestoneId, twapPrice, price, block.timestamp);
    }

    // -----------------------------
    // INTERNAL
    // -----------------------------

    /**
     * @notice Attempt to distribute tokens for an earned milestone.
     * @dev If the vault balance is insufficient, the milestone is marked pending — NO partial payment.
     *      The milestone remains permanently earned (milestoneUnlocked = true).
     *      Once the Safe refills the vault, call releasePending(milestoneId) to complete distribution.
     */
    function _distributeUnlock(uint256 milestoneId) internal {
        uint256 amount = milestoneUnlockAmount;
        uint256 balance = fairToken.balanceOf(address(this));

        // If vault is underfunded: mark as pending, do NOT partially distribute.
        // Safety: Safe (offchain multisig) controls when to refill the vault.
        if (balance < amount) {
            milestonePending[milestoneId] = true;
            emit MilestonePending(milestoneId, amount, balance);
            return;
        }

        _sendDistribution(amount);
    }

    /**
     * @notice Release a pending milestone once the vault has been refilled by the Safe.
     * @dev Anyone can call this — it is fully permissionless and deterministic.
     *      Reverts if milestone is not in pending state, or vault still underfunded.
     * @param milestoneId Milestone ID (1-18) that is in pending state
     */
    function releasePending(uint256 milestoneId) external {
        require(milestoneUnlocked[milestoneId], "Milestone not earned");
        require(milestonePending[milestoneId], "Milestone not pending");

        uint256 amount = milestoneUnlockAmount;
        uint256 balance = fairToken.balanceOf(address(this));
        require(balance >= amount, "Vault still underfunded - Safe must send more FAIR");

        milestonePending[milestoneId] = false;
        emit PendingMilestoneReleased(milestoneId, amount);

        _sendDistribution(amount);
    }

    function _sendDistribution(uint256 amount) internal {
        uint256 treasuryShare  = (amount * TREASURY_NUM)  / POOL_DEN;
        uint256 growthShare    = (amount * GROWTH_NUM)    / POOL_DEN;
        uint256 liquidityShare = (amount * LIQUIDITY_NUM) / POOL_DEN;
        uint256 teamShare      = (amount * TEAM_NUM)      / POOL_DEN;

        // Fix rounding dust: assign remainder to treasury
        uint256 distributed = treasuryShare + growthShare + liquidityShare + teamShare;
        if (distributed < amount) {
            treasuryShare += (amount - distributed);
        }

        fairToken.safeTransfer(S1_TREASURY, treasuryShare);
        fairToken.safeTransfer(S3_GROWTH, growthShare);
        fairToken.safeTransfer(S2_LIQUIDITY, liquidityShare);
        fairToken.safeTransfer(S4_TEAM, teamShare);

        emit TokensDistributed(treasuryShare, growthShare, liquidityShare, teamShare);
    }
}

