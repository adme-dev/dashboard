/**
 * POST /api/internal/warmup
 *
 * Primes the SWR cache for every Xero-backed /reports endpoint so a
 * user's next page load hits hot KV instead of racing live Xero
 * requests past CF's 30 s wall-clock.
 *
 * Auth: X-Warmup-Secret header must match WARMUP_SECRET env var.
 * The inner fan-out also needs CRON_INTERNAL_SECRET so the fetches
 * to /api/xero/* pass the middleware's cron-secret bypass — without
 * it they'd get 401 and the cache would never prime.
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

  const cronSecret = process.env.CRON_INTERNAL_SECRET
  if (!cronSecret) {
    throw createError({ statusCode: 503, statusMessage: 'CRON_INTERNAL_SECRET not configured' })
  }

  // Let SWR decide: cold miss → sync fetch + prime; stale → serve stale
  // + background refresh. Skipping bust=1 avoids hammering Xero every
  // cron tick when the cache is still fresh. Batched in groups of 4 to
  // stay under Xero's 5-concurrent-per-tenant cap.
  const results: Array<{ path: string; ok: boolean; ms: number; status?: number; error?: string }> = []
  const BATCH = 4
  for (let i = 0; i < ENDPOINTS.length; i += BATCH) {
    const batch = ENDPOINTS.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async ({ path, query }) => {
        const start = Date.now()
        try {
          const qs = query ? '?' + new URLSearchParams(
            Object.entries(query).reduce((acc, [k, v]) => {
              if (v != null) acc[k] = String(v)
              return acc
            }, {} as Record<string, string>)
          ).toString() : ''
          const url = `https://agency-dashboard-6cm.pages.dev${path}${qs}`
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              // Auth middleware recognises this and grants a synthetic
              // 'cron' user for whitelisted read-only prefixes. Without
              // it every call gets a 401 and the cache never primes.
              'X-Internal-Cron-Secret': cronSecret,
            },
          })
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
