/**
 * Get team members
 * GET /api/admin/teams/:teamId/members
 */

import { requireAuth } from '../../../../utils/auth'
import { queryRows } from '../../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const teamId = getRouterParam(event, 'teamId')
  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID required' })
  }

  try {
    const members = await queryRows<{
      id: string
      name: string
      email: string
      avatar_url: string
      title: string
      role: string
      is_team_admin: boolean
      joined_at: string
    }>(`
      SELECT 
        tm.id,
        tm.name,
        tm.email,
        tm.avatar_url,
        tm.title,
        tm.role as user_role,
        tms.role = 'admin' as is_team_admin,
        tms.added_at as joined_at
      FROM team_memberships tms
      JOIN team_members tm ON tm.id = tms.team_member_id
      WHERE tms.team_id = $1 AND tm.is_active = true
      ORDER BY tm.name ASC
    `, [teamId])

    return {
      members: members.map(member => ({
        id: member.id,
        name: member.name,
        email: member.email,
        avatarUrl: member.avatar_url,
        title: member.title,
        role: member.role,
        isAdmin: member.is_team_admin,
        joinedAt: member.joined_at,
      }))
    }

  } catch (error: any) {
    console.error('[Admin Team Members] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch team members: ${error.message}`
    })
  }
})
