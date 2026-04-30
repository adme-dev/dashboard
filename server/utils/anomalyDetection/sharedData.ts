// server/utils/anomalyDetection/sharedData.ts
import type { H3Event } from 'h3'
import type { SharedData } from './types'

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

  return {
    pnl, expenses, bankMonitoring, cashForecast, aging, budgetVariance,
    // Phase-2 sources start out empty — populated when their analysers ship.
    mediaSpend: null, clientRevenue: null, invoiceLines: null,
  }
}
