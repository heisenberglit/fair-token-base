import { motion } from 'framer-motion'
import { CheckCircle, Clock, Lock, TrendingUp, Coins, AlertCircle } from 'lucide-react'
import { useFairnomics } from '../contexts/FairnomicsContext'
import { formatTokenAmount } from '../utils/formatToken'

const formatUnlockDate = (timestamp) => {
  if (!timestamp) return null
  return new Date(timestamp).toISOString().slice(0, 10) // YYYY-MM-DD
}

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
    if (milestone.unlocked && milestone.pending) return 'pending'
    if (milestone.unlocked) return 'unlocked'
    if (milestone.id === currentMilestone?.id) return 'current'
    return 'locked'
  }

  const unlockedCount = milestones.filter(m => m.unlocked && !m.pending).length
  const pendingCount = milestones.filter(m => m.unlocked && m.pending).length

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <p className="text-gray-400 text-sm">All 18 milestones and their unlock conditions</p>
          {refreshing && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
          )}
        </div>
        <div className="flex items-center gap-6 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-gray-400">{unlockedCount} Unlocked</span>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-gray-400">{pendingCount} Pending Distribution</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
            <span className="text-gray-400">1 In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-700"></div>
            <span className="text-gray-400">{18 - unlockedCount - pendingCount - 1} Locked</span>
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
            const unlockDate = formatUnlockDate(milestone.unlockTimestamp)

            return (
              <motion.div
                key={milestone.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.5 }}
                className="relative pl-20 md:pl-24"
              >
                {/* Timeline node */}
                <div className="absolute left-8 md:left-12 top-6 -translate-x-1/2 z-20">
                  <motion.div
                    className={`relative w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${
                      status === 'unlocked'
                        ? 'bg-emerald-500 border-2 border-emerald-400'
                        : status === 'pending'
                        ? 'bg-amber-500 border-2 border-amber-400'
                        : status === 'current'
                        ? 'bg-indigo-500 border-2 border-indigo-400'
                        : 'bg-gray-800 border-2 border-gray-700'
                    }`}
                    whileHover={{ scale: 1.2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    {(status === 'unlocked' || status === 'pending' || status === 'current') && (
                      <motion.div
                        className={`absolute inset-0 rounded-full ${
                          status === 'unlocked' ? 'bg-emerald-500' : status === 'pending' ? 'bg-amber-500' : 'bg-indigo-500'
                        } opacity-50 blur-md`}
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.3, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                    {status === 'unlocked' ? (
                      <CheckCircle className="text-white" size={16} />
                    ) : status === 'pending' ? (
                      <AlertCircle className="text-white" size={16} />
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
                      : status === 'pending'
                      ? 'bg-amber-400 text-amber-900'
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
                      : status === 'pending'
                      ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-900/5 shadow-lg shadow-amber-500/10'
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
                      : status === 'pending'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
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
                        <div className={`text-xs font-medium ${
                          status === 'unlocked'
                            ? 'text-emerald-400'
                            : status === 'pending'
                            ? 'text-amber-400'
                            : status === 'current'
                            ? 'text-indigo-400'
                            : 'text-gray-500'
                        }`}>
                          {status === 'unlocked' && (
                            <>
                              <span>Unlocked</span>
                              {unlockDate && (
                                <span className="ml-2 text-emerald-300/70">{unlockDate}</span>
                              )}
                            </>
                          )}
                          {status === 'pending' && 'Earned — Awaiting Distribution'}
                          {status === 'current' && 'In Progress'}
                          {status === 'locked' && 'Locked'}
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        status === 'unlocked'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : status === 'pending'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : status === 'current'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-gray-800/50 text-gray-500 border border-gray-700/50'
                      }`}>
                        {status === 'unlocked' ? 'COMPLETE' : status === 'pending' ? 'AWAITING FUNDS' : status === 'current' ? 'ACTIVE' : 'LOCKED'}
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {/* Price cell */}
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-gray-800/50">
                        <div className={`p-2 rounded-lg ${
                          status === 'unlocked' ? 'bg-emerald-500/10' : 'bg-indigo-500/10'
                        }`}>
                          <TrendingUp className={
                            status === 'unlocked' ? 'text-emerald-400' :
                            status === 'current' ? 'text-indigo-400' :
                            status === 'pending' ? 'text-amber-400' :
                            'text-indigo-400'
                          } size={18} />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-0.5">
                            {status === 'unlocked' || status === 'pending' ? 'Unlocked at' : 'Unlocks at or above'}
                          </p>
                          <p className="text-sm font-bold text-white">
                            {status === 'unlocked' && milestone.unlockPrice !== null
                              ? `${(milestone.unlockPrice / 1_000_000).toFixed(6)}`
                              : status === 'locked'
                              ? <span>{(milestone.priceTarget / 1_000_000).toFixed(6)}<span className="text-gray-500 text-xs ml-0.5">*</span></span>
                              : `${(milestone.priceTarget / 1_000_000).toFixed(6)}`
                            }
                          </p>
                        </div>
                      </div>

                      {/* Unlock amount cell */}
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
                        <p className="text-xs text-gray-400 mb-2">
                          Must average at or above target for {milestone.requiredPeriods} Good Hours
                        </p>
                        <div className="relative w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full"
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                        </div>
                        <div className="mt-1.5 text-right">
                          <span className="text-xs text-indigo-400 font-semibold">
                            {milestone.goodPeriods}/{milestone.requiredPeriods} Good Hours
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Pending badge */}
                    {status === 'pending' && (
                      <div className="mt-4 pt-4 border-t border-amber-500/20">
                        <div className="flex items-center gap-2 text-xs text-amber-400">
                          <AlertCircle size={14} />
                          <span>Milestone earned — Safe must refill vault before distribution</span>
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

      {/* Footnote */}
      <p className="text-xs text-gray-600 mt-4">
        * Estimated price target. Locked milestone targets are recalculated at each unlock — the actual target will be set to 1.5× the TWAP price at the time the previous milestone unlocks.
      </p>
    </div>
  )
}

export default MilestoneTimeline
