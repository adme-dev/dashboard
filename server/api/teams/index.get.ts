/**
 * Get all teams
 * GET /api/teams
 */

import { requireAuth } from '../../utils/auth'
import { queryRows } from '../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const teams = await queryRows(`
    SELECT 
      t.*,
      COUNT(tms.team_member_id)::INTEGER as member_count
    FROM teams t
    LEFT JOIN team_memberships tms ON t.id = tms.team_id
    WHERE t.is_active = true
    GROUP BY t.id
    ORDER BY t.is_system DESC, t.name
  `)

  return { teams }
})
