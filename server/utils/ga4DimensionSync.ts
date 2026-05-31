// server/utils/ga4DimensionSync.ts
/**
 * Pull richer GA4 breakdowns (source/medium, campaign, device, landing page,
 * country) + event-level conversions for every mapped property, via
 * batchRunReports (≤5 reports/call) with quota self-throttle and retry/backoff.
 * Upserts into ga4_daily_dimension / ga4_daily_event (migration 127).
 *
 * Reuses loadGa4Maps + ensureFreshGa4Token + ga4SyncWindow from ga4Sync.ts.
 */
import { execute } from './db'
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
import { loadGa4Maps, ensureFreshGa4Token, ga4SyncWindow } from './ga4Sync'

export interface Ga4DimensionSyncResult {
  propertiesSynced: number
  dimensionRowsUpserted: number
  eventRowsUpserted: number
  throttled: boolean
  errors: string[]
}

const DIMENSION_TYPES = Object.keys(GA4_DIMENSIONS) as Ga4DimensionType[]

export async function syncGa4Dimensions(
  opts: { clientId?: string, lookbackDays?: number, startDate?: string, endDate?: string } = {}
): Promise<Ga4DimensionSyncResult> {
  const config = useRuntimeConfig()
  const result: Ga4DimensionSyncResult = {
    propertiesSynced: 0, dimensionRowsUpserted: 0, eventRowsUpserted: 0, throttled: false, errors: []
  }

  const maps = await loadGa4Maps(opts.clientId)
  const { startDate, endDate } = ga4SyncWindow(opts)

  for (const map of maps) {
    if (result.throttled) break
    try {
      const token = await ensureFreshGa4Token(map, config)

      // 5 dimension reports + 1 event report → batched (chunks of 5).
      const requests = [
        ...DIMENSION_TYPES.map(d => buildGa4DimensionRequest(d, startDate, endDate)),
        buildGa4EventRequest(startDate, endDate)
      ]
      const { reports, quota } = await ga4BatchRunReports(map.property_id, token, requests)

      // reports[0..4] = dimensions in DIMENSION_TYPES order; reports[5] = events.
      for (let i = 0; i < DIMENSION_TYPES.length; i++) {
        const dimType = DIMENSION_TYPES[i]
        const rows = reports[i] ? parseGa4DimensionReport(reports[i]) : []
        for (const row of rows) {
          await execute(
            `INSERT INTO ga4_daily_dimension
               (connection_id, client_id, property_id, metric_date, dimension_type, dimension_value,
                sessions, total_users, new_users, engaged_sessions, engagement_rate,
                avg_session_duration, key_events, purchase_revenue, synced_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
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
            [
              map.connection_id, map.client_id, map.property_id, row.date, dimType, row.dimensionValue,
              row.sessions, row.totalUsers, row.newUsers, row.engagedSessions, row.engagementRate,
              row.avgSessionDuration, row.keyEvents, row.purchaseRevenue
            ]
          )
          result.dimensionRowsUpserted++
        }
      }

      const eventReport = reports[DIMENSION_TYPES.length]
      const eventRows = eventReport ? parseGa4EventReport(eventReport) : []
      for (const row of eventRows) {
        await execute(
          `INSERT INTO ga4_daily_event
             (connection_id, client_id, property_id, metric_date, event_name, event_count, event_value, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT (connection_id, property_id, metric_date, event_name)
           DO UPDATE SET
             event_count = EXCLUDED.event_count,
             event_value = EXCLUDED.event_value,
             synced_at = NOW()`,
          [map.connection_id, map.client_id, map.property_id, row.date, row.eventName, row.eventCount, row.eventValue]
        )
        result.eventRowsUpserted++
      }

      result.propertiesSynced++

      // Self-throttle: if this property's quota is running low, defer the rest.
      if (quotaShouldThrottle(quota)) result.throttled = true
    } catch (err) {
      result.errors.push(`property ${map.property_id}: ${(err as Error).message || err}`)
    }
  }

  return result
}
