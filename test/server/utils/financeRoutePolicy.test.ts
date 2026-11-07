import { describe, expect, it } from 'vitest'
import { requiresFinancePermission } from '~~/server/utils/financeRoutePolicy'

describe('accounting route boundary', () => {
  it.each([
    '/api/xero/invoices', '/api/xero/reports/pnl', '/api/xero/callback', '/api/advisor/recommendations',
    '/api/cashflow', '/api/cashflow/commitments/id', '/api/customers/id/invoices', '/api/customer-tags/id',
    '/api/kpis', '/api/kpis-advanced', '/api/agency/kpis', '/api/sync', '/api/exports/cashflow',
    '/api/ai/financial-advisor/history', '/api/ai/cashflow-insights', '/api/ai/insights', '/api/ai/expense-insights',
    '/api/ai/recommendations', '/api/ai/action-plan', '/api/ai/saved-plans/id', '/api/ai/anomalies/id', '/api/ai/finance/status',
    '/api/agency/agents/financial-watch/ask',
    '/api/agency/clients/id/financial-allocations', '/api/agency/clients/xero-match',
    '/api/agency/eom/runs/id/export-csv', '/api/agency/invoicing/tracking-categories',
    '/api/agency/projects/profitability', '/api/agency/rate-cards/variance', '/api/agency/social/spend/bank-charges',
    '/api/agency/quotes/id/push-to-xero', '/api/agency/quotes/id/xero-status', '/api/agency/quotes/id/xero-to-invoice',
    '/api/%78ero/invoices', '/api//xero/invoices/', '/API/XERO/INVOICES'
  ])('protects %s', path => expect(requiresFinancePermission(path)).toBe(true))
  it.each([
    '/api/xeroflow-unrelated', '/api/xero-preview', '/api/agency/social/spend', '/api/agency/social/spend/id',
    '/api/agency/social/google/pmax-launches', '/api/agency/invoices/id', '/api/portal/invoices',
    '/api/agency/client-portal/invoices', '/api/agency/client-portal/dashboard', '/api/agency/clients/id/financials', '/api/agency/quotes/id', '/api/agency/clients', '/api/agency/clients/id',
    '/api/ai/chat', '/api/exports/csv', '/api/mcp/authorize', '/api/internal/mcp/call'
  ])('preserves separate granted/scoped access for %s', path => expect(requiresFinancePermission(path)).toBe(false))
})
