/**
 * Remove member from team
 * DELETE /api/teams/:id/members/:memberId
 */

import { getRouterParam } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryOne } from '../../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const teamId = getRouterParam(event, 'id')
  const memberId = getRouterParam(event, 'memberId')

  if (!teamId || !memberId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID and Member ID required' })
  }

  await queryOne(`
    DELETE FROM team_memberships 
    WHERE team_id = $1 AND team_member_id = $2
  `, [teamId, memberId])

  return { success: true }
})
