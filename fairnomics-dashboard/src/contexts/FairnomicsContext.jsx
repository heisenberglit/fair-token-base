import { createContext, useContext } from 'react'
import { useFairnomicsData } from '../hooks/useFairnomicsData'

const FairnomicsContext = createContext(null)

export const FairnomicsProvider = ({ children }) => {
  const data = useFairnomicsData()
  
  return (
    <FairnomicsContext.Provider value={data}>
      {children}
    </FairnomicsContext.Provider>
  )
}

export const useFairnomics = () => {
  const context = useContext(FairnomicsContext)
  if (!context) {
    throw new Error('useFairnomics must be used within FairnomicsProvider')
  }
  return context
}

