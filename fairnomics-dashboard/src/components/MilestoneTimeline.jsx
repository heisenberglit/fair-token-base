import { motion } from 'framer-motion'
import { CheckCircle, Clock, Lock, TrendingUp, DollarSign, Coins } from 'lucide-react'
import { useFairnomics } from '../contexts/FairnomicsContext'
import { formatTokenAmount } from '../utils/formatToken'

const MilestoneTimeline = () => {
  const { milestones = [], currentMilestone, loading, refreshing, error, lastUpdated } = useFairnomics()
  
  // Only show loading on initial load
  if (loading && milestones.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading milestones from blockchain...</p>
        </div>
      </div>
    )
  }
  
  // Only show error if no data exists
  if (error && milestones.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="card border-red-500/30 bg-red-500/5 max-w-md">
          <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Data</h2>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  const getMilestoneStatus = (milestone) => {
    if (milestone.unlocked) return 'unlocked'
    if (milestone.id === currentMilestone?.id) return 'current'
    return 'locked'
  }

  // Group milestones for better visualization
  const unlockedCount = milestones.filter(m => m.unlocked).length
  const currentIndex = milestones.findIndex(m => m.id === currentMilestone?.id)

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="flex items-center justify-center gap-3 mb-3">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            Milestone Timeline
          </h1>
          {refreshing && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500"></div>
          )}
        </div>
        <p className="text-gray-400 text-lg">All 18 milestones and their unlock conditions</p>
        <div className="mt-4 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-gray-400">{unlockedCount} Unlocked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
            <span className="text-gray-400">1 In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-700"></div>
            <span className="text-gray-400">{18 - unlockedCount - 1} Locked</span>
          </div>
        </div>
        {lastUpdated && (
          <p className="text-xs text-gray-500 mt-3">
            Updated: {new Date(lastUpdated).toLocaleTimeString()}
          </p>
        )}
      </motion.div>
      
      {/* Show error banner if there's an error but we have data */}
      {error && milestones.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card border-yellow-500/30 bg-yellow-500/5"
        >
          <p className="text-sm text-yellow-400">
            ⚠️ {error} (showing cached data)
          </p>
        </motion.div>
      )}

      {/* Modern Timeline */}
      <div className="relative">
        {/* Animated gradient timeline line */}
        <div className="absolute left-12 md:left-16 top-0 bottom-0 w-1">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500 via-indigo-500 to-gray-800 opacity-30"></div>
          <motion.div
            className="absolute top-0 bg-gradient-to-b from-emerald-500 via-indigo-500 to-transparent"
            initial={{ height: 0 }}
            animate={{ height: `${(unlockedCount / milestones.length) * 100}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            style={{ width: '100%' }}
          />
        </div>

        <div className="space-y-8">
          {milestones.map((milestone, index) => {
            const status = getMilestoneStatus(milestone)
            const progress = status === 'current' 
              ? (milestone.goodPeriods / milestone.requiredPeriods) * 100 
              : status === 'unlocked' 
              ? 100 
              : 0

            return (
              <motion.div
                key={milestone.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.5 }}
                className="relative pl-20 md:pl-24"
              >
                {/* Timeline node with glow effect */}
                <div className="absolute left-8 md:left-12 top-6 -translate-x-1/2 z-20">
                  <motion.div
                    className={`relative w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${
                      status === 'unlocked'
                        ? 'bg-emerald-500 border-2 border-emerald-400'
                        : status === 'current'
                        ? 'bg-indigo-500 border-2 border-indigo-400'
                        : 'bg-gray-800 border-2 border-gray-700'
                    }`}
                    whileHover={{ scale: 1.2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    {/* Glow effect for current and unlocked */}
                    {(status === 'unlocked' || status === 'current') && (
                      <motion.div
                        className={`absolute inset-0 rounded-full ${
                          status === 'unlocked' ? 'bg-emerald-500' : 'bg-indigo-500'
                        } opacity-50 blur-md`}
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.3, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                    {status === 'unlocked' ? (
                      <CheckCircle className="text-white" size={16} />
                    ) : status === 'current' ? (
                      <Clock className="text-white" size={16} />
                    ) : (
                      <Lock className="text-gray-500" size={16} />
                    )}
                  </motion.div>
                  
                  {/* Milestone number badge */}
                  <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    status === 'unlocked'
                      ? 'bg-emerald-400 text-emerald-900'
                      : status === 'current'
                      ? 'bg-indigo-400 text-indigo-900'
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {milestone.id}
                  </div>
                </div>

                {/* Milestone card */}
                <motion.div
                  className={`relative card group ${
                    status === 'unlocked'
                      ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-emerald-900/5'
                      : status === 'current'
                      ? 'border-indigo-500/40 bg-gradient-to-br from-indigo-500/10 to-indigo-900/5 shadow-lg shadow-indigo-500/20'
                      : 'border-gray-800/50 bg-gray-900/30 opacity-75'
                  }`}
                  whileHover={{ scale: 1.02, y: -4 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  {/* Status indicator bar */}
                  <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                    status === 'unlocked'
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                      : status === 'current'
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500'
                      : 'bg-gray-800'
                  }`} />

                  <div className="pt-2">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-bold text-white">Milestone #{milestone.id}</h3>
                          {status === 'current' && (
                            <motion.div
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="w-2 h-2 rounded-full bg-indigo-400"
                            />
                          )}
                        </div>
                        <p className={`text-xs font-medium ${
                          status === 'unlocked'
                            ? 'text-emerald-400'
                            : status === 'current'
                            ? 'text-indigo-400'
                            : 'text-gray-500'
                        }`}>
                          {status === 'unlocked' && '✓ Unlocked'}
                          {status === 'current' && '⏳ In Progress'}
                          {status === 'locked' && '🔒 Locked'}
                        </p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        status === 'unlocked'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : status === 'current'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-gray-800/50 text-gray-500 border border-gray-700/50'
                      }`}>
                        {status === 'unlocked' ? 'COMPLETE' : status === 'current' ? 'ACTIVE' : 'PENDING'}
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-gray-800/50">
                        <div className="p-2 rounded-lg bg-indigo-500/10">
                          <DollarSign className="text-indigo-400" size={18} />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-0.5">Price Target</p>
                          <p className="text-sm font-bold text-white">
                            ${(milestone.priceTarget / 1_000_000).toFixed(6)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-gray-800/50">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                          <Coins className="text-purple-400" size={18} />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-0.5">Unlock Amount</p>
                          <p className="text-sm font-bold text-white">
                            {formatTokenAmount(milestone.unlockAmount)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar for current milestone */}
                    {status === 'current' && (
                      <div className="mt-4 pt-4 border-t border-gray-800/50">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-gray-400">Progress</span>
                          <span className="text-indigo-400 font-semibold">
                            {milestone.goodPeriods} / {milestone.requiredPeriods} periods
                          </span>
                        </div>
                        <div className="relative w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full"
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                          <TrendingUp size={12} />
                          <span>Price must sustain above target for {milestone.requiredPeriods} periods</span>
                        </div>
                      </div>
                    )}

                    {/* Unlocked badge */}
                    {status === 'unlocked' && (
                      <div className="mt-4 pt-4 border-t border-emerald-500/20">
                        <div className="flex items-center gap-2 text-xs text-emerald-400">
                          <CheckCircle size={14} />
                          <span>Successfully unlocked on-chain</span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default MilestoneTimeline
