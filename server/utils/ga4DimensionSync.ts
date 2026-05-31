// server/utils/ga4DimensionSync.ts
/**
 * Pull richer GA4 breakdowns (source/medium, campaign, device, landing page,
 * country) + event-level conversions for mapped properties, via batchRunReports
 * (≤5 reports/call) with quota self-throttle and retry/backoff. Upserts into
 * ga4_daily_dimension / ga4_daily_event (migration 127).
 *
 * Runs in its OWN cron invocation (separate subrequest budget from the channel
 * sync) and:
 *   - batches upserts into chunked multi-row INSERTs (≈100× fewer DB calls than
 *     per-row writes — the original per-row loop blew Cloudflare's per-invocation
 *     subrequest cap), and
 *   - processes only the `maxProperties` stalest properties per run, cursoring by
 *     each property's last dimension sync, so all properties converge over runs.
 */
import { queryRows, execute } from './db'
import {
  GA4_DIMENSIONS,
  buildGa4DimensionRequest,
  buildGa4EventRequest,
  parseGa4DimensionReport,
  parseGa4EventReport,
  ga4BatchRunReports,
  quotaShouldThrottle,
  type Ga4DimensionType
} from './ga4Client'
import { ensureFreshGa4Token, ga4SyncWindow, type MapRow } from './ga4Sync'

export interface Ga4DimensionSyncResult {
  propertiesSynced: number
  dimensionRowsUpserted: number
  eventRowsUpserted: number
  throttled: boolean
  errors: string[]
}

const DIMENSION_TYPES = Object.keys(GA4_DIMENSIONS) as Ga4DimensionType[]
const UPSERT_CHUNK = 200
const DEFAULT_MAX_PROPERTIES = 25

interface DimRow {
  connection_id: string
  client_id: string | null
  property_id: string
  date: string
  dimension_type: string
  dimension_value: string
  sessions: number
  total_users: number
  new_users: number
  engaged_sessions: number
  engagement_rate: number
  avg_session_duration: number
  key_events: number
  purchase_revenue: number
}

interface EvtRow {
  connection_id: string
  client_id: string | null
  property_id: string
  date: string
  event_name: string
  event_count: number
  event_value: number
}

/** Load the `limit` properties whose dimension data is stalest (never-synced first). */
async function loadStaleDimensionMaps(clientId: string | undefined, limit: number): Promise<MapRow[]> {
  const params: unknown[] = []
  let where = `c.platform = 'ga4' AND c.status = 'active'`
  if (clientId) {
    params.push(clientId)
    where += ` AND m.client_id = $${params.length}`
  }
  params.push(limit)
  return queryRows<MapRow>(
    `SELECT m.property_id, m.client_id, m.connection_id,
            c.access_token, c.refresh_token, c.token_expires_at
     FROM ga4_property_map m
     JOIN social_connections c ON c.id = m.connection_id
     LEFT JOIN LATERAL (
       SELECT MAX(d.synced_at) AS last_sync FROM ga4_daily_dimension d WHERE d.property_id = m.property_id
     ) s ON TRUE
     WHERE ${where}
     ORDER BY s.last_sync ASC NULLS FIRST
     LIMIT $${params.length}`,
    params
  )
}

/** Chunked multi-row upsert into ga4_daily_dimension. */
async function flushDimensionRows(rows: DimRow[]): Promise<number> {
  let upserted = 0
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK)
    const params: unknown[] = []
    const tuples = chunk.map((r) => {
      const b = params.length
      params.push(
        r.connection_id, r.client_id, r.property_id, r.date, r.dimension_type, r.dimension_value,
        r.sessions, r.total_users, r.new_users, r.engaged_sessions, r.engagement_rate,
        r.avg_session_duration, r.key_events, r.purchase_revenue
      )
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},NOW())`
    })
    await execute(
      `INSERT INTO ga4_daily_dimension
         (connection_id, client_id, property_id, metric_date, dimension_type, dimension_value,
          sessions, total_users, new_users, engaged_sessions, engagement_rate,
          avg_session_duration, key_events, purchase_revenue, synced_at)
       VALUES ${tuples.join(',')}
       ON CONFLICT (connection_id, property_id, metric_date, dimension_type, dimension_value)
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
      params
    )
    upserted += chunk.length
  }
  return upserted
}

/** Chunked multi-row upsert into ga4_daily_event. */
async function flushEventRows(rows: EvtRow[]): Promise<number> {
  let upserted = 0
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK)
    const params: unknown[] = []
    const tuples = chunk.map((r) => {
      const b = params.length
      params.push(r.connection_id, r.client_id, r.property_id, r.date, r.event_name, r.event_count, r.event_value)
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},NOW())`
    })
    await execute(
      `INSERT INTO ga4_daily_event
         (connection_id, client_id, property_id, metric_date, event_name, event_count, event_value, synced_at)
       VALUES ${tuples.join(',')}
       ON CONFLICT (connection_id, property_id, metric_date, event_name)
       DO UPDATE SET
         event_count = EXCLUDED.event_count,
         event_value = EXCLUDED.event_value,
         synced_at = NOW()`,
      params
    )
    upserted += chunk.length
  }
  return upserted
}

export async function syncGa4Dimensions(
  opts: { clientId?: string, lookbackDays?: number, startDate?: string, endDate?: string, maxProperties?: number } = {}
): Promise<Ga4DimensionSyncResult> {
  const config = useRuntimeConfig()
  const result: Ga4DimensionSyncResult = {
    propertiesSynced: 0, dimensionRowsUpserted: 0, eventRowsUpserted: 0, throttled: false, errors: []
  }

  const maxProperties = opts.maxProperties ?? DEFAULT_MAX_PROPERTIES
  const maps = await loadStaleDimensionMaps(opts.clientId, maxProperties)
  const { startDate, endDate } = ga4SyncWindow(opts)

  for (const map of maps) {
    if (result.throttled) break
    try {
      const token = await ensureFreshGa4Token(map, config)

      const requests = [
        ...DIMENSION_TYPES.map(d => buildGa4DimensionRequest(d, startDate, endDate)),
        buildGa4EventRequest(startDate, endDate)
      ]
      const { reports, quota } = await ga4BatchRunReports(map.property_id, token, requests)

      // Buffer this property's rows, then flush in chunked multi-row upserts.
      const dimRows: DimRow[] = []
      for (let i = 0; i < DIMENSION_TYPES.length; i++) {
        const dimType = DIMENSION_TYPES[i]
        const rows = reports[i] ? parseGa4DimensionReport(reports[i]) : []
        for (const row of rows) {
          dimRows.push({
            connection_id: map.connection_id,
            client_id: map.client_id,
            property_id: map.property_id,
            date: row.date,
            dimension_type: dimType,
            dimension_value: row.dimensionValue,
            sessions: row.sessions,
            total_users: row.totalUsers,
            new_users: row.newUsers,
            engaged_sessions: row.engagedSessions,
            engagement_rate: row.engagementRate,
            avg_session_duration: row.avgSessionDuration,
            key_events: row.keyEvents,
            purchase_revenue: row.purchaseRevenue
          })
        }
      }
      result.dimensionRowsUpserted += await flushDimensionRows(dimRows)

      const eventReport = reports[DIMENSION_TYPES.length]
      const evtRows: EvtRow[] = (eventReport ? parseGa4EventReport(eventReport) : []).map(row => ({
        connection_id: map.connection_id,
        client_id: map.client_id,
        property_id: map.property_id,
        date: row.date,
        event_name: row.eventName,
        event_count: row.eventCount,
        event_value: row.eventValue
      }))
      result.eventRowsUpserted += await flushEventRows(evtRows)

      result.propertiesSynced++

      if (quotaShouldThrottle(quota)) result.throttled = true
    } catch (err) {
      result.errors.push(`property ${map.property_id}: ${(err as Error).message || err}`)
    }
  }

  return result
}
