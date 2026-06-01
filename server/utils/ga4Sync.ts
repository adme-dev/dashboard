// server/utils/ga4Sync.ts
/**
 * Pull daily GA4 channel metrics for every mapped property and upsert into
 * ga4_daily_channel. Mirrors spendSync's structure: load mappings + tokens,
 * refresh if expiring, runReport, upsert. The lookback window re-pulls recent
 * days because GA4 reprocesses data for ~48h.
 */
import { queryRows, execute } from './db'
import { refreshGoogleToken } from './googleAdsClient'
import { ga4RunReport, type Ga4ReportRow } from './ga4Client'

/** Max GA4 property report fetches in flight at once. Kept ≤6 to respect
 *  Cloudflare's per-invocation simultaneous-connection cap. */
export const GA4_FETCH_CONCURRENCY = 6

/** Rows per multi-row upsert statement. 13 params/row, far under PG's 65535. */
export const GA4_UPSERT_CHUNK = 500
const GA4_UPSERT_COLS = 13

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Run `fn` over `items` with at most `limit` in flight, preserving input order.
 * `fn` should not throw — callers fold per-item errors into the result.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Build a single multi-row upsert into ga4_daily_channel for one property's
 * rows. Replaces the old row-by-row INSERT loop (the prime cause of the cron
 * timeout: ~3,900 sequential round-trips became ~1 statement per property).
 */
export function buildGa4ChannelUpsert(
  map: { connection_id: string, client_id: string, property_id: string },
  rows: Ga4ReportRow[]
): { text: string, values: unknown[] } {
  const values: unknown[] = []
  const tuples = rows.map((row, i) => {
    const b = i * GA4_UPSERT_COLS
    values.push(
      map.connection_id, map.client_id, map.property_id, row.date, row.channelGroup,
      row.sessions, row.totalUsers, row.newUsers, row.engagedSessions, row.engagementRate,
      row.avgSessionDuration, row.keyEvents, row.purchaseRevenue
    )
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},`
      + `$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},NOW())`
  })
  const text = `INSERT INTO ga4_daily_channel
       (connection_id, client_id, property_id, metric_date, channel_group,
        sessions, total_users, new_users, engaged_sessions, engagement_rate,
        avg_session_duration, key_events, purchase_revenue, synced_at)
     VALUES ${tuples.join(',')}
     ON CONFLICT (connection_id, property_id, metric_date, channel_group)
     DO UPDATE SET
       sessions = EXCLUDED.sessions,
       total_users = EXCLUDED.total_users,
       new_users = EXCLUDED.new_users,
       engaged_sessions = EXCLUDED.engaged_sessions,
       engagement_rate = EXCLUDED.engagement_rate,
       avg_session_duration = EXCLUDED.avg_session_duration,
       key_events = EXCLUDED.key_events,
       purchase_revenue = EXCLUDED.purchase_revenue,
       synced_at = NOW()`
  return { text, values }
}

export interface Ga4SyncResult {
  propertiesSynced: number
  rowsUpserted: number
  errors: string[]
}

export interface MapRow {
  property_id: string
  client_id: string
  connection_id: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
}

/** Load active GA4 property→client mappings (optionally scoped to one client). */
export async function loadGa4Maps(clientId?: string): Promise<MapRow[]> {
  const params: unknown[] = []
  let where = `c.platform = 'ga4' AND c.status = 'active'`
  if (clientId) {
    params.push(clientId)
    where += ` AND m.client_id = $${params.length}`
  }
  return queryRows<MapRow>(
    `SELECT m.property_id, m.client_id, m.connection_id,
            c.access_token, c.refresh_token, c.token_expires_at
     FROM ga4_property_map m
     JOIN social_connections c ON c.id = m.connection_id
     WHERE ${where}`,
    params
  )
}

/** Return a valid access token for a mapping, refreshing + persisting if it's near expiry. */
export async function ensureFreshGa4Token(
  map: MapRow,
  config: { googleClientId: string, googleClientSecret: string }
): Promise<string> {
  if (
    map.refresh_token && map.token_expires_at
    && new Date(map.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000
  ) {
    const refreshed = await refreshGoogleToken(map.refresh_token, config.googleClientId, config.googleClientSecret)
    await execute(
      `UPDATE social_connections SET access_token=$1, token_expires_at=$2, updated_at=NOW() WHERE id=$3`,
      [refreshed.access_token, new Date(Date.now() + (refreshed.expires_in || 3600) * 1000), map.connection_id]
    )
    return refreshed.access_token
  }
  return map.access_token
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/** Subtract n days from an ISO YYYY-MM-DD date (UTC), returning YYYY-MM-DD. */
function subDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Minimum trailing window (days) re-pulled every run — GA4 restates ~48h of data. */
export const GA4_TRAILING_RESYNC_DAYS = 2

/**
 * Resolve the GA4 report window. An explicit startDate+endDate is used verbatim
 * (arbitrary backfill). Otherwise the window ends today and reaches back
 * `lookbackDays`, floored at GA4_TRAILING_RESYNC_DAYS so every run always
 * overwrites the trailing ~48h GA4 keeps restating. Pure + injectable `today`
 * for testing.
 */
export function ga4SyncWindow(
  opts: { startDate?: string, endDate?: string, lookbackDays?: number, today?: string } = {}
): { startDate: string, endDate: string } {
  if (opts.startDate && opts.endDate) {
    return { startDate: opts.startDate, endDate: opts.endDate }
  }
  const endDate = opts.today ?? isoDaysAgo(0)
  const lookback = Math.max(opts.lookbackDays ?? 14, GA4_TRAILING_RESYNC_DAYS)
  return { startDate: subDaysIso(endDate, lookback), endDate }
}

export async function syncGa4(
  opts: { clientId?: string, lookbackDays?: number, startDate?: string, endDate?: string } = {}
): Promise<Ga4SyncResult> {
  const { clientId } = opts
  const config = useRuntimeConfig()
  const result: Ga4SyncResult = { propertiesSynced: 0, rowsUpserted: 0, errors: [] }

  const maps = await loadGa4Maps(clientId)

  const { startDate, endDate } = ga4SyncWindow(opts)

  // Per-connection outcome so the status row reflects the whole run
  // (one connection can map many properties).
  const perConnection = new Map<string, { rows: number, error: string | null }>()
  for (const map of maps) {
    if (!perConnection.has(map.connection_id)) perConnection.set(map.connection_id, { rows: 0, error: null })
  }
  const noteConnection = (id: string, patch: { rows?: number, error?: string | null }) => {
    const cur = perConnection.get(id) || { rows: 0, error: null }
    if (patch.rows) cur.rows += patch.rows
    if (patch.error !== undefined) cur.error = patch.error
    perConnection.set(id, cur)
  }

  // 1. Refresh the access token ONCE per distinct connection. All of a
  //    connection's property maps share its token; the old per-property refresh
  //    fired dozens of redundant OAuth calls per run.
  const tokenByConnection = new Map<string, string>()
  const firstMapForConnection = new Map<string, MapRow>()
  for (const map of maps) {
    if (!firstMapForConnection.has(map.connection_id)) firstMapForConnection.set(map.connection_id, map)
  }
  for (const [connectionId, map] of firstMapForConnection) {
    try {
      tokenByConnection.set(connectionId, await ensureFreshGa4Token(map, config))
    } catch (err) {
      const message = `connection ${connectionId} token refresh: ${errMsg(err)}`
      result.errors.push(message)
      noteConnection(connectionId, { error: message })
    }
  }

  // 2. Fetch every property's report with bounded concurrency. 87 sequential
  //    report fetches was the dominant cause of the cron timeout.
  type Fetched = { map: MapRow, rows: Ga4ReportRow[] | null, error: string | null }
  const fetched = await mapWithConcurrency<MapRow, Fetched>(maps, GA4_FETCH_CONCURRENCY, async (map) => {
    const token = tokenByConnection.get(map.connection_id)
    if (!token) return { map, rows: null, error: null } // connection token already failed (recorded above)
    try {
      const rows = await ga4RunReport(map.property_id, token, { startDate, endDate })
      return { map, rows, error: null }
    } catch (err) {
      return { map, rows: null, error: `property ${map.property_id}: ${errMsg(err)}` }
    }
  })

  // 3. Upsert sequentially (the prod pg.Client can't take concurrent queries),
  //    one batched multi-row statement per property instead of row-by-row.
  for (const f of fetched) {
    if (f.error) {
      result.errors.push(f.error)
      noteConnection(f.map.connection_id, { error: f.error })
      continue
    }
    if (!f.rows) continue
    try {
      for (let i = 0; i < f.rows.length; i += GA4_UPSERT_CHUNK) {
        const { text, values } = buildGa4ChannelUpsert(f.map, f.rows.slice(i, i + GA4_UPSERT_CHUNK))
        await execute(text, values)
      }
      result.rowsUpserted += f.rows.length
      noteConnection(f.map.connection_id, { rows: f.rows.length })
      result.propertiesSynced++
    } catch (err) {
      const message = `property ${f.map.property_id} upsert: ${errMsg(err)}`
      result.errors.push(message)
      noteConnection(f.map.connection_id, { error: message })
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
