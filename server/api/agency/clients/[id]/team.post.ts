/**
 * Add or update a team member assignment for a client.
 * Upserts: if the member is already assigned, updates their role.
 */

import { queryOne } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { invalidateAssignmentCache } from '~~/server/utils/clientScoping'

const VALID_ROLES = ['primary_am', 'secondary_am', 'support']

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.MANAGEMENT)

  const clientId = getRouterParam(event, 'id')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  const body = await readBody(event)
  if (!body?.teamMemberId) {
    throw createError({ statusCode: 400, statusMessage: 'teamMemberId is required' })
  }

  const role = body.role || 'primary_am'
  if (!VALID_ROLES.includes(role)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
    })
  }

  const row = await queryOne(`
    INSERT INTO client_team_assignments (client_id, team_member_id, role, assigned_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (client_id, team_member_id)
    DO UPDATE SET role = EXCLUDED.role, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
    RETURNING id
  `, [clientId, body.teamMemberId, role, user.id])

  invalidateAssignmentCache(event, body.teamMemberId)

  return { ok: true, id: row.id }
})
