import { useState } from 'react'
import { motion } from 'framer-motion'
import Dashboard from './components/Dashboard'
import MilestoneTimeline from './components/MilestoneTimeline'
import Navigation from './components/Navigation'
import { FairnomicsProvider } from './contexts/FairnomicsContext'

function App() {
  const [activeSection, setActiveSection] = useState('dashboard')

  return (
    <FairnomicsProvider>
      <div className="min-h-screen" style={{ minHeight: '100vh' }}>
        <Navigation activeSection={activeSection} setActiveSection={setActiveSection} />
        
        <main className="container mx-auto px-6 py-8" style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {activeSection === 'dashboard' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Dashboard />
          </motion.div>
        )}
        
        {activeSection === 'timeline' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <MilestoneTimeline />
          </motion.div>
        )}
      </main>
      </div>
    </FairnomicsProvider>
  )
}

export default App
