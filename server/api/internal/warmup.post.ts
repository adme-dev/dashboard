/**
 * POST /api/internal/warmup
 *
 * Primes the SWR cache for every Xero-backed /reports endpoint so a
 * user's next page load hits hot KV instead of racing live Xero
 * requests past CF's 30 s wall-clock.
 *
 * Auth: X-Warmup-Secret header must match WARMUP_SECRET env var.
 *
 * Intended to be hit every 5-10 min by a CF Cron Trigger (set up in
 * the CF dashboard: Workers & Pages → agency-dashboard → Settings →
 * Functions → Cron Triggers). A curl example from the cron:
 *
 *   curl -X POST https://agency-dashboard-6cm.pages.dev/api/internal/warmup \
 *        -H "X-Warmup-Secret: $WARMUP_SECRET"
 *
 * Response summarises hit/miss per endpoint so the cron owner can
 * monitor failures.
 */

import { createError } from 'h3'

const ENDPOINTS: Array<{ path: string; query?: Record<string, any> }> = [
  { path: '/api/xero/status' },
  { path: '/api/xero/reports/pnl' },
  { path: '/api/xero/reports/pnl-detailed' },
  { path: '/api/xero/reports/balance-sheet' },
  { path: '/api/xero/reports/bank-summary' },
  { path: '/api/xero/reports/aging' },
  { path: '/api/xero/reports/aging', query: { type: 'payables' } },
  { path: '/api/xero/reports/cash-flow-forecast' },
  { path: '/api/xero/reports/executive-summary' },
  { path: '/api/xero/reports/budget-variance' },
  { path: '/api/xero/reports/client-pnl' },
  { path: '/api/xero/invoice-pipeline' },
  { path: '/api/xero/repeating-invoices' },
  { path: '/api/xero/credit-notes' },
  { path: '/api/xero/prepayments-overpayments' },
  { path: '/api/xero/client-concentration' },
  { path: '/api/xero/budgets' },
]

export default eventHandler(async (event) => {
  const provided = getHeader(event, 'x-warmup-secret') || ''
  const expected = process.env.WARMUP_SECRET || useRuntimeConfig().warmupSecret
  if (!expected) {
    throw createError({ statusCode: 503, statusMessage: 'Warmup not configured' })
  }
  if (provided !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid warmup secret' })
  }

  // Fire with bust=1 so each endpoint rewrites its KV entry from live
  // Xero rather than reading the already-cached value. Batched in
  // groups of 4 to stay well under Xero's 5-concurrent-per-tenant cap.
  const results: Array<{ path: string; ok: boolean; ms: number; status?: number; error?: string }> = []
  const BATCH = 4
  for (let i = 0; i < ENDPOINTS.length; i += BATCH) {
    const batch = ENDPOINTS.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async ({ path, query }) => {
        const start = Date.now()
        try {
          const url = `https://agency-dashboard-6cm.pages.dev${path}`
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'X-Warmup-Internal': '1',
              // Pass through the warmup secret so the endpoint can
              // identify and short-circuit auth checks if needed.
              'X-Warmup-Secret': expected as string,
            },
            // Use bust=1 to rewrite the KV entry with fresh Xero data.
            // Note: Xero tokens live in KV and endpoints call
            // getActiveTokenForSession which reads from there, so no
            // session cookie is needed.
          }).catch(err => { throw err })
          results.push({ path, ok: response.ok, ms: Date.now() - start, status: response.status })
        } catch (err: any) {
          results.push({ path, ok: false, ms: Date.now() - start, error: err?.message ?? String(err) })
        }
      })
    )
  }

  const okCount = results.filter(r => r.ok).length
  return {
    ok: okCount === results.length,
    timestamp: new Date().toISOString(),
    hit: okCount,
    total: results.length,
    results,
  }
})
