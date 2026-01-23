import { motion } from 'framer-motion'
import { TrendingUp, Clock, Target, Lock, Shield, ExternalLink } from 'lucide-react'
import { useFairnomics } from '../contexts/FairnomicsContext'
import { formatTokenAmount } from '../utils/formatToken'

const Dashboard = () => {
  const { currentMilestone, nextMilestone, stats, milestones = [], config, loading, refreshing, error, lastUpdated } = useFairnomics()
  
  // Get required periods from config or milestone
  const requiredPeriods = config?.requiredGoodPeriods || currentMilestone?.requiredPeriods || 2
  
  // Get vault address from env
  const vaultAddress = import.meta.env.VITE_VAULT_ADDRESS || '0x...'
  const fairTokenAddress = import.meta.env.VITE_FAIR_TOKEN_ADDRESS || '0x...'
  
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
      title: '3 Months Cooldown',
      description: 'Minimum 3 months between unlock events',
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

  const faqs = [
    {
      question: "Where's the GitHub?",
      answer: "GitHub.com/fairnomics"
    },
    {
      question: "What inspired Fairnomics?",
      answer: "Crypto has long needed a fair tokenomics model that works for communities and long-term builders. This 2025 tweet by CZ inspired us to build FAIR."
    },
    {
      question: "Is FAIR on CoinMarketCap?",
      answer: "Coming soon!"
    },
    {
      question: "What other projects use Fairnomics?",
      answer: "$A2A and several more are in development!"
    }
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

      {/* Token Data & FAQ - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Data */}
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold text-white mb-6">Token Data</h2>
          <div className="card flex-1">
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-gray-800">
                <span className="text-gray-400 text-sm">Chain</span>
                <span className="text-white font-semibold">Base</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-800">
                <span className="text-gray-400 text-sm">Contract</span>
                {fairTokenAddress && fairTokenAddress !== '0x...' ? (
                  <a
                    href={`https://basescan.org/address/${fairTokenAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold flex items-center gap-1"
                  >
                    {fairTokenAddress.slice(0, 6)}...{fairTokenAddress.slice(-4)}
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="text-white font-semibold text-sm">-</span>
                )}
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-800">
                <span className="text-gray-400 text-sm">DEX</span>
                <span className="text-white font-semibold">Aerodrome USDC/FAIR</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-800">
                <span className="text-gray-400 text-sm">Market Cap</span>
                <span className="text-white font-semibold">$1.5M</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-800">
                <span className="text-gray-400 text-sm">FDV</span>
                <span className="text-white font-semibold">$10.0M</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-800">
                <span className="text-gray-400 text-sm">Circulating Supply</span>
                <span className="text-white font-semibold">1B FAIR</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Max Supply</span>
                <span className="text-white font-semibold">10B FAIR</span>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold text-white mb-6">FAQ</h2>
          <div className="card flex-1">
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={index < faqs.length - 1 ? "pb-3 border-b border-gray-800" : ""}
                >
                  <h3 className="text-sm font-semibold text-white mb-1">Q: {faq.question}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">A: {faq.answer}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
