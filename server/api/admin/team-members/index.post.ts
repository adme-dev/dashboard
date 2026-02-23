/**
 * Add members to team
 * POST /api/admin/team-members
 */

import { requireAuth } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { teamId, userIds, role = 'member' } = body

  if (!teamId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID and user IDs required' })
  }

  try {
    const results = []
    for (const userId of userIds) {
      const membership = await queryOne(`
        INSERT INTO team_memberships (team_id, team_member_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (team_id, team_member_id) DO UPDATE SET role = $3
        RETURNING team_id, team_member_id, role
      `, [teamId, userId, role])
      results.push(membership)
    }

    return {
      success: true,
      added: results.length
    }

  } catch (error: any) {
    console.error('[Admin Team Members Add] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to add team members: ${error.message}`
    })
  }
})
