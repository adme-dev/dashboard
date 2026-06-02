/**
 * List analytics export tokens (metadata only — never the hash/plaintext).
 * GET /api/agency/analytics/export-tokens
 */
import { queryRows } from '~~/server/utils/db'
import { requireRole, hasRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  // Symmetric with revoke: you see your own tokens; admins (incl. custom admin roles) see all.
  const isAdmin = hasRole(user, PERMISSIONS.ADMIN)
  const rows = await queryRows<{
    id: string
    label: string
    client_id: string | null
    client_name: string | null
    created_at: string
    last_used_at: string | null
    revoked_at: string | null
  }>(
    `SELECT t.id, t.label, t.client_id::text AS client_id, c.name AS client_name,
            t.created_at, t.last_used_at, t.revoked_at
     FROM analytics_export_tokens t
     LEFT JOIN agency_clients c ON c.id = t.client_id
     WHERE (t.created_by = $1 OR $2::boolean)
     ORDER BY t.created_at DESC`,
    [user.id, isAdmin]
  )
  return { tokens: rows }
})
