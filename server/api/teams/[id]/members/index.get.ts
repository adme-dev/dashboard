/**
 * Get team members
 * GET /api/teams/:id/members
 */

import { getRouterParam } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryRows } from '../../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const teamId = getRouterParam(event, 'id')

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID required' })
  }

  const members = await queryRows(`
    SELECT 
      tm.id,
      tm.name,
      tm.email,
      tm.avatar_url,
      tms.role,
      tms.added_at
    FROM team_memberships tms
    JOIN team_members tm ON tms.team_member_id = tm.id
    WHERE tms.team_id = $1
    ORDER BY 
      CASE WHEN tms.role = 'admin' THEN 0 ELSE 1 END,
      tm.name
  `, [teamId])

  return { members }
})
