/**
 * List team members assigned to a client.
 * Returns assignments with member details, ordered by role priority.
 */

import { queryRows } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CLIENTS)

  const clientId = getRouterParam(event, 'id')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  const rows = await queryRows(`
    SELECT
      cta.id,
      cta.team_member_id,
      tm.name AS member_name,
      tm.email AS member_email,
      tm.avatar_url AS member_avatar,
      cta.role,
      cta.assigned_at,
      ab.name AS assigned_by_name
    FROM client_team_assignments cta
    JOIN team_members tm ON tm.id = cta.team_member_id
    LEFT JOIN team_members ab ON ab.id = cta.assigned_by
    WHERE cta.client_id = $1
    ORDER BY
      CASE cta.role
        WHEN 'primary_am' THEN 1
        WHEN 'secondary_am' THEN 2
        WHEN 'support' THEN 3
        ELSE 4
      END,
      cta.assigned_at
  `, [clientId])

  return rows.map(r => ({
    id: r.id,
    team_member_id: r.team_member_id,
    member_name: r.member_name,
    member_email: r.member_email,
    member_avatar: r.member_avatar,
    role: r.role,
    assigned_at: r.assigned_at,
    assigned_by_name: r.assigned_by_name,
  }))
})
