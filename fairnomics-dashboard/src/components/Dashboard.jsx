import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { TrendingUp, Clock, Target, Lock, Shield, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'
import { useFairnomics } from '../contexts/FairnomicsContext'
import { formatTokenAmount } from '../utils/formatToken'
import MilestoneTimeline from './MilestoneTimeline'
import { ERC20_ABI } from '../services/contracts'

// Pool definitions — update safeAddress for each pool when known
// Ordered by allocation size (largest first)
const ALLOCATION_POOLS = [
  { label: 'Treasury',         pct: 85, tokens: '850M FAIR', color: 'from-blue-500 to-cyan-600',     safeAddress: null },
  { label: 'Reserve',          pct: 5,  tokens: '50M FAIR',  color: 'from-emerald-500 to-green-600', safeAddress: null },
  { label: 'Team',             pct: 5,  tokens: '50M FAIR',  color: 'from-purple-500 to-pink-600',   safeAddress: null },
  { label: 'Seed Liquidity',   pct: 3,  tokens: '30M FAIR',  color: 'from-indigo-500 to-purple-600', safeAddress: null },
  { label: 'LP & Buffer',      pct: 2,  tokens: '20M FAIR',  color: 'from-gray-500 to-gray-600',     safeAddress: null },
]

const TOTAL_SUPPLY = 1_000_000_000 // 1B FAIR

function useSafeBalances(pools, fairTokenAddress, rpcUrl) {
  const [balances, setBalances] = useState({})
  useEffect(() => {
    if (!fairTokenAddress || !rpcUrl) return
    const addressedPools = pools.filter(p => p.safeAddress)
    if (addressedPools.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl)
        const token = new ethers.Contract(fairTokenAddress, ERC20_ABI, provider)
        const results = await Promise.all(
          addressedPools.map(p => token.balanceOf(p.safeAddress).catch(() => 0n))
        )
        if (cancelled) return
        const map = {}
        addressedPools.forEach((p, i) => { map[p.label] = Number(results[i]) })
        setBalances(map)
      } catch (e) {
        console.warn('Could not fetch Safe balances:', e.message)
      }
    })()
    return () => { cancelled = true }
  }, [fairTokenAddress, rpcUrl])
  return balances
}

const formatDuration = (seconds) => {
  if (!seconds || seconds === 0) return 'No cooldown'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const months = Math.floor(days / 30)
  if (months >= 1) return `${months} Month${months !== 1 ? 's' : ''} Cooldown`
  if (days >= 1) return `${days} Day${days !== 1 ? 's' : ''} Cooldown`
  return `${hours} Hour${hours !== 1 ? 's' : ''} Cooldown`
}


const Dashboard = () => {
  const { currentMilestone, stats, milestones = [], config, loading, error } = useFairnomics()

  const requiredPeriods = config?.requiredGoodPeriods || currentMilestone?.requiredPeriods || 360

  const fairTokenAddress = import.meta.env.VITE_FAIR_TOKEN_ADDRESS || null
  const rpcUrl = import.meta.env.VITE_BASE_RPC_URL || import.meta.env.VITE_RPC_URL || 'https://mainnet.base.org'
  const safeBalances = useSafeBalances(ALLOCATION_POOLS, fairTokenAddress, rpcUrl)

  // Cooldown info
  const waitRuleSeconds = config?.waitRule || 0
  const cooldownLabel = formatDuration(waitRuleSeconds)

  // Format a duration in ms as "3h 29m" or "14d" or "45m"
  const formatHM = (ms) => {
    if (ms <= 0) return '0m'
    const totalMins = Math.floor(ms / 60000)
    const days = Math.floor(totalMins / 1440)
    if (days >= 1) return `${days}d ${Math.floor((totalMins % 1440) / 60)}h`
    const h = Math.floor(totalMins / 60)
    const m = totalMins % 60
    if (h === 0) return `${m}m`
    return `${h}h ${m}m`
  }

  // Total cooldown as a label e.g. "4h" or "90d"
  const cooldownTotalLabel = waitRuleSeconds > 0 ? formatHM(waitRuleSeconds * 1000) : null

  // Time elapsed since last unlock
  const elapsedMs = stats?.cooldownEndsAt && waitRuleSeconds > 0
    ? Math.max(0, Date.now() - (stats.cooldownEndsAt - waitRuleSeconds * 1000))
    : 0
  const elapsedLabel = elapsedMs > 0 ? formatHM(elapsedMs) : null

  // Supply info
  const maxSupply = stats?.totalSupply || TOTAL_SUPPLY
  const circulatingSupply = stats?.totalUnlocked || null

  // Vault funding status
  const pendingMilestones = milestones.filter(m => m.unlocked && m.pending)
  const hasPending = pendingMilestones.length > 0
  
  // Only show loading on initial load (no data yet)
  if (loading && !currentMilestone && milestones.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading data from blockchain...</p>
        </div>
      </div>
    )
  }
  
  if (error && !currentMilestone && milestones.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="card border-red-500/30 bg-red-500/5 max-w-md">
          <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Data</h2>
          <p className="text-sm text-gray-400 mb-4">{error}</p>
        </div>
      </div>
    )
  }

  // Stat card data — split values for green/white formatting
  const goodHours = stats?.daysAboveTarget || 0
  const nextTargetPrice = currentMilestone?.priceTarget
    ? (currentMilestone.priceTarget / 1_000_000).toFixed(4)
    : '—'
  const currentPriceDisplay = stats?.currentPrice
    ? stats.currentPrice.toFixed(4)
    : '—'

  const rules = [
    {
      icon: Target,
      title: '5% Max Unlock',
      description: 'Maximum 5% of supply per unlock',
      color: 'from-indigo-500 to-purple-600',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/20',
      textColor: 'text-indigo-400',
    },
    {
      icon: Clock,
      title: cooldownLabel,
      description: waitRuleSeconds > 0
        ? `Minimum ${cooldownLabel.toLowerCase().replace(' cooldown', '')} between unlock events`
        : 'No cooldown configured',
      color: 'from-purple-500 to-pink-600',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
      textColor: 'text-purple-400',
    },
    {
      icon: TrendingUp,
      title: 'Progressive Milestones (1.5x)',
      description: 'Each milestone requires higher sustained levels than the previous one',
      color: 'from-emerald-500 to-green-600',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      textColor: 'text-emerald-400',
    },
    {
      icon: Shield,
      title: `${requiredPeriods} Good Hours`,
      description: `Avg must be at or above milestone for ${requiredPeriods} hours`,
      color: 'from-blue-500 to-cyan-600',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      textColor: 'text-blue-400',
    },
  ]

  return (
    <div className="space-y-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8 space-y-2"
      >
        <img
          src="/fair-logo.png"
          alt="FAIR"
          className="mx-auto w-24 h-24 mb-4"
          onError={e => { e.target.style.display = 'none' }}
        />
        <p className="text-base text-white leading-relaxed">
          FAIR is the utility token of the{' '}
          <a href="https://fairmark.net" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2 hover:opacity-75">Fairmark Network</a>
          , a trust system for the AI age. FAIR is governed by <em>Fairnomics</em>, an open, transparent, rules-based tokenomics model for long-term builders.
        </p>
        <p className="text-base text-white leading-relaxed">
          Founded 2025 by award-winning artist/game developer{' '}
          <a href="https://benvu.com" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2 hover:opacity-75">Ben Vu</a>
          {' '}(<em>Coraline/Battle Bears</em>)<br />
          🏆 Coinbase x World x402 Hackathon Winner (
          <a href="https://faircam.io" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2 hover:opacity-75">FairCam</a>
          )
        </p>
        <p className="text-base text-white leading-relaxed">
          Built on Coinbase Base:{' '}
          <a
            href="https://basescan.org/token/0xbC780134E48b2DFa8eDAC84E7bbe38e5af9DBc9C"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline underline-offset-2 hover:opacity-75 font-mono text-sm"
          >
            0xbC780134E48b2DFa8eDAC84E7bbe38e5af9DBc9C
          </a>
          <br />
          Circulating:{' '}
          {circulatingSupply
            ? `${formatTokenAmount(circulatingSupply)} (${((circulatingSupply / maxSupply) * 100).toFixed(0)}%)`
            : '—'
          }
          {'  ·  '}
          Max Supply: {formatTokenAmount(maxSupply)}
        </p>
      </motion.div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CURRENT USDC/FAIR */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
          className="stat-card border border-emerald-500/20 group"
        >
          <div className="p-2 rounded-lg bg-emerald-500/10 w-fit mb-4">
            <TrendingUp className="text-emerald-400" size={20} />
          </div>
          <p className="text-gray-500 text-xs font-medium mb-1 uppercase tracking-wider">Current USDC/FAIR TWAP (1hr)</p>
          <p className="text-2xl font-bold text-emerald-400">{currentPriceDisplay}</p>
        </motion.div>

        {/* NEXT MILESTONE */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="stat-card border border-indigo-500/20 group"
        >
          <div className="p-2 rounded-lg bg-indigo-500/10 w-fit mb-4">
            <Target className="text-indigo-400" size={20} />
          </div>
          <p className="text-gray-500 text-xs font-medium mb-1 uppercase tracking-wider">Next Milestone</p>
          <p className="text-2xl font-bold text-white">{nextTargetPrice}</p>
        </motion.div>

        {/* GOOD HOURS ABOVE MILESTONE */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="stat-card border border-blue-500/20 group"
        >
          <div className="p-2 rounded-lg bg-blue-500/10 w-fit mb-4">
            <Clock className="text-blue-400" size={20} />
          </div>
          <p className="text-gray-500 text-xs font-medium mb-1 uppercase tracking-wider">Good Hours Above Milestone</p>
          <p className="text-2xl font-bold">
            <span className="text-emerald-400">{goodHours}</span>
            <span className="text-white"> / {requiredPeriods} Hours</span>
          </p>
        </motion.div>

        {/* COOLDOWN SINCE LAST UNLOCK */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="stat-card border border-purple-500/20 group"
        >
          <div className="p-2 rounded-lg bg-purple-500/10 w-fit mb-4">
            <Lock className="text-purple-400" size={20} />
          </div>
          <p className="text-gray-500 text-xs font-medium mb-1 uppercase tracking-wider">Cooldown Since Last Unlock</p>
          <p className="text-2xl font-bold">
            {elapsedLabel && cooldownTotalLabel ? (
              <>
                <span className="text-emerald-400">{elapsedLabel}</span>
                <span className="text-white"> / {cooldownTotalLabel}</span>
              </>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </p>
        </motion.div>
      </div>

      {/* Vault Status Banners */}
      {hasPending && (
        <div className="space-y-3">
          {hasPending && !stats?.vaultFunded && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border-amber-500/30 bg-amber-500/5 flex items-start gap-3"
            >
              <AlertCircle className="text-amber-400 flex-shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-semibold text-amber-300 mb-0.5">
                  {pendingMilestones.length} Milestone{pendingMilestones.length !== 1 ? 's' : ''} Awaiting Distribution
                </p>
                <p className="text-xs text-amber-400/80">
                  Milestone{pendingMilestones.length !== 1 ? 's' : ''} #{pendingMilestones.map(m => m.id).join(', #')} earned but vault underfunded. Treasury Safe must send FAIR tokens to the vault.
                </p>
              </div>
            </motion.div>
          )}
          {hasPending && stats?.vaultFunded && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border-emerald-500/30 bg-emerald-500/5 flex items-start gap-3"
            >
              <CheckCircle className="text-emerald-400 flex-shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-semibold text-emerald-300 mb-0.5">
                  Vault funded — pending distribution ready
                </p>
                <p className="text-xs text-emerald-400/80">
                  Keeper will call releasePending() shortly to distribute milestone #{pendingMilestones.map(m => m.id).join(', #')}.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Unlock Rules */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Unlock Rules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule, index) => {
            const Icon = rule.icon
            return (
              <motion.div
                key={rule.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`card border ${rule.borderColor}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${rule.bgColor} flex-shrink-0`}>
                    <Icon className={rule.textColor} size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2">{rule.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{rule.description}</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
        
        {/* Trustless & Transparent Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card border border-indigo-500/30 bg-indigo-500/5 mt-4"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-indigo-500/20 flex-shrink-0">
              <Shield className="text-indigo-400" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Trustless & Transparent</h3>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Token Allocation */}
      <div>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-2xl font-bold text-white">Token Allocation</h2>
        </div>
        {stats?.totalLocked > 0 && (
          <p className="text-sm text-gray-400 mb-6">
            {formatTokenAmount(stats.totalLocked)} FAIR currently locked in vault
          </p>
        )}
        <div className="card">
          <div className="space-y-5">
            {ALLOCATION_POOLS.map((pool, index) => {
              const safeBalance = safeBalances[pool.label]
              const hasSafe = !!pool.safeAddress
              return (
                <motion.div
                  key={pool.label}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {hasSafe ? (
                        <a
                          href={`https://basescan.org/address/${pool.safeAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                        >
                          {pool.label}
                          <ExternalLink size={11} className="opacity-60" />
                        </a>
                      ) : (
                        <span className="text-sm font-medium text-gray-300">{pool.label}</span>
                      )}
                      {safeBalance !== undefined && (
                        <span className="text-xs text-gray-500 ml-1">
                          ({formatTokenAmount(safeBalance)} in Safe)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{pool.pct}%</span>
                      <span className="text-sm font-semibold text-white">{pool.tokens}</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pool.pct}%` }}
                      transition={{ duration: 0.8, delay: index * 0.1 }}
                      className={`h-full bg-gradient-to-r ${pool.color} rounded-full`}
                    />
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Milestone Timeline */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Milestone Timeline</h2>
        <MilestoneTimeline />
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="pt-8 pb-4 border-t border-gray-800 text-center space-y-5"
      >
        <p className="text-xl font-semibold text-white">Stay FAIR.</p>
        <img
          src="https://fairmark.net/wp-content/uploads/2026/04/Earth_Artemis2_photo.png"
          alt="Earth from space"
          className="mx-auto w-20 h-20 rounded-full object-cover opacity-80"
        />
        <p className="text-xs text-gray-500 leading-relaxed max-w-2xl mx-auto">
          Fairnomics is an open, rules-based tokenomics framework. FAIR is a utility token designed for use within the Fairmark Network and its applications. This site is for informational purposes only and does not constitute financial advice, investment advice, or an offer or solicitation to buy or sell any asset.
        </p>
      </motion.div>
    </div>
  )
}

export default Dashboard
