import dotenv from 'dotenv'
dotenv.config()

// Simulate the API call
import { queryRows } from '../server/utils/db'

async function testAdminUsersAPI() {
  console.log('Testing admin users API...\n')
  
  try {
    const users = await queryRows<{
      id: string
      name: string
      email: string
      avatar_url: string
      role: string
      is_active: boolean
      monday_user_id: string
      created_at: string
    }>(`
      SELECT 
        tm.id,
        tm.name,
        tm.email,
        tm.avatar_url,
        tm.role,
        tm.is_active,
        tm.monday_user_id,
        tm.created_at
      FROM team_members tm
      WHERE tm.is_active = true
      ORDER BY tm.name ASC
    `)

    console.log(`✅ Found ${users.length} users in query`)

    // Get teams for each user
    const userIds = users.map(u => u.id)
    console.log(`Fetching teams for ${userIds.length} users...`)
    
    const memberships = userIds.length > 0 ? await queryRows<{
      user_id: string
      team_id: string
      team_name: string
    }>(`
      SELECT 
        tms.team_member_id as user_id,
        t.id as team_id,
        t.name as team_name
      FROM team_memberships tms
      JOIN teams t ON t.id = tms.team_id
      WHERE tms.team_member_id = ANY($1)
    `, [userIds]) : []

    console.log(`✅ Found ${memberships.length} team memberships`)

    const teamsByUser = memberships.reduce((acc, m) => {
      if (!acc[m.user_id]) acc[m.user_id] = []
      acc[m.user_id].push({ id: m.team_id, name: m.team_name })
      return acc
    }, {} as Record<string, Array<{ id: string; name: string }>>)

    const result = {
      users: users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url,
        role: user.role || 'member',
        status: user.is_active ? 'active' : 'inactive',
        mondayUserId: user.monday_user_id,
        joinedAt: user.created_at,
        teams: teamsByUser[user.id] || [],
      }))
    }

    console.log('\n✅ API Response Sample (first 3 users):')
    console.log(JSON.stringify(result.users.slice(0, 3), null, 2))
    
  } catch (error: any) {
    console.error('❌ API Error:', error.message)
  }
}

testAdminUsersAPI().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
