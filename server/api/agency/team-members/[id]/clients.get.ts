/**
 * List clients assigned to a team member.
 * Users can view their own assignments; management can view anyone's.
 */

import { queryRows } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { hasRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const memberId = getRouterParam(event, 'id')
  if (!memberId) {
    throw createError({ statusCode: 400, statusMessage: 'Member ID is required' })
  }

  // Users can view their own assignments; management can view anyone's
  if (memberId !== user.id && !hasRole(user, PERMISSIONS.MANAGEMENT)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const rows = await queryRows(`
    SELECT
      cta.id,
      cta.client_id,
      ac.name AS client_name,
      cta.role,
      cta.assigned_at
    FROM client_team_assignments cta
    JOIN agency_clients ac ON ac.id = cta.client_id
    WHERE cta.team_member_id = $1
    ORDER BY ac.name
  `, [memberId])

  return rows.map(r => ({
    id: r.id,
    client_id: r.client_id,
    client_name: r.client_name,
    role: r.role,
    assigned_at: r.assigned_at,
  }))
})
