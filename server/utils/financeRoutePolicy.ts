/** Accounting-only routes. Marketing spend and scoped customer billing retain their own admission. */
const families = [
  '/api/xero', '/api/advisor', '/api/cashflow', '/api/customers', '/api/customer-tags',
  '/api/ai/finance', '/api/ai/financial-advisor', '/api/ai/cashflow-insights', '/api/ai/recommendations',
  '/api/ai/insights', '/api/ai/expense-insights', '/api/ai/action-plan', '/api/ai/saved-plans', '/api/ai/anomalies',
  '/api/agency/eom', '/api/agency/agents/financial-watch'
]
const exact = new Set([
  '/api/kpis', '/api/kpis-advanced', '/api/agency/kpis', '/api/sync', '/api/exports/cashflow',
  '/api/agency/clients/xero-match', '/api/agency/invoicing/tracking-categories',
  '/api/agency/projects/profitability', '/api/agency/social/spend/bank-charges', '/api/agency/rate-cards/variance'
])

export function normalizeFinancePath(path: string): string {
  // Guard encoded/static aliases too; malformed encoding is left for the router to reject.
  let decoded = path.split('?')[0]!
  try {
    decoded = decodeURIComponent(decoded)
  } catch { /* router rejects malformed paths */ }
  return decoded.toLowerCase().replace(/\/{2,}/g, '/').replace(/\/+$/, '')
}
export function requiresFinancePermission(path: string): boolean {
  const p = normalizeFinancePath(path)
  return exact.has(p) || families.some(prefix => p === prefix || p.startsWith(`${prefix}/`))
    || /^\/api\/agency\/clients\/[^/]+\/(financial-allocations)(\/|$)/.test(p)
    || /^\/api\/agency\/quotes\/[^/]+\/(push-to-xero|xero-status|xero-to-invoice)(\/|$)/.test(p)
}
