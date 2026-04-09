import { ethers } from 'ethers'
import { verifyVaultContract } from '../utils/contractVerification.js'
import { FAIR_VAULT_ABI, AERODROME_ORACLE_ABI, ERC20_ABI } from './contracts.js'

// Use imported ABIs from compiled artifacts
const VAULT_ABI = FAIR_VAULT_ABI
const ORACLE_ABI = AERODROME_ORACLE_ABI

/**
 * Get provider for Base mainnet
 */
function getProvider() {
  const rpcUrl = import.meta.env.VITE_BASE_RPC_URL || 
    import.meta.env.VITE_RPC_URL || 
    'https://mainnet.base.org'
  
  return new ethers.JsonRpcProvider(rpcUrl)
}

/**
 * Get vault contract instance
 */
function getVaultContract(vaultAddress, provider) {
  return new ethers.Contract(vaultAddress, VAULT_ABI, provider)
}

/**
 * Get oracle contract instance
 */
function getOracleContract(oracleAddress, provider) {
  return new ethers.Contract(oracleAddress, ORACLE_ABI, provider)
}

/**
 * Get FAIR token contract instance
 */
function getFairTokenContract(tokenAddress, provider) {
  return new ethers.Contract(tokenAddress, ERC20_ABI, provider)
}

/**
 * Fetch all milestone data from the vault
 */
export async function fetchMilestones(vaultAddress) {
  const provider = getProvider()
  
  // Verify contract is a valid FAIRVault
  const verification = await verifyVaultContract(vaultAddress, provider)
  if (!verification.valid) {
    throw new Error(verification.error || 'Invalid vault contract')
  }
  
  const vault = getVaultContract(vaultAddress, provider)
  
  try {
    // Get contract constants with error handling
    let TOTAL_MILESTONES, START_PRICE, PRICE_MULTIPLIER_NUM, PRICE_MULTIPLIER_DEN, REQUIRED_GOOD_PERIODS
    
    try {
      TOTAL_MILESTONES = Number(await vault.TOTAL_MILESTONES())
      START_PRICE = Number(await vault.START_PRICE())
      PRICE_MULTIPLIER_NUM = Number(await vault.PRICE_MULTIPLIER_NUM())
      PRICE_MULTIPLIER_DEN = Number(await vault.PRICE_MULTIPLIER_DEN())
      REQUIRED_GOOD_PERIODS = Number(await vault.REQUIRED_GOOD_PERIODS())
    } catch (error) {
      throw new Error(`Failed to read contract constants. The contract may not be a FAIRVault. Error: ${error.message}`)
    }
    
    // Get vault info with fallback
    let vaultInfo
    let milestoneUnlockAmount = 0
    
    try {
      vaultInfo = await vault.getVaultInfo()
      milestoneUnlockAmount = Number(vaultInfo.perMilestone)
    } catch (error) {
      console.warn('getVaultInfo() failed, using fallback:', error.message)
      // Try to get milestone unlock amount from a milestone that might exist
      try {
        // Check if milestone 1 exists and get its unlock amount
        // This is a workaround - we'll use a default if we can't get it
        milestoneUnlockAmount = 50000000 // Default 50M, will be updated if we can get real data
      } catch (e) {
        // Use default
        milestoneUnlockAmount = 50000000
      }
    }
    
    // Fetch MilestoneUnlocked events to get timestamp and TWAP price at unlock
    const unlockedEventMap = {}
    try {
      const filter = vault.filters.MilestoneUnlocked()
      const events = await vault.queryFilter(filter)
      await Promise.all(events.map(async (evt) => {
        const id = Number(evt.args.milestoneId)
        // Try event arg timestamp first; fall back to block timestamp
        let ts = Number(evt.args.timestamp || evt.args[2] || 0)
        if (!ts || ts === 0) {
          try {
            const block = await provider.getBlock(evt.blockNumber)
            ts = block?.timestamp || 0
          } catch (_) {}
        }
        unlockedEventMap[id] = {
          unlockTimestamp: ts > 0 ? ts * 1000 : null,
          unlockPrice: Number(evt.args.price || evt.args[1] || 0),
        }
      }))
    } catch (e) {
      console.warn('Could not fetch MilestoneUnlocked events:', e.message)
    }

    // Fetch all milestones
    const milestones = []
    let currentMilestone = null
    let nextMilestone = null

    for (let i = 1; i <= TOTAL_MILESTONES; i++) {
      try {
        const [status, pending] = await Promise.all([
          vault.getMilestoneStatus(i),
          vault.milestonePending(i).catch(() => false),
        ])

        const milestone = {
          id: i,
          unlocked: status.unlocked,
          pending: pending,
          goodPeriods: Number(status.goodPeriods),
          priceTarget: Number(status.priceTarget),
          currentPrice: Number(status.currentPrice),
          unlockAmount: milestoneUnlockAmount,
          requiredPeriods: REQUIRED_GOOD_PERIODS,
          unlockTimestamp: status.unlocked ? (unlockedEventMap[i]?.unlockTimestamp || null) : null,
          unlockPrice: status.unlocked ? (unlockedEventMap[i]?.unlockPrice ?? null) : null,
        }

        milestones.push(milestone)

        // Find current milestone (first NOT unlocked milestone)
        // This is the milestone we're currently working towards
        if (!currentMilestone && !milestone.unlocked) {
          currentMilestone = milestone
          // Next milestone is the one after current
          if (i < TOTAL_MILESTONES) {
            try {
              const [nextStatus, nextPending] = await Promise.all([
                vault.getMilestoneStatus(i + 1),
                vault.milestonePending(i + 1).catch(() => false),
              ])
              nextMilestone = {
                id: i + 1,
                unlocked: nextStatus.unlocked,
                pending: nextPending,
                goodPeriods: Number(nextStatus.goodPeriods),
                priceTarget: Number(nextStatus.priceTarget),
                currentPrice: Number(nextStatus.currentPrice),
                unlockAmount: milestoneUnlockAmount,
                requiredPeriods: REQUIRED_GOOD_PERIODS,
              }
            } catch (e) {
              const currentPriceTarget = milestone.priceTarget
              const nextPriceTarget = Math.floor((currentPriceTarget * PRICE_MULTIPLIER_NUM) / PRICE_MULTIPLIER_DEN)
              nextMilestone = {
                id: i + 1,
                unlocked: false,
                pending: false,
                goodPeriods: 0,
                priceTarget: nextPriceTarget,
                currentPrice: 0,
                unlockAmount: milestoneUnlockAmount,
                requiredPeriods: REQUIRED_GOOD_PERIODS,
              }
            }
          }
        }
      } catch (error) {
        let priceTarget = START_PRICE
        for (let j = 1; j < i; j++) {
          priceTarget = Math.floor((priceTarget * PRICE_MULTIPLIER_NUM) / PRICE_MULTIPLIER_DEN)
        }

        let unlocked = false
        let pending = false
        try {
          [unlocked, pending] = await Promise.all([
            vault.milestoneUnlocked(i).catch(() => false),
            vault.milestonePending(i).catch(() => false),
          ])
        } catch (e) {
          // Ignore
        }

        milestones.push({
          id: i,
          unlocked,
          pending,
          goodPeriods: 0,
          priceTarget,
          currentPrice: 0,
          unlockAmount: milestoneUnlockAmount,
          requiredPeriods: REQUIRED_GOOD_PERIODS,
          unlockTimestamp: unlocked ? (unlockedEventMap[i]?.unlockTimestamp || null) : null,
          unlockPrice: unlocked ? (unlockedEventMap[i]?.unlockPrice ?? null) : null,
        })
      }
    }
    
    return {
      milestones,
      currentMilestone,
      nextMilestone,
    }
  } catch (error) {
    console.error('Error fetching milestones:', error)
    throw error
  }
}

/**
 * Fetch vault statistics
 */
export async function fetchVaultStats(vaultAddress, fairTokenAddress) {
  const provider = getProvider()
  
  try {
    // Verify contract is a valid FAIRVault
    const verification = await verifyVaultContract(vaultAddress, provider)
    if (!verification.valid) {
      throw new Error(verification.error || 'Invalid vault contract')
    }
    
    const vault = getVaultContract(vaultAddress, provider)
    
    // Try to call getVaultInfo with better error handling
    let vaultInfo
    try {
      vaultInfo = await vault.getVaultInfo()
    } catch (error) {
      // If getVaultInfo fails, try individual calls
      console.warn('getVaultInfo() failed, trying individual calls:', error.message)
      
      // If getVaultInfo fails, try individual calls
      try {
        const [token, initialized, totalDeposited, milestoneUnlockAmount] = await Promise.all([
          vault.fairToken().catch(() => ethers.ZeroAddress),
          vault.initialized().catch(() => false),
          vault.totalDeposited().catch(() => 0n),
          vault.milestoneUnlockAmount().catch(() => 0n),
        ])
        
        // Get token balance using ERC20
        let tokenBalance = 0n
        if (token && token !== ethers.ZeroAddress) {
          try {
            const tokenContract = getFairTokenContract(token, provider)
            tokenBalance = await tokenContract.balanceOf(vaultAddress)
          } catch (e) {
            console.warn('Could not get token balance:', e.message)
          }
        }
        
        // Count unlocked milestones
        let milestonesUnlocked = 0
        try {
          for (let i = 1; i <= 18; i++) {
            const unlocked = await vault.milestoneUnlocked(i).catch(() => false)
            if (unlocked) milestonesUnlocked++
          }
        } catch (e) {
          console.warn('Could not count unlocked milestones:', e.message)
        }
        
        vaultInfo = {
          token,
          balance: tokenBalance,
          deposited: totalDeposited,
          perMilestone: milestoneUnlockAmount,
          milestonesUnlocked,
          isInitialized: initialized,
        }
      } catch (individualError) {
        throw new Error(`Failed to read vault data. The contract at ${vaultAddress} may not be a FAIRVault or may not be initialized. Original error: ${error.message}, Fallback error: ${individualError.message}`)
      }
    }
    const vaultBalance = Number(vaultInfo.balance) // Already from getVaultInfo
    const totalDeposited = Number(vaultInfo.deposited)
    
    // Try to get total supply (optional - may fail for some tokens)
    let totalSupply = null
    let totalUnlocked = null
    const tokenAddress = fairTokenAddress || vaultInfo.token
    
    if (tokenAddress && tokenAddress !== ethers.ZeroAddress) {
      try {
        const tokenCode = await provider.getCode(tokenAddress)
        if (tokenCode && tokenCode !== '0x') {
          const fairToken = getFairTokenContract(tokenAddress, provider)
          totalSupply = await fairToken.totalSupply()
          totalUnlocked = Number(totalSupply) - vaultBalance
        }
      } catch (error) {
        console.warn('Could not fetch total supply from token contract:', error.message)
        // Use deposited amount as fallback
        totalUnlocked = totalDeposited - vaultBalance
      }
    } else {
      // No token address, use deposited amount
      totalUnlocked = totalDeposited - vaultBalance
    }
    
    // Get current price from oracle
    let currentPrice = 0
    try {
      const oracleAddress = await vault.priceOracle()
      if (oracleAddress && oracleAddress !== ethers.ZeroAddress) {
        const oracleCode = await provider.getCode(oracleAddress)
        if (oracleCode && oracleCode !== '0x') {
          const oracle = getOracleContract(oracleAddress, provider)
          const price = await oracle.getPrice()
          currentPrice = Number(price)
        }
      }
    } catch (error) {
      console.warn('Could not fetch price from oracle:', error.message)
    }
    
    // Get current milestone to calculate good periods
    let goodPeriods = 0
    try {
      // Find first unlocked milestone
      for (let i = 1; i <= 18; i++) {
        const unlocked = await vault.milestoneUnlocked(i)
        if (!unlocked) {
          const status = await vault.getMilestoneStatus(i)
          goodPeriods = Number(status.goodPeriods)
          break
        }
      }
    } catch (error) {
      console.warn('Could not get good periods:', error.message)
    }
    
    // Check if vault is funded for the next milestone
    const perMilestone = Number(vaultInfo.perMilestone)
    const vaultFunded = perMilestone > 0 && vaultBalance >= perMilestone

    // Get cooldown info
    let lastUnlockTime = 0
    let waitRule = 0
    try {
      [lastUnlockTime, waitRule] = await Promise.all([
        vault.lastUnlockTime().then(Number),
        vault.WAIT_RULE().then(Number),
      ])
    } catch (e) {
      // Ignore
    }
    const cooldownEndsAt = lastUnlockTime > 0 ? (lastUnlockTime + waitRule) * 1000 : null

    return {
      totalLocked: vaultBalance,
      vaultBalance: vaultBalance,
      totalUnlocked: totalUnlocked || 0,
      totalSupply: totalSupply ? Number(totalSupply) : null,
      currentPrice: currentPrice, // Keep in oracle format (will convert in component)
      goodPeriods,
      vaultFunded,
      perMilestone,
      cooldownEndsAt,
    }
  } catch (error) {
    console.error('Error fetching vault stats:', error)
    throw error
  }
}

/**
 * Fetch contract configuration
 */
export async function fetchVaultConfig(vaultAddress) {
  const provider = getProvider()
  const vault = getVaultContract(vaultAddress, provider)
  
  try {
    const [WAIT_RULE, REQUIRED_GOOD_PERIODS, PERIOD_INTERVAL, START_PRICE] = await Promise.all([
      vault.WAIT_RULE(),
      vault.REQUIRED_GOOD_PERIODS(),
      vault.PERIOD_INTERVAL(),
      vault.START_PRICE(),
    ])
    
    return {
      waitRule: Number(WAIT_RULE),
      requiredGoodPeriods: Number(REQUIRED_GOOD_PERIODS),
      periodInterval: Number(PERIOD_INTERVAL),
      startPrice: Number(START_PRICE),
    }
  } catch (error) {
    console.error('Error fetching vault config:', error)
    throw error
  }
}

