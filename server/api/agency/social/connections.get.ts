import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { classifyConnectionHealth } from '~~/server/utils/connectionHealth'

export default eventHandler(async (event) => {
  await requireAuth(event)

  try {
    const rows = await queryRows<any>(
      `SELECT sc.id, sc.platform, sc.account_id, sc.account_name, sc.status,
              COALESCE(gcp.token_expires_at, sc.token_expires_at) AS effective_token_expires_at,
              sc.refresh_token, (gcp.refresh_token_encrypted IS NOT NULL) AS profile_has_refresh_token,
              sc.scopes, sc.metadata,
              sc.google_credential_profile_id,
              sc.connected_by, sc.created_at, sc.updated_at,
              tm.name as connected_by_name,
              (SELECT MAX(ms.synced_at) FROM media_spend ms WHERE ms.connection_id = sc.id) as last_synced_at
       FROM social_connections sc
       LEFT JOIN google_credential_profiles gcp ON gcp.id = sc.google_credential_profile_id
       LEFT JOIN team_members tm ON sc.connected_by::uuid = tm.id
       ORDER BY sc.platform, sc.created_at DESC`
    )

    return rows.map((r: any) => {
      const { health, daysUntilExpiry } = classifyConnectionHealth({
        status: r.status,
        tokenExpiresAt: r.effective_token_expires_at,
        refreshToken: r.profile_has_refresh_token ? 'profile-refresh-available' : r.refresh_token,
        lastSyncedAt: r.last_synced_at,
      })
      return {
        id: r.id,
        platform: r.platform,
        accountId: r.account_id,
        accountName: r.account_name,
        status: r.status,
        tokenExpiresAt: r.effective_token_expires_at,
        scopes: r.scopes ? (typeof r.scopes === 'string' ? JSON.parse(r.scopes) : r.scopes) : [],
        metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null,
        connectedBy: r.connected_by,
        connectedByName: r.connected_by_name || null,
        lastSyncedAt: r.last_synced_at || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        credentialProfileId: r.google_credential_profile_id || null,
        health,
        daysUntilExpiry,
      }
    })
  } catch (err: any) {
    if (err.message?.includes('does not exist') || err.code === '42P01') {
      return []
    }
    throw err
  }
})
