import { motion } from 'framer-motion'
import { TrendingUp, Clock, Target, Lock, Shield, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'
import { useFairnomics } from '../contexts/FairnomicsContext'
import { formatTokenAmount } from '../utils/formatToken'
import MilestoneTimeline from './MilestoneTimeline'

const formatDuration = (seconds) => {
  if (!seconds || seconds === 0) return 'No cooldown'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const months = Math.floor(days / 30)
  if (months >= 1) return `${months} Month${months !== 1 ? 's' : ''} Cooldown`
  if (days >= 1) return `${days} Day${days !== 1 ? 's' : ''} Cooldown`
  return `${hours} Hour${hours !== 1 ? 's' : ''} Cooldown`
}

const formatCooldownRemaining = (cooldownEndsAt) => {
  if (!cooldownEndsAt) return null
  const now = Date.now()
  const remaining = cooldownEndsAt - now
  if (remaining <= 0) return null
  const hours = Math.floor(remaining / 3600000)
  const minutes = Math.floor((remaining % 3600000) / 60000)
  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h remaining`
  }
  return `${hours}h ${minutes}m remaining`
}

const Dashboard = () => {
  const { currentMilestone, nextMilestone, stats, milestones = [], config, loading, refreshing, error, lastUpdated } = useFairnomics()

  // Get required periods from config or milestone
  const requiredPeriods = config?.requiredGoodPeriods || currentMilestone?.requiredPeriods || 2

  // Get vault address from env
  const vaultAddress = import.meta.env.VITE_VAULT_ADDRESS || '0x...'
  // Cooldown info
  const waitRuleSeconds = config?.waitRule || 0
  const cooldownLabel = formatDuration(waitRuleSeconds)
  const cooldownRemaining = formatCooldownRemaining(stats?.cooldownEndsAt)

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

  const statCards = [
    {
      label: 'Current Price',
      value: `$${stats?.currentPrice?.toFixed(6) || '0.000000'}`,
      icon: TrendingUp,
      color: 'from-emerald-500 to-green-600',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      textColor: 'text-emerald-400',
    },
    {
      label: 'Current Target',
      value: `$${currentMilestone?.priceTarget ? (currentMilestone.priceTarget / 1_000_000).toFixed(6) : '0.000000'}`,
      icon: Target,
      color: 'from-indigo-500 to-purple-600',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/20',
      textColor: 'text-indigo-400',
    },
    {
      label: 'Good Hours',
      value: `${stats?.daysAboveTarget || 0}/${requiredPeriods}`,
      icon: Clock,
      color: 'from-blue-500 to-cyan-600',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      textColor: 'text-blue-400',
    },
    {
      label: 'Total Locked',
      value: formatTokenAmount(stats?.totalLocked || 0),
      icon: Lock,
      color: 'from-gray-500 to-gray-600',
      bgColor: 'bg-gray-500/10',
      borderColor: 'border-gray-500/20',
      textColor: 'text-gray-400',
    },
  ]

  const rules = [
    {
      icon: Target,
      title: '5% Max Unlock',
      description: 'Maximum 50M FAIR (5% of supply) unlocks at each milestone',
      color: 'from-indigo-500 to-purple-600',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/20',
      textColor: 'text-indigo-400',
    },
    {
      icon: Clock,
      title: cooldownLabel,
      description: waitRuleSeconds > 0
        ? `Minimum ${cooldownLabel.toLowerCase().replace(' cooldown', '')} between unlock events (${waitRuleSeconds.toLocaleString()}s on-chain)`
        : 'No cooldown configured',
      color: 'from-purple-500 to-pink-600',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
      textColor: 'text-purple-400',
    },
    {
      icon: TrendingUp,
      title: '1.5× Price Multiplier',
      description: 'Each milestone requires price to be 1.5× the previous target',
      color: 'from-emerald-500 to-green-600',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      textColor: 'text-emerald-400',
    },
    {
      icon: Shield,
      title: `${requiredPeriods} Period Sustain`,
      description: `Price must stay above target for ${requiredPeriods} consecutive periods`,
      color: 'from-blue-500 to-cyan-600',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      textColor: 'text-blue-400',
    },
  ]

  const allocations = [
    { label: 'Seed Sale', amount: '10%', value: '100M FAIR', color: 'from-indigo-500 to-purple-600' },
    { label: 'Team Pool', amount: '10%', value: '100M FAIR', color: 'from-purple-500 to-pink-600' },
    { label: 'Growth / Memetics', amount: '20%', value: '200M FAIR', color: 'from-emerald-500 to-green-600' },
    { label: 'Community Reserve', amount: '50%', value: '500M FAIR', color: 'from-blue-500 to-cyan-600' },
    { label: 'LP & Buffer', amount: '10%', value: '100M FAIR', color: 'from-gray-500 to-gray-600' },
  ]

  return (
    <div className="space-y-12">
      {/* Fairnomics Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-5xl font-bold text-white mb-3">Fairnomics</h1>
        <p className="text-lg text-gray-400 mb-4">
          An open source transparent rules-based tokenomics system for long-term builders.
        </p>
        {vaultAddress && vaultAddress !== '0x...' && (
          <a
            href={`https://basescan.org/address/${vaultAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Base Contract: {vaultAddress.slice(0, 6)}...{vaultAddress.slice(-4)}
            <ExternalLink size={14} />
          </a>
        )}
      </motion.div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`stat-card border ${stat.borderColor} group`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={stat.textColor} size={20} />
                </div>
              </div>
              <p className="text-gray-500 text-xs font-medium mb-1 uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Vault Status Banners */}
      {(hasPending || cooldownRemaining) && (
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
          {cooldownRemaining && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border-purple-500/30 bg-purple-500/5 flex items-center gap-3"
            >
              <Clock className="text-purple-400 flex-shrink-0" size={18} />
              <p className="text-sm text-purple-300">
                Cooldown active — next unlock eligible in <span className="font-semibold">{cooldownRemaining}</span>
              </p>
            </motion.div>
          )}
        </div>
      )}

      {/* Current & Next Milestone */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Current Milestone</h2>
            {currentMilestone && (
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                currentMilestone.unlocked 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              }`}>
                {currentMilestone.unlocked ? 'Unlocked' : 'In Progress'}
              </span>
            )}
          </div>
          {currentMilestone ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                <span className="text-gray-500 text-sm">Milestone</span>
                <span className="text-white font-semibold">#{currentMilestone.id}</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Price Target</span>
                  <span className="text-white font-semibold">${(currentMilestone.priceTarget / 1_000_000).toFixed(6)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Unlock Amount</span>
                  <span className="text-white font-semibold">{formatTokenAmount(currentMilestone.unlockAmount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Good Periods</span>
                  <span className="text-white font-semibold">{currentMilestone.goodPeriods}/{currentMilestone.requiredPeriods}</span>
                </div>
              </div>
              <div className="mt-6">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Progress</span>
                  <span>{Math.round((currentMilestone.goodPeriods / currentMilestone.requiredPeriods) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(currentMilestone.goodPeriods / currentMilestone.requiredPeriods) * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full"
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No active milestone</p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Next Milestone</h2>
            {nextMilestone && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                Upcoming
              </span>
            )}
          </div>
          {nextMilestone ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                <span className="text-gray-500 text-sm">Milestone</span>
                <span className="text-white font-semibold">#{nextMilestone.id}</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Price Target</span>
                  <span className="text-white font-semibold">${(nextMilestone.priceTarget / 1_000_000).toFixed(6)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Unlock Amount</span>
                  <span className="text-white font-semibold">{formatTokenAmount(nextMilestone.unlockAmount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Required Periods</span>
                  <span className="text-white font-semibold">{nextMilestone.requiredPeriods}</span>
                </div>
              </div>
              <div className="mt-6 p-4 bg-indigo-500/5 rounded-lg border border-indigo-500/20">
                <p className="text-sm text-gray-300 leading-relaxed">
                  Price must sustain <span className="font-semibold text-indigo-400">1.5×</span> the previous target for <span className="font-semibold text-indigo-400">{requiredPeriods} periods</span> to unlock.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">All milestones completed!</p>
          )}
        </motion.div>
      </div>

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
              <h3 className="text-lg font-semibold text-white mb-2">Trustless & Transparent</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                All unlock conditions are enforced on-chain. No human discretion. 
                The community wins before insiders do. Every milestone unlock is 
                automatic and verifiable on Base blockchain.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Token Allocation */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Token Allocation</h2>
        <div className="card">
          <div className="space-y-4">
            {allocations.map((allocation, index) => (
              <motion.div
                key={allocation.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">{allocation.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">{allocation.amount}</span>
                    <span className="text-sm font-semibold text-white">{allocation.value}</span>
                  </div>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: allocation.amount }}
                    transition={{ duration: 0.8, delay: index * 0.1 }}
                    className={`h-full bg-gradient-to-r ${allocation.color} rounded-full`}
                  />
                </div>
              </motion.div>
            ))}
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
