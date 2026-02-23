/**
 * Analyze Monday.com workspaces and their boards
 */

import { createMondayClient } from '../server/utils/mondayClient'

async function analyzeWorkspaces() {
  console.log('🔍 Analyzing Monday.com workspaces...\n')
  
  try {
    const client = await createMondayClient()
    
    // Get workspaces
    console.log('📁 Fetching workspaces...')
    const workspaces = await client.getWorkspaces()
    
    console.log(`\n✅ Found ${workspaces.length} workspaces:\n`)
    
    for (const ws of workspaces) {
      console.log(`🏢 ${ws.name} (ID: ${ws.id})`)
      
      // Get boards in this workspace
      const boards = await client.getBoards({ limit: 500 })
      const wsBoards = boards.filter(b => b.workspace_id === ws.id && b.state === 'active')
      
      console.log(`   Boards: ${wsBoards.length}`)
      wsBoards.slice(0, 10).forEach(b => {
        console.log(`     • ${b.name}`)
      })
      if (wsBoards.length > 10) {
        console.log(`     ... and ${wsBoards.length - 10} more`)
      }
      console.log('')
    }
    
    // Also show boards without workspace
    const allBoards = await client.getBoards({ limit: 500 })
    const noWorkspace = allBoards.filter(b => !b.workspace_id && b.state === 'active')
    
    if (noWorkspace.length > 0) {
      console.log(`📋 Boards without workspace: ${noWorkspace.length}`)
      noWorkspace.slice(0, 10).forEach(b => {
        console.log(`   • ${b.name}`)
      })
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

analyzeWorkspaces()
