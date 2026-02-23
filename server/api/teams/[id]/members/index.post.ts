/**
 * Add member to team
 * POST /api/teams/:id/members
 */

import { getRouterParam } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryOne } from '../../../../utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const teamId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID required' })
  }

  if (!body.teamMemberId) {
    throw createError({ statusCode: 400, statusMessage: 'Member ID required' })
  }

  try {
    await queryOne(`
      INSERT INTO team_memberships (team_id, team_member_id, role, added_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (team_id, team_member_id) DO UPDATE SET role = $3
    `, [teamId, body.teamMemberId, body.role || 'member', user.id])

    return { success: true }
  } catch (err) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to add member' })
  }
})
