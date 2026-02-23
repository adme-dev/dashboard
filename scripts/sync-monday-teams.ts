/**
 * Sync Monday.com teams/workspaces and user assignments
 */

import dotenv from 'dotenv'
dotenv.config()

import { MondayClient } from '../server/utils/mondayClient'
import { queryRows, queryOne } from '../server/utils/db'

async function syncMondayTeams() {
  const apiToken = process.env.MONDAY_API_TOKEN
  if (!apiToken) {
    console.error('❌ MONDAY_API_TOKEN not found')
    process.exit(1)
  }

  const client = new MondayClient(apiToken)

  // Fetch all users with their teams from Monday
  console.log('📥 Fetching users and teams from Monday.com...\n')
  
  // Monday API query to get users with their teams
  const query = `
    query {
      users(limit: 500) {
        id
        name
        email
        photo_thumb
        teams {
          id
          name
        }
      }
    }
  `
  
  try {
    const data = await client['request']<{ users: Array<{
      id: string
      name: string
      email: string
      photo_thumb?: string
      teams?: Array<{ id: string; name: string }>
    }> }>(query)
    
    console.log(`✅ Found ${data.users.length} users`)
    
    // Show user-team assignments from Monday
    console.log('\n👥 Monday.com User-Team Assignments:')
    console.log('─'.repeat(80))
    
    for (const user of data.users) {
      const teams = user.teams?.map(t => t.name).join(', ') || 'No teams'
      console.log(`${user.name}: ${teams}`)
    }
    
  } catch (err: any) {
    console.error('❌ Error:', err.message)
    // Try alternative query without teams
    console.log('\n🔄 Trying alternative query...')
    
    const simpleQuery = `
      query {
        users(limit: 500) {
          id
          name
          email
          photo_thumb
        }
      }
    `
    
    const simpleData = await client['request']<{ users: any[] }>(simpleQuery)
    console.log(`✅ Found ${simpleData.users.length} users (no team data available)`)
    console.log('\nUsers:')
    simpleData.users.forEach(u => console.log(`  - ${u.name} <${u.email}>`))
  }
}

syncMondayTeams().catch(console.error)
