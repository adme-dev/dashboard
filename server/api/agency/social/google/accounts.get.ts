import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/google/accounts
 * Lists connected Google Ads accounts from social_connections
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const accounts = await queryRows(
    `SELECT
       sc.id,
       sc.account_id,
       sc.account_name,
       sc.status,
       sc.token_expires_at,
       sc.scopes,
       sc.metadata,
       sc.connected_by,
       sc.created_at,
       sc.updated_at,
       tm.name AS connected_by_name,
       (SELECT MAX(synced_at) FROM media_spend WHERE connection_id = sc.id) AS last_synced_at,
       (SELECT COUNT(*) FROM ad_account_client_map WHERE connection_id = sc.id) AS mapped_clients
     FROM social_connections sc
     LEFT JOIN team_members tm ON sc.connected_by = tm.id
     WHERE sc.platform = 'google'
     ORDER BY sc.account_name ASC`
  )

  return accounts.map((a: any) => ({
    id: a.id,
    accountId: a.account_id,
    accountName: a.account_name,
    status: a.status,
    tokenExpiresAt: a.token_expires_at,
    scopes: a.scopes || [],
    metadata: a.metadata || {},
    connectedBy: a.connected_by,
    connectedByName: a.connected_by_name,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    lastSyncedAt: a.last_synced_at,
    mappedClients: parseInt(a.mapped_clients, 10) || 0
  }))
})
