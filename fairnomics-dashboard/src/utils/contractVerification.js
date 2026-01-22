import { ethers } from 'ethers'
import { FAIR_VAULT_ABI } from '../services/contracts.js'

/**
 * Verify that a contract address is a valid FAIRVault
 */
export async function verifyVaultContract(vaultAddress, provider) {
  try {
    // Check if contract exists
    const code = await provider.getCode(vaultAddress)
    if (!code || code === '0x') {
      return {
        valid: false,
        error: `No contract found at address: ${vaultAddress}`,
      }
    }
    
    // Check code size
    const codeSize = (code.length / 2) - 1
    if (codeSize < 100) {
      return {
        valid: false,
        error: `Contract code too small (${codeSize} bytes). May not be a valid contract.`,
      }
    }
    
    // Try to call a simple view function to verify it's a FAIRVault
    const vaultAbi = [
      'function TOTAL_MILESTONES() external view returns (uint256)',
      'function initialized() external view returns (bool)',
      'function fairToken() external view returns (address)',
    ]
    
    const vault = new ethers.Contract(vaultAddress, vaultAbi, provider)
    
    try {
      await vault.TOTAL_MILESTONES()
      await vault.initialized()
      await vault.fairToken()
      
      return {
        valid: true,
        codeSize,
      }
    } catch (error) {
      return {
        valid: false,
        error: `Contract exists but doesn't appear to be a FAIRVault. Error: ${error.message}`,
        codeSize,
      }
    }
  } catch (error) {
    return {
      valid: false,
      error: `Error verifying contract: ${error.message}`,
    }
  }
}

