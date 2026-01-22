import { motion } from 'framer-motion'
import { TrendingUp, Clock, Target, Lock } from 'lucide-react'
import { useFairnomics } from '../contexts/FairnomicsContext'
import { formatTokenAmount } from '../utils/formatToken'

const Dashboard = () => {
  const { currentMilestone, nextMilestone, stats, milestones = [], config, loading, refreshing, error, lastUpdated } = useFairnomics()
  
  // Get required periods from config or milestone
  const requiredPeriods = config?.requiredGoodPeriods || currentMilestone?.requiredPeriods || 2
  
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
          <div className="text-xs text-gray-500 space-y-2">
            <p><strong>Common Issues:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Invalid vault address - verify the contract exists on Base</li>
              <li>Wrong contract type - ensure it's a FAIRVault contract</li>
              <li>RPC issues - try a different RPC URL (Alchemy, Infura, etc.)</li>
              <li>Contract not initialized - vault may need to be initialized first</li>
            </ul>
            <p className="mt-3"><strong>Setup:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Check your <code className="bg-gray-800 px-1 rounded">.env</code> file has correct addresses</li>
              <li>Verify <code className="bg-gray-800 px-1 rounded">VITE_VAULT_ADDRESS</code> is a valid FAIRVault contract</li>
              <li>Check <code className="bg-gray-800 px-1 rounded">VITE_BASE_RPC_URL</code> is accessible</li>
              <li>Restart the dev server after changing .env</li>
            </ol>
          </div>
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
      label: 'Good Periods',
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h1 className="text-5xl font-bold text-white mb-3">
          FAIR Token Dashboard
        </h1>
        <p className="text-lg text-gray-400">
          Transparent, rules-based unlock system on Base
        </p>
      </motion.div>

      {/* Stats Grid */}
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
    </div>
  )
}

export default Dashboard
