import { motion } from 'framer-motion'
import { LayoutDashboard, Clock } from 'lucide-react'

const Navigation = ({ activeSection, setActiveSection }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'timeline', label: 'Timeline', icon: Clock },
  ]

  return (
    <nav className="sticky top-0 z-50 mb-8 border-b border-gray-900/50 bg-black/80 backdrop-blur-2xl">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              <span className="text-sm font-bold text-white">FAIR</span>
            </div>
            <h1 className="text-2xl font-bold text-white">FAIR Token</h1>
          </motion.div>

          <div className="flex gap-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              
              return (
                <motion.button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`nav-button flex items-center gap-2 ${
                    isActive ? 'nav-button-active' : 'nav-button-inactive'
                  }`}
                >
                  <Icon size={18} />
                  <span className="hidden md:inline font-medium">{item.label}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navigation
