/**
 * List agency-visible client portal activity.
 * GET /api/agency/client-portal/activity
 */

import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

interface ClientPortalActivityRow {
  id: string
  client_id: string
  client_name: string
  client_user_id: string | null
  client_user_name: string | null
  client_user_email: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown> | string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

const parseDetails = (details: ClientPortalActivityRow['details']) => {
  if (!details) return {}
  if (typeof details === 'object') return details

  try {
    const parsed = JSON.parse(details)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export default defineEventHandler(async (event) => {
  await requireRole(event, [
    ...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])
  ])

  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId : ''
  const action = typeof query.action === 'string' ? query.action : 'agency_portal_access'
  const limit = Math.min(Number(query.limit) || 50, 200)

  const conditions: string[] = []
  const params: Array<string | number> = []
  let idx = 1

  if (clientId) {
    conditions.push(`cal.client_id = $${idx}`)
    params.push(clientId)
    idx++
  }

  if (action && action !== 'all') {
    conditions.push(`cal.action = $${idx}`)
    params.push(action)
    idx++
  }

  params.push(limit)
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const rows = await queryRows<ClientPortalActivityRow>(`
      SELECT
        cal.id,
        cal.client_id,
        c.name AS client_name,
        cal.client_user_id,
        cu.name AS client_user_name,
        cu.email AS client_user_email,
        cal.action,
        cal.entity_type,
        cal.entity_id,
        cal.details,
        cal.ip_address,
        cal.user_agent,
        cal.created_at
      FROM client_activity_log cal
      JOIN agency_clients c ON c.id = cal.client_id
      LEFT JOIN client_users cu ON cu.id = cal.client_user_id
      ${whereClause}
      ORDER BY cal.created_at DESC
      LIMIT $${idx}
    `, params)

    return {
      activity: rows.map((row) => {
        const details = parseDetails(row.details)

        return {
          id: row.id,
          clientId: row.client_id,
          clientName: row.client_name,
          clientUserId: row.client_user_id,
          clientUserName: row.client_user_name,
          clientUserEmail: row.client_user_email,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at,
          agencyUserId: typeof details.agencyUserId === 'string' ? details.agencyUserId : null,
          agencyUserEmail: typeof details.agencyUserEmail === 'string' ? details.agencyUserEmail : null,
          agencyUserRole: typeof details.agencyUserRole === 'string' ? details.agencyUserRole : null
        }
      })
    }
  } catch (error) {
    console.error('Failed to fetch client portal activity:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch client portal activity'
    })
  }
})
