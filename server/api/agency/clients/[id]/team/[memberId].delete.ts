/**
 * Remove a team member assignment from a client.
 */

import { execute } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { invalidateAssignmentCache } from '~~/server/utils/clientScoping'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MANAGEMENT)

  const clientId = getRouterParam(event, 'id')
  const memberId = getRouterParam(event, 'memberId')

  if (!clientId || !memberId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID and Member ID are required' })
  }

  await execute(
    'DELETE FROM client_team_assignments WHERE client_id = $1 AND team_member_id = $2',
    [clientId, memberId]
  )

  invalidateAssignmentCache(event, memberId)

  return { ok: true }
})
