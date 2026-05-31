// server/utils/ga4Sync.ts
/**
 * Pull daily GA4 channel metrics for every mapped property and upsert into
 * ga4_daily_channel. Mirrors spendSync's structure: load mappings + tokens,
 * refresh if expiring, runReport, upsert. The lookback window re-pulls recent
 * days because GA4 reprocesses data for ~48h.
 */
import { queryRows, execute } from './db'
import { refreshGoogleToken } from './googleAdsClient'
import { ga4RunReport } from './ga4Client'

export interface Ga4SyncResult {
  propertiesSynced: number
  rowsUpserted: number
  errors: string[]
}

interface MapRow {
  property_id: string
  client_id: string
  connection_id: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

export async function syncGa4(
  opts: { clientId?: string; lookbackDays?: number } = {}
): Promise<Ga4SyncResult> {
  const { clientId, lookbackDays = 14 } = opts
  const config = useRuntimeConfig()
  const result: Ga4SyncResult = { propertiesSynced: 0, rowsUpserted: 0, errors: [] }

  const params: unknown[] = []
  let where = `c.platform = 'ga4' AND c.status = 'active'`
  if (clientId) { params.push(clientId); where += ` AND m.client_id = $${params.length}` }

  const maps = await queryRows<MapRow>(
    `SELECT m.property_id, m.client_id, m.connection_id,
            c.access_token, c.refresh_token, c.token_expires_at
     FROM ga4_property_map m
     JOIN social_connections c ON c.id = m.connection_id
     WHERE ${where}`,
    params
  )

  const startDate = isoDaysAgo(lookbackDays)
  const endDate = isoDaysAgo(0)

  // Accumulate per-connection outcome so the status row reflects the whole run
  // (one connection can map multiple properties).
  const perConnection = new Map<string, { rows: number; error: string | null }>()
  const noteConnection = (id: string, patch: { rows?: number; error?: string | null }) => {
    const cur = perConnection.get(id) || { rows: 0, error: null }
    if (patch.rows) cur.rows += patch.rows
    if (patch.error !== undefined) cur.error = patch.error
    perConnection.set(id, cur)
  }

  for (const map of maps) {
    if (!perConnection.has(map.connection_id)) perConnection.set(map.connection_id, { rows: 0, error: null })
    try {
      let token = map.access_token
      if (map.refresh_token && map.token_expires_at &&
          new Date(map.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
        const refreshed = await refreshGoogleToken(map.refresh_token, config.googleClientId, config.googleClientSecret)
        token = refreshed.access_token
        await execute(
          `UPDATE social_connections SET access_token=$1, token_expires_at=$2, updated_at=NOW() WHERE id=$3`,
          [token, new Date(Date.now() + (refreshed.expires_in || 3600) * 1000), map.connection_id]
        )
      }

      const rows = await ga4RunReport(map.property_id, token, { startDate, endDate })
      for (const row of rows) {
        await execute(
          `INSERT INTO ga4_daily_channel
             (connection_id, client_id, property_id, metric_date, channel_group,
              sessions, total_users, new_users, engaged_sessions, engagement_rate,
              avg_session_duration, key_events, purchase_revenue, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
           ON CONFLICT (connection_id, metric_date, channel_group)
           DO UPDATE SET
             sessions = EXCLUDED.sessions,
             total_users = EXCLUDED.total_users,
             new_users = EXCLUDED.new_users,
             engaged_sessions = EXCLUDED.engaged_sessions,
             engagement_rate = EXCLUDED.engagement_rate,
             avg_session_duration = EXCLUDED.avg_session_duration,
             key_events = EXCLUDED.key_events,
             purchase_revenue = EXCLUDED.purchase_revenue,
             synced_at = NOW()`,
          [
            map.connection_id, map.client_id, map.property_id, row.date, row.channelGroup,
            row.sessions, row.totalUsers, row.newUsers, row.engagedSessions, row.engagementRate,
            row.avgSessionDuration, row.keyEvents, row.purchaseRevenue
          ]
        )
        result.rowsUpserted++
        noteConnection(map.connection_id, { rows: 1 })
      }
      result.propertiesSynced++
    } catch (err: any) {
      const message = `property ${map.property_id}: ${err.message || err}`
      result.errors.push(message)
      noteConnection(map.connection_id, { error: message })
    }
  }

  // Persist per-connection sync status (last run/success/error + rows).
  for (const [connectionId, outcome] of perConnection) {
    await execute(
      `INSERT INTO ga4_sync_status (connection_id, last_run_at, last_success_at, last_error, rows_upserted, updated_at)
       VALUES ($1, NOW(), $2, $3, $4, NOW())
       ON CONFLICT (connection_id) DO UPDATE SET
         last_run_at = NOW(),
         last_success_at = CASE WHEN $3 IS NULL THEN NOW() ELSE ga4_sync_status.last_success_at END,
         last_error = $3,
         rows_upserted = $4,
         updated_at = NOW()`,
      [connectionId, outcome.error ? null : new Date(), outcome.error, outcome.rows]
    )
  }

  return result
}
