/**
 * Find the Support board with groups like Emailed Items, Toyota, etc.
 */

import { createMondayClient } from '../server/utils/mondayClient'

async function findSupportBoards() {
  console.log('🔍 Searching for Support boards...\n')
  
  try {
    const client = await createMondayClient()
    const boards = await client.getBoards({ limit: 500 })
    
    // Find boards with "support" in name
    console.log('📋 Boards with "support" in name:')
    const supportBoards = boards.filter(b => b.name.toLowerCase().includes('support'))
    supportBoards.forEach(b => {
      console.log(`  • ${b.name} (ID: ${b.id})`)
    })
    
    // Now check each for the specific groups we saw in the screenshot
    console.log('\n🔍 Checking for boards with groups like "Emailed Items", "Toyota"...\n')
    
    for (const board of boards.slice(0, 50)) {
      if (board.state !== 'active') continue
      
      const hasRelevantGroups = board.groups?.some((g: any) => 
        g.title.toLowerCase().includes('emailed') ||
        g.title.toLowerCase().includes('toyota') ||
        g.title.toLowerCase().includes('follow up') ||
        g.title.toLowerCase().includes('support jobs')
      )
      
      if (hasRelevantGroups) {
        console.log(`✅ FOUND: ${board.name}`)
        console.log(`   ID: ${board.id}`)
        console.log(`   Groups: ${board.groups?.map((g: any) => g.title).join(', ')}`)
        console.log('')
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

findSupportBoards()
