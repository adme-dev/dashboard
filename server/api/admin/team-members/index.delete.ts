/**
 * Remove member from team
 * DELETE /api/admin/team-members
 */

import { requireAuth } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { teamId, userId } = body

  if (!teamId || !userId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID and user ID required' })
  }

  try {
    await queryOne(`
      DELETE FROM team_memberships
      WHERE team_id = $1 AND team_member_id = $2
    `, [teamId, userId])

    return { success: true }

  } catch (error: any) {
    console.error('[Admin Team Members Remove] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to remove team member: ${error.message}`
    })
  }
})
