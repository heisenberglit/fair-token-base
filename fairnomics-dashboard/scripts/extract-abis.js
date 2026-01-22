// Script to extract ABIs from Hardhat artifacts and generate contracts.js for dashboard
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'artifacts', 'contracts')
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'services', 'contracts.js')

function extractABI(contractName) {
  const artifactPath = path.join(ARTIFACTS_DIR, `${contractName}.sol`, `${contractName}.json`)
  
  if (!fs.existsSync(artifactPath)) {
    console.warn(`Artifact not found: ${contractName}`)
    return null
  }
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  return artifact.abi
}

function generateContractsFile() {
  console.log('Extracting ABIs from compiled artifacts...')
  
  const vaultABI = extractABI('FAIRVault')
  const oracleABI = extractABI('AerodromeTWAPOracle')
  
  // ERC20 ABI (standard)
  const erc20ABI = [
    {
      constant: true,
      inputs: [{ name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: '', type: 'uint256' }],
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'totalSupply',
      outputs: [{ name: '', type: 'uint256' }],
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'decimals',
      outputs: [{ name: '', type: 'uint8' }],
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'symbol',
      outputs: [{ name: '', type: 'string' }],
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'name',
      outputs: [{ name: '', type: 'string' }],
      type: 'function',
    },
  ]
  
  const content = `// Auto-generated from Hardhat artifacts
// Run: node scripts/extract-abis.js (from fairnomics-dashboard directory)
// Or: npm run extract-abis

export const FAIR_VAULT_ABI = ${JSON.stringify(vaultABI || [], null, 2)}

export const AERODROME_ORACLE_ABI = ${JSON.stringify(oracleABI || [], null, 2)}

export const ERC20_ABI = ${JSON.stringify(erc20ABI, null, 2)}
`

  fs.writeFileSync(OUTPUT_FILE, content, 'utf8')
  console.log(`✅ Generated ${OUTPUT_FILE}`)
  console.log(`   - FAIRVault ABI: ${vaultABI ? vaultABI.length : 0} functions`)
  console.log(`   - AerodromeTWAPOracle ABI: ${oracleABI ? oracleABI.length : 0} functions`)
  console.log(`   - ERC20 ABI: ${erc20ABI.length} functions`)
}

try {
  generateContractsFile()
} catch (error) {
  console.error('Error generating contracts file:', error)
  process.exit(1)
}

