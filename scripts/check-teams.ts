import dotenv from 'dotenv'
dotenv.config()

import { queryRows } from '../server/utils/db'

async function checkTeams() {
  console.log('Checking all teams and their members...\n')
  
  const teams = await queryRows(`
    SELECT t.id, t.name, t.is_system
    FROM teams t
    WHERE t.is_active = true
    ORDER BY t.name
  `)
  
  for (const team of teams) {
    const members = await queryRows(`
      SELECT tm.name, tm.email
      FROM team_memberships tms
      JOIN team_members tm ON tm.id = tms.team_member_id
      WHERE tms.team_id = $1 AND tm.is_active = true
      ORDER BY tm.name
    `, [team.id])
    
    console.log(`${team.name} (${members.length} members)`)
    if (members.length > 0) {
      members.forEach((m: any) => {
        console.log(`  - ${m.name}`)
      })
    } else {
      console.log(`  (empty)`)
    }
    console.log('')
  }
}

checkTeams().catch(console.error)
