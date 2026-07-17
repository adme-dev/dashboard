import { createError, type H3Event } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const MANAGEMENT_ROLES = ['owner', 'admin', 'lead', 'project_manager'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function requireMeasurementClientAccess(
  event: H3Event,
  clientId: string | undefined,
  _permission: 'view' | 'configure'
) {
  const user = await requirePermission(event, 'MEDIA_BUYING')
  if (!clientId || !UUID_RE.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client ID' })
  }

  if ((MANAGEMENT_ROLES as readonly string[]).includes(user.role)) return user

  const assignment = await queryOne(
    `SELECT 1
       FROM client_team_assignments
      WHERE client_id = $1
        AND team_member_id = $2
      LIMIT 1`,
    [clientId, user.id]
  )
  if (!assignment) {
    throw createError({ statusCode: 404, statusMessage: 'Measurement profile not found' })
  }
  return user
}
