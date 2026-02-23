import dotenv from 'dotenv'
dotenv.config()

import { queryRows } from '../server/utils/db'

async function verifyUsers() {
  console.log('Checking database for users...\n')
  
  const users = await queryRows(`
    SELECT id, name, email, monday_user_id, is_active, role
    FROM team_members
    ORDER BY name
  `)
  
  console.log(`Found ${users.length} users in database:\n`)
  console.log('─'.repeat(80))
  users.forEach((u: any, i: number) => {
    console.log(`${i + 1}. ${u.name} <${u.email}>`)
    console.log(`   ID: ${u.id}`)
    console.log(`   Monday ID: ${u.monday_user_id || 'null'}`)
    console.log(`   Active: ${u.is_active}, Role: ${u.role}`)
    console.log('')
  })
  console.log('─'.repeat(80))
  
  // Check team memberships
  console.log('\n\nChecking team memberships...')
  const memberships = await queryRows(`
    SELECT t.name as team_name, tm.name as user_name
    FROM team_memberships tms
    JOIN teams t ON t.id = tms.team_id
    JOIN team_members tm ON tm.id = tms.team_member_id
    WHERE t.name = 'ADME Everyone'
    ORDER BY tm.name
  `)
  
  console.log(`\nADME Everyone team has ${memberships.length} members:`)
  memberships.forEach((m: any) => {
    console.log(`  - ${m.user_name}`)
  })
}

verifyUsers().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
