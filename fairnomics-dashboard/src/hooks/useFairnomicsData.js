import { useState, useEffect } from 'react'
import { fetchMilestones, fetchVaultStats, fetchVaultConfig } from '../services/blockchain'

export const useFairnomicsData = () => {
  const [data, setData] = useState({
    currentPrice: 0,
    currentMilestone: null,
    nextMilestone: null,
    milestones: [],
    stats: {
      totalLocked: 0,
      totalUnlocked: 0,
      daysAboveTarget: 0,
      currentPrice: 0,
    },
    config: {
      requiredGoodPeriods: 2, // Default fallback
      waitRule: 0,
      periodInterval: 0,
      startPrice: 0,
    },
    loading: true, // Only true on initial load
    refreshing: false, // True when refreshing in background
    error: null,
    lastUpdated: null,
  })

  useEffect(() => {
    let isMounted = true
    let initialLoad = true
    
    const loadData = async () => {
      try {
        // Only set loading=true on initial load, use refreshing=true for updates
        if (initialLoad) {
          setData(prev => ({ ...prev, loading: true, error: null }))
        } else {
          setData(prev => ({ ...prev, refreshing: true, error: null }))
        }
        
        // Get addresses from environment variables
        const vaultAddress = import.meta.env.VITE_VAULT_ADDRESS || null
        const fairTokenAddress = import.meta.env.VITE_FAIR_TOKEN_ADDRESS || null
        
        if (!vaultAddress) {
          throw new Error('Vault address not configured. Set VITE_VAULT_ADDRESS in your .env file.')
        }
        
        // Validate address format (basic check)
        if (!vaultAddress.startsWith('0x') || vaultAddress.length !== 42) {
          throw new Error(`Invalid vault address format: ${vaultAddress}. Please check VITE_VAULT_ADDRESS in your .env file.`)
        }
        
        // Fetch all data in parallel
        const [milestonesData, stats, config] = await Promise.all([
          fetchMilestones(vaultAddress),
          fetchVaultStats(vaultAddress, fairTokenAddress),
          fetchVaultConfig(vaultAddress).catch(() => null), // Optional
        ])
        
        if (!isMounted) return
        
        // Get current price from stats or from current milestone
        const priceFromStats = stats.currentPrice || 0
        const priceFromMilestone = milestonesData.currentMilestone?.currentPrice || 0
        const finalPrice = priceFromStats > 0 ? priceFromStats : priceFromMilestone
        
        setData({
          currentPrice: finalPrice / 1_000_000, // Convert from oracle format to USD
          currentMilestone: milestonesData.currentMilestone,
          nextMilestone: milestonesData.nextMilestone,
          milestones: milestonesData.milestones,
          stats: {
            ...stats,
            currentPrice: finalPrice / 1_000_000, // Convert to USD
            daysAboveTarget: stats.goodPeriods || 0, // Use goodPeriods as daysAboveTarget
          },
          config: config || {
            requiredGoodPeriods: milestonesData.currentMilestone?.requiredPeriods || 2,
            waitRule: 0,
            periodInterval: 0,
            startPrice: 0,
          },
          loading: false,
          refreshing: false,
          error: null,
          lastUpdated: new Date().toISOString(),
        })
        
        initialLoad = false
      } catch (error) {
        if (!isMounted) return
        
        console.error('Error loading Fairnomics data:', error)
        
        // Only set error if we don't have any data yet (initial load failed)
        // Use functional update to access current state
        setData(prev => {
          const hasData = prev.milestones.length > 0 || prev.currentMilestone !== null
          return {
            ...prev,
            loading: false,
            refreshing: false,
            // Only show error if no data exists, otherwise keep showing stale data
            error: hasData ? null : (error.message || 'Failed to load data from blockchain'),
          }
        })
        
        initialLoad = false
      }
    }
    
    loadData()
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      if (isMounted) {
        loadData()
      }
    }, 30000)
    
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, []) // Empty deps - only run on mount

  return data
}
