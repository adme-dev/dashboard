import { requireAuth } from '~~/server/utils/auth'
import { execute, queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { findHighConfidenceClientMatch } from '~~/server/utils/socialSpendAccuracy'
import { invalidateSpendPeriodCaches } from '~~/server/utils/socialSpendCache'

type ConnectionRow = {
  id: string
  platform: string
  account_name: string | null
  connection_client_id: string | null
  spend_client_id: string | null
  spend_rows: string
}

type ClientRow = {
  id: string
  name: string
}

type PeriodRow = {
  connection_id: string
  period: string
  platform: string
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)

  const [connections, clients] = await Promise.all([
    queryRows<ConnectionRow>(
      `SELECT sc.id, sc.platform, sc.account_name, sc.client_id AS connection_client_id,
              (SELECT ms.client_id FROM media_spend ms
                 WHERE ms.connection_id = sc.id AND ms.client_id IS NOT NULL
                 LIMIT 1) AS spend_client_id,
              (SELECT COUNT(*) FROM media_spend ms WHERE ms.connection_id = sc.id)::text AS spend_rows
       FROM social_connections sc
       WHERE sc.status = 'active'
         AND sc.platform = ANY($1)
       ORDER BY sc.platform, sc.account_name`,
      [['meta', 'google', 'google_ads', 'tiktok', 'linkedin', 'pinterest', 'twitter', 'snapchat', 'microsoft_ads']]
    ),
    queryRows<ClientRow>(`SELECT id, name FROM agency_clients WHERE name IS NOT NULL ORDER BY name`),
  ])

  const staleConnectionLinks = connections.filter(conn =>
    conn.spend_client_id && conn.connection_client_id !== conn.spend_client_id
  )
  for (const conn of staleConnectionLinks) {
    await execute(
      `UPDATE social_connections SET client_id = $1, updated_at = NOW() WHERE id = $2`,
      [conn.spend_client_id, conn.id]
    )
  }

  const candidates = connections
    .filter(conn => !conn.spend_client_id && !conn.connection_client_id && Number(conn.spend_rows) > 0)
    .map(conn => {
      const match = findHighConfidenceClientMatch(conn.account_name, clients)
      return match ? { conn, match } : null
    })
    .filter(Boolean) as Array<{ conn: ConnectionRow; match: NonNullable<ReturnType<typeof findHighConfidenceClientMatch>> }>

  if (!candidates.length) {
    return { ok: true, mapped: 0, backfilled: 0, syncedConnections: staleConnectionLinks.length, items: [] }
  }

  const connectionIds = candidates.map(item => item.conn.id)
  const affectedPeriods = await queryRows<PeriodRow>(
    `SELECT DISTINCT connection_id, period, platform
       FROM media_spend
      WHERE connection_id = ANY($1)`,
    [connectionIds]
  )

  let backfilled = 0
  const items: Array<{
    connectionId: string
    platform: string
    accountName: string | null
    clientId: string
    clientName: string
    confidence: 'exact' | 'contains'
    spendRowsUpdated: number
  }> = []

  for (const { conn, match } of candidates) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM ad_account_client_map
       WHERE connection_id = $1
         AND COALESCE(campaign_id, '') = ''
         AND COALESCE(campaign_name_pattern, '') = ''
       LIMIT 1`,
      [conn.id]
    )
    if (existing) {
      await execute(
        `UPDATE ad_account_client_map SET xero_client_name = $1, xero_client_code = NULL WHERE id = $2`,
        [match.clientName, existing.id]
      )
    } else {
      await execute(
        `INSERT INTO ad_account_client_map (connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code)
         VALUES ($1, NULL, NULL, $2, NULL)`,
        [conn.id, match.clientName]
      )
    }
    await execute(
      `UPDATE social_connections SET client_id = $1, updated_at = NOW() WHERE id = $2`,
      [match.clientId, conn.id]
    )
    const updated = await execute(
      `UPDATE media_spend SET client_id = $1, updated_at = NOW() WHERE connection_id = $2`,
      [match.clientId, conn.id]
    )
    backfilled += Number(updated) || 0
    items.push({
      connectionId: conn.id,
      platform: conn.platform,
      accountName: conn.account_name,
      clientId: match.clientId,
      clientName: match.clientName,
      confidence: match.confidence,
      spendRowsUpdated: Number(updated) || 0,
    })
  }

  const uniqueCacheKeys = new Set<string>()
  await Promise.all(affectedPeriods.map(row => {
    const key = `${row.period}:${row.platform}`
    if (uniqueCacheKeys.has(key)) return Promise.resolve()
    uniqueCacheKeys.add(key)
    return invalidateSpendPeriodCaches(event, { period: row.period, platform: row.platform, tenantId })
  }))

  return {
    ok: true,
    mapped: items.length,
    backfilled,
    syncedConnections: staleConnectionLinks.length,
    items,
  }
})
