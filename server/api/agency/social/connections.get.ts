import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  try {
    const rows = await queryRows<any>(
      `SELECT sc.id, sc.platform, sc.account_id, sc.account_name, sc.status,
              sc.token_expires_at, sc.scopes, sc.metadata, sc.connected_by,
              sc.created_at, sc.updated_at,
              tm.name as connected_by_name,
              (SELECT MAX(ms.synced_at) FROM media_spend ms WHERE ms.connection_id = sc.id) as last_synced_at
       FROM social_connections sc
       LEFT JOIN team_members tm ON sc.connected_by::uuid = tm.id
       ORDER BY sc.platform, sc.created_at DESC`
    )

    return rows.map((r: any) => ({
      id: r.id,
      platform: r.platform,
      accountId: r.account_id,
      accountName: r.account_name,
      status: r.status,
      tokenExpiresAt: r.token_expires_at,
      scopes: r.scopes ? (typeof r.scopes === 'string' ? JSON.parse(r.scopes) : r.scopes) : [],
      metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null,
      connectedBy: r.connected_by,
      connectedByName: r.connected_by_name || null,
      lastSyncedAt: r.last_synced_at || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  } catch (err: any) {
    // Table may not exist if migration 008 hasn't been run
    if (err.message?.includes('does not exist') || err.code === '42P01') {
      return []
    }
    throw err
  }
})
