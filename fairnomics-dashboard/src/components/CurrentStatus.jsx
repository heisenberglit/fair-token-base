import { motion } from 'framer-motion'
import { CheckCircle, Clock, AlertCircle, TrendingUp } from 'lucide-react'
import { useFairnomics } from '../contexts/FairnomicsContext'

const CurrentStatus = () => {
  const { currentMilestone, stats, config, loading, refreshing, error, lastUpdated } = useFairnomics()
  
  // Get required periods from config or milestone
  const requiredPeriods = config?.requiredGoodPeriods || currentMilestone?.requiredPeriods || 2
  
  // Only show loading on initial load
  if (loading && !currentMilestone) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading data from blockchain...</p>
        </div>
      </div>
    )
  }
  
  // Only show error if no data exists
  if (error && !currentMilestone) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="card border-red-500/30 bg-red-500/5 max-w-md">
          <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Data</h2>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  const currentPriceUsd = stats?.currentPrice || 0
  const priceTargetUsd = currentMilestone?.priceTarget ? currentMilestone.priceTarget / 1_000_000 : 0
  
  const conditions = [
    {
      label: 'Price Above Target',
      met: currentPriceUsd >= priceTargetUsd,
      value: `$${currentPriceUsd.toFixed(6)} / $${priceTargetUsd.toFixed(6)}`,
      icon: TrendingUp,
    },
    {
      label: 'Sustain Period',
      met: stats.daysAboveTarget >= requiredPeriods,
      value: `${stats.daysAboveTarget} / ${requiredPeriods} periods`,
      icon: Clock,
    },
    {
      label: 'Cooldown Period',
      met: true,
      value: 'Completed',
      icon: CheckCircle,
    },
  ]

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl font-bold text-white mb-2">Current Status</h1>
        <p className="text-gray-400">Real-time unlock conditions and progress</p>
      </motion.div>

      {/* Conditions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {conditions.map((condition, index) => {
          const Icon = condition.icon
          return (
            <motion.div
              key={condition.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`card border ${
                condition.met 
                  ? 'border-emerald-500/30 bg-emerald-500/5' 
                  : 'border-gray-800/50'
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${
                  condition.met ? 'bg-emerald-500/20' : 'bg-gray-800/50'
                }`}>
                  <Icon 
                    className={condition.met ? 'text-emerald-400' : 'text-gray-500'} 
                    size={20} 
                  />
                </div>
                <h3 className="text-sm font-semibold text-white">{condition.label}</h3>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${
                    condition.met ? 'text-emerald-400' : 'text-gray-400'
                  }`}>
                    {condition.met ? 'Met' : 'Pending'}
                  </span>
                  {condition.met && (
                    <CheckCircle className="text-emerald-400" size={16} />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">{condition.value}</p>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Detailed Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card"
      >
        <h2 className="text-xl font-bold text-white mb-6">Unlock Progress</h2>
        {currentMilestone ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-gray-800">
                <span className="text-gray-400 text-sm">Current Milestone</span>
                <span className="text-white font-semibold">#{currentMilestone.id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Price Target</span>
                <span className="text-white font-semibold">${(currentMilestone.priceTarget / 1_000_000).toFixed(6)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Current Price</span>
                <span className={`font-semibold ${
                  currentPriceUsd >= priceTargetUsd
                    ? 'text-emerald-400' 
                    : 'text-gray-400'
                }`}>
                  ${currentPriceUsd.toFixed(6)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Good Periods</span>
                <span className="text-white font-semibold">
                  {currentMilestone.goodPeriods} / {currentMilestone.requiredPeriods}
                </span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span>Progress to Unlock</span>
                <span>{Math.round((currentMilestone.goodPeriods / currentMilestone.requiredPeriods) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
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
    </div>
  )
}

export default CurrentStatus
