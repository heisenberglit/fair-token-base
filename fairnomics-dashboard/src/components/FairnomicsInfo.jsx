import { motion } from 'framer-motion'
import { Shield, Clock, Target, Lock, TrendingUp } from 'lucide-react'

const FairnomicsInfo = () => {
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
      title: '15 Period Sustain',
      description: 'Price must stay above target for 15 consecutive periods',
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
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl font-bold text-white mb-2">Fairnomics</h1>
        <p className="text-lg text-gray-400">
          Transparent, rules-based unlock system
        </p>
      </motion.div>

      {/* Rules */}
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
      </div>

      {/* Allocations */}
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

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card border border-indigo-500/30 bg-indigo-500/5"
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
  )
}

export default FairnomicsInfo
