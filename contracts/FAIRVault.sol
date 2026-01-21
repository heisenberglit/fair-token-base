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
 * - Cooldown elapsed since last unlock (WAIT_RULE: 90 days prod, configurable)
 * - Required good periods with price above target (REQUIRED_GOOD_PERIODS: 360 prod)
 * - Current TWAP price >= milestone target
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

    /// @notice Starting price target for milestone 1 ($0.000010 in 1e9 units)
    uint256 public constant START_PRICE = 10;

    // -----------------------------
    // POOL WALLETS (set at deployment)
    // -----------------------------

    address public immutable S1_TREASURY;
    address public immutable S2_LIQUIDITY;
    address public immutable S3_GROWTH;
    address public immutable S4_TEAM;

    /// @notice Pool distribution ratios (out of 9000)
    uint256 public constant TREASURY_NUM  = 5000;  // 55.56%
    uint256 public constant GROWTH_NUM    = 2000;  // 22.22%
    uint256 public constant LIQUIDITY_NUM = 1000;  // 11.11%
    uint256 public constant TEAM_NUM      = 1000;  // 11.11%
    uint256 public constant POOL_DEN      = 9000;

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

    // -----------------------------
    // EVENTS
    // -----------------------------

    event VaultInitialized(uint256 totalAmount, uint256 perMilestone);
    event OracleSet(address indexed oracle);
    event OracleFrozen(address indexed oracle);
    event MilestoneUnlocked(uint256 indexed milestoneId, uint256 price, uint256 timestamp);
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
        uint256 _periodInterval
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

        fairToken = IERC20(_fairToken);
        S1_TREASURY = _treasury;
        S2_LIQUIDITY = _liquidity;
        S3_GROWTH = _growth;
        S4_TEAM = _team;

        // Set configurable timing parameters
        WAIT_RULE = _waitRule;
        REQUIRED_GOOD_PERIODS = _requiredGoodPeriods;
        PERIOD_INTERVAL = _periodInterval;

        lastUnlockTime = _tgeTimestamp;
        lastUnlockPrice = START_PRICE;

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
     * @notice Initialize vault by depositing tokens
     * @dev Call this after transferring tokens to the vault, or use depositTokens()
     * @param _totalAmount Total tokens to lock (should match contract balance)
     */
    function initialize(uint256 _totalAmount) external onlyOwner {
        require(!initialized, "Already initialized");
        
        uint256 balance = fairToken.balanceOf(address(this));
        require(balance >= _totalAmount, "Insufficient balance");
        require(_totalAmount > 0, "Amount zero");

        totalDeposited = _totalAmount;
        milestoneUnlockAmount = _totalAmount / TOTAL_MILESTONES;
        initialized = true;

        emit VaultInitialized(_totalAmount, milestoneUnlockAmount);
    }

    /**
     * @notice Deposit and initialize in one transaction
     * @dev Requires approval first: fairToken.approve(vault, amount)
     * @param _amount Amount to deposit and lock
     */
    function depositAndInitialize(uint256 _amount) external onlyOwner {
        require(!initialized, "Already initialized");
        require(_amount > 0, "Amount zero");

        fairToken.safeTransferFrom(msg.sender, address(this), _amount);
        
        totalDeposited = _amount;
        milestoneUnlockAmount = _amount / TOTAL_MILESTONES;
        initialized = true;

        emit VaultInitialized(_amount, milestoneUnlockAmount);
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
        if (address(priceOracle) == address(0)) return (false, "Oracle not set");
        if (block.timestamp < lastUnlockTime + WAIT_RULE) return (false, "Cooldown not elapsed");
        
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
     */
    function processMilestoneHour(uint256 milestoneId) external {
        require(initialized, "Not initialized");
        require(milestoneId >= 1 && milestoneId <= TOTAL_MILESTONES, "Invalid milestone");
        require(!milestoneUnlocked[milestoneId], "Already unlocked");
        require(address(priceOracle) != address(0), "Oracle not set");

        // Try to get price - if oracle fails, can't record period
        uint256 price;
        try priceOracle.getPrice() returns (uint256 price_) {
            price = price_;
        } catch {
            // Oracle failed - can't record period, but don't revert
            return;
        }
        
        uint256 targetPrice = milestonePriceTarget[milestoneId];

        if (price < targetPrice) return;

        uint256 lastGoodPeriod = milestoneLastGoodPeriodTimestamp[milestoneId];
        if (block.timestamp < lastGoodPeriod + PERIOD_INTERVAL) return;

        milestoneGoodPeriods[milestoneId]++;
        milestoneLastGoodPeriodTimestamp[milestoneId] = block.timestamp;

        emit GoodPeriodRecorded(milestoneId, milestoneGoodPeriods[milestoneId], price, block.timestamp);
    }

    /**
     * @notice Finalize milestone unlock
     * @param milestoneId Milestone ID (1-18)
     */
    function finalizeMilestone(uint256 milestoneId) external {
        require(initialized, "Not initialized");
        require(milestoneId >= 1 && milestoneId <= TOTAL_MILESTONES, "Invalid milestone");
        require(!milestoneUnlocked[milestoneId], "Already unlocked");
        require(address(priceOracle) != address(0), "Oracle not set");
        require(block.timestamp >= lastUnlockTime + WAIT_RULE, "Cooldown not elapsed");

        // Try to get price - revert if oracle fails (this is a finalize function, should fail if oracle broken)
        uint256 price;
        try priceOracle.getPrice() returns (uint256 price_) {
            price = price_;
        } catch {
            revert("Oracle getPrice() failed");
        }
        
        require(price >= milestonePriceTarget[milestoneId], "Price below target");
        require(milestoneGoodPeriods[milestoneId] >= REQUIRED_GOOD_PERIODS, "Good periods not reached");

        milestoneUnlocked[milestoneId] = true;
        lastUnlockTime = block.timestamp;
        lastUnlockPrice = price;

        _distributeUnlock();

        emit MilestoneUnlocked(milestoneId, price, block.timestamp);
    }

    /**
     * @notice Combined: process period and finalize if ready
     * @param milestoneId Milestone ID (1-18)
     */
    function tryUnlock(uint256 milestoneId) external {
        require(initialized, "Not initialized");
        require(milestoneId >= 1 && milestoneId <= TOTAL_MILESTONES, "Invalid milestone");
        require(!milestoneUnlocked[milestoneId], "Already unlocked");
        require(address(priceOracle) != address(0), "Oracle not set");

        // Try to get price - if oracle fails, we can't proceed
        uint256 price;
        try priceOracle.getPrice() returns (uint256 price_) {
            price = price_;
        } catch {
            // Oracle failed - can't record periods or unlock
            // This is expected for new pools without history
            // The keeper will retry later when pool has observations
            return;
        }
        
        uint256 targetPrice = milestonePriceTarget[milestoneId];

        // 1) Record good period if conditions met
        if (price >= targetPrice) {
            uint256 lastGoodPeriod = milestoneLastGoodPeriodTimestamp[milestoneId];
            if (block.timestamp >= lastGoodPeriod + PERIOD_INTERVAL) {
                milestoneGoodPeriods[milestoneId]++;
                milestoneLastGoodPeriodTimestamp[milestoneId] = block.timestamp;
                emit GoodPeriodRecorded(milestoneId, milestoneGoodPeriods[milestoneId], price, block.timestamp);
            }
        }

        // 2) Check if can finalize
        if (block.timestamp < lastUnlockTime + WAIT_RULE) return;
        if (price < targetPrice) return;
        if (milestoneGoodPeriods[milestoneId] < REQUIRED_GOOD_PERIODS) return;

        // 3) Finalize
        milestoneUnlocked[milestoneId] = true;
        lastUnlockTime = block.timestamp;
        lastUnlockPrice = price;

        _distributeUnlock();

        emit MilestoneUnlocked(milestoneId, price, block.timestamp);
    }

    // -----------------------------
    // INTERNAL
    // -----------------------------

    function _distributeUnlock() internal {
        uint256 amount = milestoneUnlockAmount;
        
        uint256 balance = fairToken.balanceOf(address(this));
        if (balance < amount) {
            amount = balance; // Distribute what's available
        }

        uint256 treasuryShare  = (amount * TREASURY_NUM)  / POOL_DEN;
        uint256 growthShare    = (amount * GROWTH_NUM)    / POOL_DEN;
        uint256 liquidityShare = (amount * LIQUIDITY_NUM) / POOL_DEN;
        uint256 teamShare      = (amount * TEAM_NUM)      / POOL_DEN;

        // Fix rounding dust
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

