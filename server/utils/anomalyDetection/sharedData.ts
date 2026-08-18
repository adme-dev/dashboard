// server/utils/anomalyDetection/sharedData.ts
import type { H3Event } from 'h3'
import type { SharedData } from './types'
import { queryRows } from '~~/server/utils/db'

/**
 * Fetch every Xero/Meta/Google payload an analyser might need, in parallel,
 * once per detection run. Returning `null` for any source means analysers
 * that depend on it silently no-op rather than the whole run failing.
 *
 * `event` is needed because Xero endpoints currently read auth from H3.
 * For cron callers without an event, pass null — analysers that depend on
 * Xero data will see null and no-op.
 */
export async function fetchSharedData(event: H3Event | null): Promise<SharedData> {
  const headers = event?.headers ?? new Headers()

  // Avoid expanding Nitro's full generated route union here; this helper deliberately
  // accepts runtime internal paths assembled by the anomaly engine.
  const runtimeFetch = (globalThis as any).$fetch as (path: string, options: Record<string, unknown>) => Promise<any>
  const fetchInternal = (path: string, options: Record<string, unknown> = {}): Promise<any> =>
    runtimeFetch(path, options)

  const safe = async <T>(promise: Promise<T>): Promise<T | null> => {
    try { return await promise } catch (err) {
      console.warn('[anomalies] shared data fetch failed:', err)
      return null
    }
  }

  const [pnl, expenses, bankMonitoring, cashForecast, aging, budgetVariance] =
    await Promise.all([
      safe(fetchInternal('/api/xero/reports/pnl', { headers, query: { periods: 13, timeframe: 'MONTH' } })),
      safe(fetchInternal('/api/xero/expenses', { headers })),
      safe(fetchInternal('/api/xero/bank-monitoring', { headers })),
      safe(fetchInternal('/api/xero/reports/cash-flow-forecast', { headers })),
      safe(fetchInternal('/api/xero/reports/aging', { headers, query: { type: 'receivables' } })),
      safe(fetchInternal('/api/xero/reports/budget-variance', { headers })),
    ])

  let mediaSpend: any = null
  try {
    mediaSpend = await queryRows(`
      SELECT
        ms.client_id::text AS client_id,
        ac.name AS client_name,
        ms.platform,
        ms.campaign_id,
        ms.campaign_name,
        COALESCE(ds.spend_date::text, CURRENT_DATE::text) AS spend_date,
        COALESCE(ds.spend, 0)::numeric AS spend,
        ms.id::text AS media_spend_id,
        ms.budget_allocated::numeric AS budget_allocated,
        ms.period,
        ms.campaign_status,
        ms.end_date::text AS end_date,
        ms.synced_at,
        COALESCE(ds.conversions, 0)::numeric AS conversions,
        COALESCE(day_leads.lead_count, 0)::int AS lead_count
      FROM media_spend ms
      LEFT JOIN daily_spend ds
        ON ds.media_spend_id = ms.id
       AND ds.spend_date >= CURRENT_DATE - INTERVAL '31 days'
      LEFT JOIN agency_clients ac ON ms.client_id = ac.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS lead_count
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.is_test = false
          AND l.campaign_id = ms.campaign_id
          AND l.submitted_at >= COALESCE(ds.spend_date, CURRENT_DATE)
          AND l.submitted_at < COALESCE(ds.spend_date, CURRENT_DATE) + INTERVAL '1 day'
      ) day_leads ON TRUE
      WHERE ms.period >= TO_CHAR(CURRENT_DATE - INTERVAL '31 days', 'YYYY-MM')
        AND ms.client_id IS NOT NULL
      ORDER BY COALESCE(ds.spend_date, CURRENT_DATE) DESC
    `)
  } catch (err) {
    console.warn('[anomalies] daily_spend fetch failed:', err)
    mediaSpend = null
  }

  let adPerformance: any = null
  try {
    adPerformance = await queryRows(`
      WITH ranked AS (
        SELECT aps.*,
               ROW_NUMBER() OVER (
                 PARTITION BY aps.media_spend_id, aps.ad_id
                 ORDER BY aps.range_end DESC, aps.range_start DESC, aps.synced_at DESC
               ) AS snapshot_rank
        FROM ad_performance_snapshots aps
      )
      SELECT current.media_spend_id::text AS media_spend_id,
             current.ad_id,
             current.ad_name,
             ms.campaign_id,
             ms.campaign_name,
             ms.platform,
             ac.id::text AS client_id,
             ac.name AS client_name,
             current.range_start::text AS range_start,
             current.range_end::text AS range_end,
             current.spend::numeric AS spend,
             current.impressions::numeric AS impressions,
             current.clicks::numeric AS clicks,
             current.frequency::numeric AS frequency,
             current.first_served_date::text AS first_served_date,
             previous.spend::numeric AS previous_spend,
             previous.impressions::numeric AS previous_impressions,
             previous.clicks::numeric AS previous_clicks,
             previous.frequency::numeric AS previous_frequency
      FROM ranked current
      JOIN media_spend ms ON ms.id = current.media_spend_id
      LEFT JOIN agency_clients ac ON ac.id = ms.client_id
      LEFT JOIN ranked previous
        ON previous.media_spend_id = current.media_spend_id
       AND previous.ad_id = current.ad_id
       AND previous.snapshot_rank = 2
      WHERE current.snapshot_rank = 1
        AND current.range_end >= CURRENT_DATE - INTERVAL '31 days'
        AND ms.client_id IS NOT NULL
    `)
  } catch (err) {
    console.warn('[anomalies] ad performance snapshot fetch failed:', err)
    adPerformance = null
  }

  let clientRevenue: any = null
  try {
    clientRevenue = await queryRows(`
      WITH window AS (
        SELECT
          (CURRENT_DATE - INTERVAL '30 days')::date AS period_start,
          CURRENT_DATE::date AS period_end
      ),
      invoice_totals AS (
        SELECT ai.client_id, SUM(ai.total)::numeric AS invoiced
        FROM agency_invoices ai
        WHERE ai.issue_date >= (SELECT period_start FROM window)
          AND ai.issue_date <= (SELECT period_end FROM window)
          AND ai.status IN ('sent', 'paid')
        GROUP BY ai.client_id
      ),
      time_totals AS (
        SELECT p.client_id, SUM(te.hours * te.hourly_rate)::numeric AS time_value
        FROM time_entries te
        JOIN projects p ON te.project_id = p.id
        WHERE te.date >= (SELECT period_start FROM window)
          AND te.date <= (SELECT period_end FROM window)
          AND te.billable = true
        GROUP BY p.client_id
      )
      SELECT
        ac.id::text AS client_id,
        ac.name AS client_name,
        COALESCE(it.invoiced, 0)::numeric AS invoiced,
        COALESCE(tt.time_value, 0)::numeric AS time_value,
        (SELECT period_start::text FROM window) AS period_start,
        (SELECT period_end::text FROM window) AS period_end
      FROM agency_clients ac
      LEFT JOIN invoice_totals it ON it.client_id = ac.id
      LEFT JOIN time_totals tt ON tt.client_id = ac.id
      WHERE COALESCE(it.invoiced, 0) > 0 OR COALESCE(tt.time_value, 0) > 0
    `)
  } catch (err) {
    console.warn('[anomalies] client revenue fetch failed:', err)
    clientRevenue = null
  }

  let ga4Channel: any = null
  try {
    ga4Channel = await queryRows(`
      SELECT
        g.client_id::text AS client_id,
        ac.name AS client_name,
        g.metric_date::text AS metric_date,
        g.channel_group,
        g.sessions::numeric AS sessions,
        g.key_events::numeric AS key_events
      FROM ga4_daily_channel g
      LEFT JOIN agency_clients ac ON g.client_id = ac.id
      WHERE g.metric_date >= CURRENT_DATE - INTERVAL '31 days'
        AND g.client_id IS NOT NULL
      ORDER BY g.metric_date DESC
    `)
  } catch (err) {
    console.warn('[anomalies] ga4_daily_channel fetch failed:', err)
    ga4Channel = null
  }

  return {
    pnl, expenses, bankMonitoring, cashForecast, aging, budgetVariance,
    mediaSpend, adPerformance, clientRevenue, invoiceLines: null, ga4Channel,
  }
}
