import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/google/profiles
 * Safe agency read model for Google login identities. Credential bytes and
 * OAuth attempt data are intentionally absent from both SQL and response.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  interface GoogleProfileReadRow {
    id: string
    label: string
    status: string
    token_expires_at: string | null
    scopes: string[] | null
    metadata: Record<string, unknown> | null
    connected_by: string
    connected_by_name: string | null
    last_authorized_at: string
    created_at: string
    updated_at: string
    account_count: string
    has_refresh_token: boolean
  }

  const rows = await queryRows<GoogleProfileReadRow>(
    `SELECT gcp.id, gcp.label, gcp.status, gcp.token_expires_at,
            gcp.scopes, gcp.metadata, gcp.connected_by,
            gcp.last_authorized_at, gcp.created_at, gcp.updated_at,
            tm.name AS connected_by_name,
            COUNT(gcpa.connection_id)::text AS account_count,
            (gcp.refresh_token_encrypted IS NOT NULL) AS has_refresh_token
     FROM google_credential_profiles gcp
     LEFT JOIN google_credential_profile_accounts gcpa ON gcpa.profile_id = gcp.id
     LEFT JOIN team_members tm ON tm.id = gcp.connected_by
     GROUP BY gcp.id, tm.name
     ORDER BY gcp.last_authorized_at DESC`
  )

  return rows.map(row => ({
    id: row.id,
    label: row.label,
    status: row.status,
    tokenExpiresAt: row.token_expires_at,
    scopes: row.scopes || [],
    metadata: row.metadata || {},
    connectedBy: row.connected_by,
    connectedByName: row.connected_by_name || null,
    lastAuthorizedAt: row.last_authorized_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accountCount: Number.parseInt(row.account_count, 10) || 0,
    hasRefreshToken: row.has_refresh_token === true
  }))
})
