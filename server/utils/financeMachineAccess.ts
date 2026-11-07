import { createError, getHeader, getRequestURL, type H3Event } from 'h3'

// Exact union used by internal/warmup, advisorMetrics and anomalyDetection/sharedData.
// A credential never authorizes arbitrary Xero/advisor paths or any mutation.
const FINANCE_MACHINE_READS = new Set([
  '/api/xero/status',
  '/api/xero/reports/pnl',
  '/api/xero/reports/pnl-detailed',
  '/api/xero/reports/balance-sheet',
  '/api/xero/reports/bank-summary',
  '/api/xero/reports/aging',
  '/api/xero/reports/cash-flow-forecast',
  '/api/xero/reports/executive-summary',
  '/api/xero/reports/budget-variance',
  '/api/xero/reports/client-pnl',
  '/api/xero/invoice-pipeline',
  '/api/xero/repeating-invoices',
  '/api/xero/credit-notes',
  '/api/xero/prepayments-overpayments',
  '/api/xero/client-concentration',
  '/api/xero/budgets',
  '/api/xero/expenses',
  '/api/xero/bank-monitoring'
])
const FINANCE_JOBS = new Set([
  '/api/cron/advisor-outcomes', '/api/cron/advisor-recommendations', '/api/cron/anomaly-detection',
  '/api/cron/xero-customer-sync', '/api/cron/xero-invoice-lines-sync'
])
const verifiedFinanceJobs = new WeakSet<H3Event>()

function requestSecret(event: H3Event, key: 'CRON_SECRET' | 'CRON_INTERNAL_SECRET'): string | null {
  const bindings = event.context.cloudflare?.env as Record<string, unknown> | undefined
  // An explicitly present invalid binding must never fall back to a local process secret.
  const value = bindings && Object.prototype.hasOwnProperty.call(bindings, key) ? bindings[key] : process.env[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function isFinanceReadMachineRequest(event: H3Event): boolean {
  if (!['GET', 'HEAD'].includes(event.method) || !FINANCE_MACHINE_READS.has(getRequestURL(event).pathname)) return false
  const expected = requestSecret(event, 'CRON_INTERNAL_SECRET')
  return expected !== null && getHeader(event, 'x-internal-cron-secret') === expected
}

/** Secret-only guard for independently authenticated jobs; does not grant finance fanout authority. */
export function requireCronJobSecret(event: H3Event): void {
  if (event.method !== 'POST') throw createError({ statusCode: 405, statusMessage: 'Jobs require POST' })
  const expected = requestSecret(event, 'CRON_SECRET')
  if (!expected) throw createError({ statusCode: 503, statusMessage: 'Job authentication unavailable' })
  if (getHeader(event, 'x-cron-secret') !== expected) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
}

export function requireFinanceCronJob(event: H3Event): void {
  requireCronJobSecret(event)
  if (!FINANCE_JOBS.has(getRequestURL(event).pathname)) throw createError({ statusCode: 403, statusMessage: 'Unknown finance job' })
  verifiedFinanceJobs.add(event)
}

export function getFinanceMachineHeaders(event: H3Event | null): Headers {
  const headers = new Headers(event?.headers)
  if (event && verifiedFinanceJobs.has(event)) {
    const expected = requestSecret(event, 'CRON_INTERNAL_SECRET')
    if (!expected) throw createError({ statusCode: 503, statusMessage: 'Finance job read authentication unavailable' })
    headers.set('x-internal-cron-secret', expected)
  }
  return headers
}
