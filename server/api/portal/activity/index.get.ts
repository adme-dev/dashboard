/**
 * Client Portal - Recent Activity
 * GET /api/portal/activity
 */

import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'

interface PortalActivityRow {
  id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown> | string | null
  created_at: string
  user_name: string | null
}

function safeDetails(details: PortalActivityRow['details']) {
  if (!details) return {}

  let parsed: Record<string, unknown>
  if (typeof details === 'object') {
    parsed = details
  } else {
    try {
      const value = JSON.parse(details)
      parsed = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    } catch {
      parsed = {}
    }
  }

  return Object.fromEntries(
    ['status', 'title']
      .filter(key => typeof parsed[key] === 'string')
      .map(key => [key, parsed[key]])
  )
}

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const requestedLimit = Number(getQuery(event).limit)
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), 100)
    : 50

  try {
    const rows = await queryRows<PortalActivityRow>(`
      SELECT
        cal.id,
        cal.action,
        cal.entity_type,
        cal.entity_id,
        cal.details,
        cal.created_at,
        CASE
          WHEN cal.action = 'agency_portal_access' THEN NULL
          ELSE cu.name
        END AS user_name
      FROM client_activity_log cal
      LEFT JOIN client_users cu
        ON cu.id = cal.client_user_id
        AND cu.client_id = cal.client_id
      WHERE cal.client_id = $1
      ORDER BY cal.created_at DESC
      LIMIT $2
    `, [clientUser.clientId, limit])

    return {
      activity: rows.map(row => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: safeDetails(row.details),
        createdAt: row.created_at,
        userName: row.action === 'agency_portal_access' ? null : row.user_name
      }))
    }
  } catch (error) {
    console.error('Failed to fetch recent portal activity:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch recent activity'
    })
  }
})
