// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPriceOracle {
    function getPrice() external view returns (uint256);
}

/**
 * @title FAIR Token - Testnet Version
 * @notice Same as production but with shorter timings for testing
 * @dev 10 minute cooldown, 10 good minutes (not hours), for faster testing
 * 
 * Tokenomics (same as production - 10B):
 * - Total Supply: 10,000,000,000 FAIR
 * - Milestone Unlock: 500,000,000 FAIR each (5% of total)
 */
contract FAIRTestnet is ERC20, Ownable {
    // -----------------------------
    // TOKENOMICS CONFIG (10B - same as production)
    // -----------------------------

    uint256 public constant TOTAL_SUPPLY = 10_000_000_000 ether; // 10B with 18 decimals

    // TESTNET Wait Rule: 10 minutes (for testing)
    uint256 public constant WAIT_RULE = 10 minutes; // 600 seconds

    // PRICE RULE multiplier (1.5x)
    uint256 public constant PRICE_MULTIPLIER_NUM = 15;
    uint256 public constant PRICE_MULTIPLIER_DEN = 10;

    // TESTNET: 10 good periods (not 360 hours)
    uint256 public constant REQUIRED_GOOD_PERIODS = 10;
    
    // Minimum seconds between good period increments (1 minute for testing)
    uint256 public constant PERIOD_INTERVAL = 1 minutes;

    // Pool wallet addresses (set at deployment)
    address public immutable S1_TREASURY;
    address public immutable S2_LIQUIDITY;
    address public immutable S3_GROWTH;
    address public immutable S4_TEAM;

    // Per-milestone unlock amount (5% of 10B = 500M each)
    uint256 public constant MILESTONE_UNLOCK_AMOUNT = 500_000_000 ether; // 500M each

    // Pool ratios (same as production)
    uint256 public constant TREASURY_NUM  = 5000;  // 55.56%
    uint256 public constant GROWTH_NUM    = 2000;  // 22.22%
    uint256 public constant LIQUIDITY_NUM = 1000;  // 11.11%
    uint256 public constant TEAM_NUM      = 1000;  // 11.11%
    uint256 public constant POOL_DEN      = 9000;  // Total

    // Start price: $0.000010 (10 in 1e9 units)
    uint256 public constant START_PRICE = 10;

    // -----------------------------
    // STATE
    // -----------------------------

    IPriceOracle public priceOracle;

    uint256 public lastUnlockTime;
    uint256 public lastUnlockPrice;

    mapping(uint256 => bool) public milestoneUnlocked;
    mapping(uint256 => uint256) public milestoneGoodPeriods;
    mapping(uint256 => uint256) public milestoneLastGoodPeriodTimestamp;
    mapping(uint256 => uint256) public milestonePriceTarget;

    uint256 public immutable tgeTimestamp;

    // -----------------------------
    // EVENTS
    // -----------------------------

    event MilestoneUnlocked(
        uint256 indexed milestoneId,
        uint256 price,
        uint256 timestamp
    );

    event GoodPeriodRecorded(
        uint256 indexed milestoneId,
        uint256 goodPeriods,
        uint256 price,
        uint256 timestamp
    );

    // -----------------------------
    // CONSTRUCTOR
    // -----------------------------

    constructor(
        address ownerAddress,
        address treasury,
        address liquidity,
        address growth,
        address team,
        uint256 _tgeTimestamp
    ) 
        ERC20("FAIR-Testnet", "tFAIR")
        Ownable(ownerAddress)
    {
        require(treasury != address(0), "Treasury zero");
        require(liquidity != address(0), "Liquidity zero");
        require(growth != address(0), "Growth zero");
        require(team != address(0), "Team zero");

        S1_TREASURY = treasury;
        S2_LIQUIDITY = liquidity;
        S3_GROWTH = growth;
        S4_TEAM = team;
        tgeTimestamp = _tgeTimestamp > 0 ? _tgeTimestamp : block.timestamp;

        // Mint to CONTRACT (not owner) - contract holds locked tokens
        _mint(address(this), TOTAL_SUPPLY);

        lastUnlockTime = tgeTimestamp;
        lastUnlockPrice = START_PRICE;

        // Calculate price ladder
        uint256 price = START_PRICE;
        for (uint256 i = 1; i <= 18; i++) {
            milestonePriceTarget[i] = price;
            price = (price * PRICE_MULTIPLIER_NUM) / PRICE_MULTIPLIER_DEN;
        }
    }

    // -----------------------------
    // ADMIN
    // -----------------------------

    function setOracle(address oracle) external onlyOwner {
        require(oracle != address(0), "Oracle zero");
        priceOracle = IPriceOracle(oracle);
    }

    // -----------------------------
    // VIEW FUNCTIONS
    // -----------------------------

    function canUnlockMilestone(uint256 milestoneId) external view returns (bool canUnlock, string memory reason) {
        if (milestoneId < 1 || milestoneId > 18) {
            return (false, "Invalid milestone ID");
        }
        if (milestoneUnlocked[milestoneId]) {
            return (false, "Already unlocked");
        }
        if (address(priceOracle) == address(0)) {
            return (false, "Oracle not set");
        }
        if (block.timestamp < lastUnlockTime + WAIT_RULE) {
            return (false, "Cooldown not elapsed (10 min)");
        }
        
        uint256 price = priceOracle.getPrice();
        uint256 targetPrice = milestonePriceTarget[milestoneId];
        if (price < targetPrice) {
            return (false, "Price below target");
        }
        if (milestoneGoodPeriods[milestoneId] < REQUIRED_GOOD_PERIODS) {
            return (false, "Good periods not reached (10 required)");
        }
        
        return (true, "Ready to unlock");
    }

    function getMilestoneStatus(uint256 milestoneId) external view returns (
        bool unlocked,
        uint256 goodPeriods,
        uint256 priceTarget,
        uint256 currentPrice
    ) {
        unlocked = milestoneUnlocked[milestoneId];
        goodPeriods = milestoneGoodPeriods[milestoneId];
        priceTarget = milestonePriceTarget[milestoneId];
        currentPrice = address(priceOracle) != address(0) ? priceOracle.getPrice() : 0;
    }

    // -----------------------------
    // KEEPER FUNCTIONS
    // -----------------------------

    function processMilestonePeriod(uint256 milestoneId) external {
        require(milestoneId >= 1 && milestoneId <= 18, "Invalid milestone");
        require(!milestoneUnlocked[milestoneId], "Already unlocked");
        require(address(priceOracle) != address(0), "Oracle not set");

        uint256 price = priceOracle.getPrice();
        uint256 targetPrice = milestonePriceTarget[milestoneId];

        if (price < targetPrice) {
            return;
        }

        uint256 lastGoodPeriod = milestoneLastGoodPeriodTimestamp[milestoneId];
        if (block.timestamp < lastGoodPeriod + PERIOD_INTERVAL) {
            return;
        }

        milestoneGoodPeriods[milestoneId]++;
        milestoneLastGoodPeriodTimestamp[milestoneId] = block.timestamp;

        emit GoodPeriodRecorded(
            milestoneId,
            milestoneGoodPeriods[milestoneId],
            price,
            block.timestamp
        );
    }

    function finalizeMilestone(uint256 milestoneId) external {
        require(milestoneId >= 1 && milestoneId <= 18, "Invalid milestone");
        require(!milestoneUnlocked[milestoneId], "Already unlocked");
        require(address(priceOracle) != address(0), "Oracle not set");

        require(
            block.timestamp >= lastUnlockTime + WAIT_RULE,
            "Cooldown not elapsed"
        );

        uint256 price = priceOracle.getPrice();
        uint256 targetPrice = milestonePriceTarget[milestoneId];
        require(price >= targetPrice, "Price below target");

        require(
            milestoneGoodPeriods[milestoneId] >= REQUIRED_GOOD_PERIODS,
            "Good periods not reached"
        );

        milestoneUnlocked[milestoneId] = true;
        lastUnlockTime = block.timestamp;
        lastUnlockPrice = price;

        _distributeUnlock();

        emit MilestoneUnlocked(milestoneId, price, block.timestamp);
    }

    function tryUnlock(uint256 milestoneId) external {
        require(milestoneId >= 1 && milestoneId <= 18, "Invalid milestone");
        require(!milestoneUnlocked[milestoneId], "Already unlocked");
        require(address(priceOracle) != address(0), "Oracle not set");

        uint256 price = priceOracle.getPrice();
        uint256 targetPrice = milestonePriceTarget[milestoneId];

        // Record good period if conditions met
        if (price >= targetPrice) {
            uint256 lastGoodPeriod = milestoneLastGoodPeriodTimestamp[milestoneId];
            if (block.timestamp >= lastGoodPeriod + PERIOD_INTERVAL) {
                milestoneGoodPeriods[milestoneId]++;
                milestoneLastGoodPeriodTimestamp[milestoneId] = block.timestamp;
                
                emit GoodPeriodRecorded(
                    milestoneId,
                    milestoneGoodPeriods[milestoneId],
                    price,
                    block.timestamp
                );
            }
        }

        // Check if can finalize
        if (block.timestamp < lastUnlockTime + WAIT_RULE) {
            return;
        }
        if (price < targetPrice) {
            return;
        }
        if (milestoneGoodPeriods[milestoneId] < REQUIRED_GOOD_PERIODS) {
            return;
        }

        // Finalize
        milestoneUnlocked[milestoneId] = true;
        lastUnlockTime = block.timestamp;
        lastUnlockPrice = price;

        _distributeUnlock();

        emit MilestoneUnlocked(milestoneId, price, block.timestamp);
    }

    // -----------------------------
    // INTERNAL DISTRIBUTION
    // -----------------------------

    function _distributeUnlock() internal {
        uint256 amount = MILESTONE_UNLOCK_AMOUNT;

        uint256 treasuryShare  = (amount * TREASURY_NUM)  / POOL_DEN;
        uint256 growthShare    = (amount * GROWTH_NUM)    / POOL_DEN;
        uint256 liquidityShare = (amount * LIQUIDITY_NUM) / POOL_DEN;
        uint256 teamShare      = (amount * TEAM_NUM)      / POOL_DEN;

        uint256 distributed = treasuryShare + growthShare + liquidityShare + teamShare;
        if (distributed < amount) {
            uint256 dust = amount - distributed;
            treasuryShare += dust;
        }

        // Transfer from CONTRACT's balance (not owner)
        _transfer(address(this), S1_TREASURY,  treasuryShare);
        _transfer(address(this), S3_GROWTH,    growthShare);
        _transfer(address(this), S2_LIQUIDITY, liquidityShare);
        _transfer(address(this), S4_TEAM,      teamShare);
    }
}

