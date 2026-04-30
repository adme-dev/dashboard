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

  const safe = async <T>(promise: Promise<T>): Promise<T | null> => {
    try { return await promise } catch (err) {
      console.warn('[anomalies] shared data fetch failed:', err)
      return null
    }
  }

  const [pnl, expenses, bankMonitoring, cashForecast, aging, budgetVariance] =
    await Promise.all([
      safe($fetch<any>('/api/xero/reports/pnl', { headers, query: { periods: 13, timeframe: 'MONTH' } })),
      safe($fetch<any>('/api/xero/expenses', { headers })),
      safe($fetch<any>('/api/xero/bank-monitoring', { headers })),
      safe($fetch<any>('/api/xero/reports/cash-flow-forecast', { headers })),
      safe($fetch<any>('/api/xero/reports/aging', { headers, query: { type: 'receivables' } })),
      safe($fetch<any>('/api/xero/reports/budget-variance', { headers })),
    ])

  let mediaSpend: any = null
  try {
    mediaSpend = await queryRows(`
      SELECT
        ms.client_id::text AS client_id,
        ac.name AS client_name,
        ms.platform,
        ds.spend_date::text AS spend_date,
        ds.spend::numeric AS spend
      FROM daily_spend ds
      JOIN media_spend ms ON ds.media_spend_id = ms.id
      LEFT JOIN agency_clients ac ON ms.client_id = ac.id
      WHERE ds.spend_date >= CURRENT_DATE - INTERVAL '31 days'
        AND ms.client_id IS NOT NULL
      ORDER BY ds.spend_date DESC
    `)
  } catch (err) {
    console.warn('[anomalies] daily_spend fetch failed:', err)
    mediaSpend = null
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

  return {
    pnl, expenses, bankMonitoring, cashForecast, aging, budgetVariance,
    mediaSpend, clientRevenue, invoiceLines: null,
  }
}
