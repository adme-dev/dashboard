import dotenv from 'dotenv'
dotenv.config()

import { MondayClient } from '../server/utils/mondayClient'
import { queryOne, queryRows } from '../server/utils/db'

async function syncTitles() {
  const apiToken = process.env.MONDAY_API_TOKEN
  if (!apiToken) {
    console.error('❌ MONDAY_API_TOKEN not found')
    process.exit(1)
  }

  const client = new MondayClient(apiToken)

  console.log('📥 Fetching users with titles from Monday.com...\n')

  const query = `
    query {
      users(limit: 500) {
        id
        name
        title
      }
    }
  `
  
  const data = await (client as any)['request']<{ users: Array<{
    id: string
    name: string
    title?: string
  }> }>(query)
  
  console.log(`✅ Found ${data.users.length} users`)
  
  let updated = 0
  let skipped = 0
  
  for (const user of data.users) {
    if (!user.title) {
      skipped++
      continue
    }
    
    try {
      await queryOne(`
        UPDATE team_members 
        SET title = $1, updated_at = NOW()
        WHERE monday_user_id = $2
      `, [user.title, user.id])
      
      console.log(`✅ ${user.name}: ${user.title}`)
      updated++
    } catch (err: any) {
      console.error(`❌ Error updating ${user.name}:`, err.message)
    }
  }
  
  console.log('\n' + '─'.repeat(80))
  console.log('✅ Sync Complete!')
  console.log(`   Updated: ${updated}`)
  console.log(`   Skipped (no title): ${skipped}`)
  console.log('─'.repeat(80))
  
  // Show results
  console.log('\n📊 Current titles in database:')
  const users = await queryRows(`
    SELECT name, title FROM team_members 
    WHERE title IS NOT NULL AND title != ''
    ORDER BY name
  `)
  
  users.forEach((u: any) => {
    console.log(`   ${u.name}: ${u.title}`)
  })
}

syncTitles().catch(console.error)
