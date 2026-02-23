import dotenv from 'dotenv'
dotenv.config()

import { queryRows } from '../server/utils/db'

async function testTeamMembers() {
  const teamId = '00000000-0000-0000-0000-000000000001' // ADME Everyone
  
  console.log(`Testing team members for team: ${teamId}\n`)
  
  try {
    const members = await queryRows(`
      SELECT 
        tm.id,
        tm.name,
        tm.email,
        tm.avatar_url,
        tm.role as user_role,
        tms.role = 'admin' as is_team_admin,
        tms.added_at as joined_at
      FROM team_memberships tms
      JOIN team_members tm ON tm.id = tms.team_member_id
      WHERE tms.team_id = $1 AND tm.is_active = true
      ORDER BY tm.name ASC
    `, [teamId])
    
    console.log(`✅ Found ${members.length} members:`)
    members.forEach((m: any, i: number) => {
      console.log(`${i + 1}. ${m.name} (${m.email})`)
    })
    
  } catch (err: any) {
    console.error('❌ Error:', err.message)
  }
}

testTeamMembers()
