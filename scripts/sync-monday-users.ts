/**
 * Script to sync Monday.com users to local database
 * Run: npx tsx scripts/sync-monday-users.ts
 */

import dotenv from 'dotenv'
dotenv.config()

import { MondayClient } from '../server/utils/mondayClient'
import { queryRows, queryOne } from '../server/utils/db'

async function syncMondayUsers() {
  const apiToken = process.env.MONDAY_API_TOKEN
  if (!apiToken) {
    console.error('❌ MONDAY_API_TOKEN not found in environment')
    process.exit(1)
  }

  console.log('🔌 Connecting to Monday.com...')
  const client = new MondayClient(apiToken)

  console.log('\n📥 Fetching users from Monday.com...')
  let mondayUsers
  try {
    mondayUsers = await client.getUsers({ limit: 500 })
    console.log(`✅ Found ${mondayUsers.length} users`)
  } catch (err: any) {
    console.error('❌ Failed to fetch users:', err.message)
    process.exit(1)
  }

  // Display preview
  console.log('\n👥 Monday.com Users:')
  console.log('─'.repeat(80))
  mondayUsers.forEach((user, i) => {
    console.log(`${i + 1}. ${user.name} <${user.email}> (ID: ${user.id})`)
  })
  console.log('─'.repeat(80))

  // Get default team
  const defaultTeam = await queryOne<{ id: string }>(
    'SELECT id FROM teams WHERE name = $1',
    ['ADME Everyone']
  )
  
  if (!defaultTeam) {
    console.error('❌ Default team "ADME Everyone" not found. Please create it first.')
    process.exit(1)
  }
  
  console.log(`\n📝 Default team: ADME Everyone (${defaultTeam.id})`)

  // Get existing users
  const existingMembers = await queryRows<{
    id: string
    email: string
    monday_user_id: string
  }>('SELECT id, email, monday_user_id FROM team_members WHERE is_active = true')
  
  const existingByEmail = new Map(existingMembers.map(m => [m.email.toLowerCase(), m]))
  const existingByMondayId = new Map(existingMembers.filter(m => m.monday_user_id).map(m => [m.monday_user_id, m]))

  console.log(`📊 Existing local users: ${existingMembers.length}`)

  // Preview changes
  let willCreate = 0
  let willUpdate = 0
  let exists = 0

  for (const user of mondayUsers) {
    const existing = user.id ? existingByMondayId.get(user.id) : null
    if (existing) {
      exists++
    } else if (user.email && existingByEmail.has(user.email.toLowerCase())) {
      willUpdate++
    } else {
      willCreate++
    }
  }

  console.log('\n📋 Sync Preview:')
  console.log(`   🟢 Will create: ${willCreate}`)
  console.log(`   🟡 Will update: ${willUpdate}`)
  console.log(`   ⚪ Already exists: ${exists}`)

  // Confirm sync
  console.log('\n⚠️  Ready to sync. This will:')
  console.log('   - Create new users from Monday.com')
  console.log('   - Update existing users with Monday IDs')
  console.log('   - Add all users to "ADME Everyone" team')
  
  console.log('\n🚀 Starting sync...\n')

  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const mondayUser of mondayUsers) {
    try {
      if (!mondayUser.email) {
        console.log(`⚠️  Skipping ${mondayUser.name} - no email`)
        skipped++
        continue
      }

      // Check if exists by Monday ID or email
      const existingByMonday = mondayUser.id ? existingByMondayId.get(mondayUser.id) : null
      const existingByEmailVal = existingByEmail.get(mondayUser.email.toLowerCase())
      const existing = existingByMonday || existingByEmailVal

      if (existing) {
        // Update existing user
        await queryOne(`
          UPDATE team_members 
          SET name = $1, 
              avatar_url = COALESCE(NULLIF($2, ''), avatar_url), 
              monday_user_id = COALESCE($3, monday_user_id),
              updated_at = NOW()
          WHERE id = $4
        `, [mondayUser.name, mondayUser.photo_thumb, mondayUser.id, existing.id])
        
        // Ensure membership in default team
        await queryOne(`
          INSERT INTO team_memberships (team_id, team_member_id, role)
          VALUES ($1, $2, 'member')
          ON CONFLICT (team_id, team_member_id) DO NOTHING
        `, [defaultTeam.id, existing.id])
        
        console.log(`🟡 Updated: ${mondayUser.name}`)
        updated++
      } else {
        // Create new user
        const newMember = await queryOne<{ id: string }>(`
          INSERT INTO team_members (name, email, avatar_url, monday_user_id, is_active, role)
          VALUES ($1, $2, $3, $4, true, 'member')
          RETURNING id
        `, [mondayUser.name, mondayUser.email.toLowerCase(), mondayUser.photo_thumb, mondayUser.id])

        if (newMember) {
          await queryOne(`
            INSERT INTO team_memberships (team_id, team_member_id, role)
            VALUES ($1, $2, 'member')
          `, [defaultTeam.id, newMember.id])
        }

        console.log(`🟢 Created: ${mondayUser.name}`)
        created++
      }
    } catch (err: any) {
      console.error(`❌ Error processing ${mondayUser.name}:`, err.message)
      errors++
    }
  }

  console.log('\n' + '─'.repeat(80))
  console.log('✅ Sync Complete!')
  console.log(`   Created: ${created}`)
  console.log(`   Updated: ${updated}`)
  console.log(`   Skipped: ${skipped}`)
  console.log(`   Errors: ${errors}`)
  console.log('─'.repeat(80))
}

syncMondayUsers().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
