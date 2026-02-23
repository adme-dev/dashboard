// Simple test to verify all imports are working
import { defineNitroPlugin } from 'nitropack'

export default defineNitroPlugin(async (nitroApp) => {
  try {
    // Test auth utils import
    const auth = await import('../server/utils/auth.js')
    console.log('✅ Auth utils loaded:', Object.keys(auth).join(', '))
    
    // Test db utils import
    const db = await import('../server/utils/db.js')
    console.log('✅ DB utils loaded:', Object.keys(db).join(', '))
    
    console.log('✅ All imports working correctly!')
  } catch (error) {
    console.error('❌ Import error:', error)
  }
})
