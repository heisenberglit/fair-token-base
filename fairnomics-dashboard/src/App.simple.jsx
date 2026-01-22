// Minimal test version
function App() {
  return (
    <div style={{ 
      padding: '40px', 
      background: 'linear-gradient(to bottom right, #0f172a, #1e3a8a, #0f172a)', 
      color: 'white', 
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem', background: 'linear-gradient(to right, #60a5fa, #22d3ee, #2dd4bf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        FAIR Token Dashboard
      </h1>
      <p style={{ fontSize: '1.25rem', color: '#cbd5e1', marginBottom: '2rem' }}>
        Transparent, rules-based unlock system on Base
      </p>
      <div style={{ 
        background: 'rgba(255, 255, 255, 0.1)', 
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '600px'
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Current Status</h2>
        <p style={{ color: '#cbd5e1' }}>If you see this, React is working correctly!</p>
        <p style={{ color: '#94a3b8', marginTop: '1rem', fontSize: '0.875rem' }}>
          The dashboard components should load below...
        </p>
      </div>
    </div>
  )
}

export default App

