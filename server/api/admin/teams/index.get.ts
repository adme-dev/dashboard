/**
 * Get all teams for admin
 * GET /api/admin/teams
 */

import { requireRole } from '../../../utils/auth'
import { queryRows } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  try {
    const teams = await queryRows<{
      id: string
      name: string
      color: string
      icon: string
      is_system: boolean
      created_at: string
      member_count: number
    }>(`
      SELECT 
        t.id,
        t.name,
        t.color,
        t.icon,
        t.is_system,
        t.created_at,
        COUNT(tms.team_member_id)::int as member_count
      FROM teams t
      LEFT JOIN team_memberships tms ON tms.team_id = t.id
      GROUP BY t.id, t.name, t.color, t.icon, t.is_system, t.created_at
      ORDER BY t.is_system DESC, t.name ASC
    `)

    return {
      teams: teams.map(team => ({
        id: team.id,
        name: team.name,
        color: team.color,
        icon: team.icon,
        isSystem: team.is_system,
        memberCount: team.member_count,
        createdAt: team.created_at,
      }))
    }

  } catch (error: any) {
    console.error('[Admin Teams] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch teams: ${error.message}`
    })
  }
})
