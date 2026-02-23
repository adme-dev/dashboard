/**
 * Sync Monday.com team memberships to local database
 */

import dotenv from 'dotenv'
dotenv.config()

import { MondayClient } from '../server/utils/mondayClient'
import { queryRows, queryOne } from '../server/utils/db'

async function syncTeamMemberships() {
  const apiToken = process.env.MONDAY_API_TOKEN
  if (!apiToken) {
    console.error('❌ MONDAY_API_TOKEN not found')
    process.exit(1)
  }

  const client = new MondayClient(apiToken)

  // Fetch users with teams from Monday
  console.log('📥 Fetching users and teams from Monday.com...\n')
  
  const query = `
    query {
      users(limit: 500) {
        id
        name
        email
        teams {
          id
          name
        }
      }
    }
  `
  
  const data = await client['request']<{ users: Array<{
    id: string
    name: string
    email: string
    teams?: Array<{ id: string; name: string }>
  }> }>(query)
  
  // Get local team mapping (name -> id)
  const localTeams = await queryRows<{ id: string; name: string }>(
    'SELECT id, name FROM teams WHERE is_active = true'
  )
  const teamNameToId = new Map(localTeams.map(t => [t.name, t.id]))
  
  console.log('Local teams:')
  localTeams.forEach(t => console.log(`  - ${t.name}: ${t.id}`))
  
  // Get local user mapping (monday_id -> id)
  const localUsers = await queryRows<{ id: string; monday_user_id: string; name: string }>(
    'SELECT id, monday_user_id, name FROM team_members WHERE monday_user_id IS NOT NULL'
  )
  const mondayIdToLocalId = new Map(localUsers.map(u => [u.monday_user_id, u.id]))
  
  console.log(`\n✅ Found ${data.users.length} users in Monday`)
  console.log(`✅ Found ${localTeams.length} local teams`)
  console.log(`✅ Found ${localUsers.length} local users with Monday IDs`)
  
  // Track stats
  let added = 0
  let skipped = 0
  let errors = 0
  
  console.log('\n🚀 Syncing team memberships...\n')
  
  for (const mondayUser of data.users) {
    const localUserId = mondayIdToLocalId.get(mondayUser.id)
    
    if (!localUserId) {
      console.log(`⚠️  Skipping ${mondayUser.name} - not found in local database`)
      skipped++
      continue
    }
    
    if (!mondayUser.teams || mondayUser.teams.length === 0) {
      console.log(`⚠️  Skipping ${mondayUser.name} - no teams in Monday`)
      skipped++
      continue
    }
    
    for (const mondayTeam of mondayUser.teams) {
      const localTeamId = teamNameToId.get(mondayTeam.name)
      
      if (!localTeamId) {
        console.log(`⚠️  Team "${mondayTeam.name}" not found locally`)
        skipped++
        continue
      }
      
      try {
        await queryOne(`
          INSERT INTO team_memberships (team_id, team_member_id, role)
          VALUES ($1, $2, 'member')
          ON CONFLICT (team_id, team_member_id) DO NOTHING
        `, [localTeamId, localUserId])
        
        console.log(`✅ ${mondayUser.name} → ${mondayTeam.name}`)
        added++
      } catch (err: any) {
        console.error(`❌ Error adding ${mondayUser.name} to ${mondayTeam.name}:`, err.message)
        errors++
      }
    }
  }
  
  console.log('\n' + '─'.repeat(80))
  console.log('✅ Sync Complete!')
  console.log(`   Added: ${added}`)
  console.log(`   Skipped: ${skipped}`)
  console.log(`   Errors: ${errors}`)
  console.log('─'.repeat(80))
  
  // Show final team counts
  console.log('\n📊 Final Team Member Counts:')
  const finalTeams = await queryRows(`
    SELECT t.name, COUNT(tms.team_member_id)::int as count
    FROM teams t
    LEFT JOIN team_memberships tms ON tms.team_id = t.id
    GROUP BY t.id, t.name
    ORDER BY t.name
  `)
  
  finalTeams.forEach((t: any) => {
    console.log(`   ${t.name}: ${t.count} members`)
  })
}

syncTeamMemberships().catch(console.error)
