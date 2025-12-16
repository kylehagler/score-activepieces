import dotenv from 'dotenv'
import path from 'path'

// Load .env file from project root for development
const envPath = path.resolve(__dirname, '../../../../.env')
const result = dotenv.config({ path: envPath })

if (result.error) {
    console.log(`[preload] Could not load .env from ${envPath}:`, result.error.message)
} else {
    console.log(`[preload] Loaded environment from ${envPath}`)
    console.log(`[preload] AP_DB_TYPE=${process.env.AP_DB_TYPE}`)
}
