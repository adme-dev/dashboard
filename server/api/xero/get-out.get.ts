/**
 * GET /api/xero/get-out
 *
 * Calculates the "Get Out" cashflow target for the business.
 *
 *   target = wages + expenses + extras  (all configurable per tenant)
 *   shortfall = target - invoiced this month
 *
 * Pulls live ACCREC invoices from Xero for the current month, plus loads
 * the per-tenant config from agency_settings (migration 095). Falls back
 * to the historical defaults if nothing is configured.
 */

import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { toXeroDateTime } from '../../utils/xeroDataFetcher'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'
import { loadGetOutConfig, summariseConfig } from '../../utils/getOutConfig'
import { splitInvoiceTotals } from '../../utils/getOutInvoiceTotals'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantIdRaw = await getSelectedTenant(event)
  if (!tenantIdRaw) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  }
  // Locked-in non-nullable refs so the captures inside cachedFetch's closure
  // can pass them to xeroFetch without re-narrowing.
  const tenantId: string = tenantIdRaw
  const accessToken: string = token.access_token!

  const cacheKey = `xero-get-out:${tenantId}`

  return cachedFetch(event, cacheKey, 60, async () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    const monthStart = new Date(year, month - 1, 1)
    const daysInMonth = new Date(year, month, 0).getDate()
    const dayOfMonth = today.getDate()

    // ── Fetch current month invoices from Xero (paginated, up to 1000) ──
    async function fetchAllPages(): Promise<{ invoices: any[]; truncated: boolean }> {
      const all: any[] = []
      const where = `Type=="ACCREC"&&Date>=${toXeroDateTime(monthStart)}&&Status!="DRAFT"&&Status!="DELETED"&&Status!="VOIDED"`
      for (let page = 1; page <= 10; page++) {
        const params = new URLSearchParams({
          where,
          order: 'Date DESC',
          page: String(page),
          pageSize: '100',
        })
        const body = await dedupedXeroCall(
          `get-out:${tenantId}:${year}-${month}:p${page}`,
          `get-out-p${page}`,
          () => xeroFetch<any>({
            accessToken,
            tenantId,
            path: `Invoices?${params.toString()}`,
          }),
        )
        const invoices = body?.invoices || []
        all.push(...invoices)
        if (invoices.length < 100) return { invoices: all, truncated: false }
      }
      console.warn(`[get-out] hit page cap 10 for tenant ${tenantId} — there may be more invoices not counted`)
      return { invoices: all, truncated: true }
    }

    const { invoices, truncated } = await fetchAllPages()
    // Split the month's invoicing into gross / ex-GST / GST. The Get Out target
    // is a GST-exclusive cash obligation, so coverage must be measured ex-GST —
    // crediting the ~1/11 GST (the ATO's money) overstates how covered we are.
    const invoiceTotals = splitInvoiceTotals(invoices)
    const currentMonthInvoicedTotal = invoiceTotals.inclGst   // gross — preserves existing semantics
    const currentMonthInvoicedExGst = invoiceTotals.exGst
    const currentMonthGst = invoiceTotals.gst
    const currentMonthInvoicedCount = invoices.length

    // ── Configurable inputs (DB-backed via agency_settings) ──
    const config = await loadGetOutConfig(tenantId)
    const totals = summariseConfig(config)

    // Convert cents back to dollars for the existing response shape so the
    // UI doesn't need a coordinated change.
    const wages = totals.wagesCents / 100
    const expensesEstimated = totals.expensesCents / 100
    const extrasTotal = totals.extrasCents / 100
    const expensesTotalIncExtras = expensesEstimated + extrasTotal
    const getOutTarget = wages + expensesTotalIncExtras
    // Coverage is ex-GST vs the (ex-GST) obligation target.
    const difference = currentMonthInvoicedExGst - getOutTarget

    // ── Projection ──
    // If we keep invoicing at current pace, where do we land?
    const monthPaceProjection = dayOfMonth > 0
      ? Math.round((currentMonthInvoicedTotal / dayOfMonth) * daysInMonth)
      : 0

    // ── Category breakdown from line items ──
    const categoryTotals: Record<string, { total: number; count: number }> = {}
    for (const inv of invoices) {
      const items = inv.lineItems || []
      for (const item of items) {
        const code = item.accountCode || 'unknown'
        if (!categoryTotals[code]) categoryTotals[code] = { total: 0, count: 0 }
        const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitAmount) || 0)
        categoryTotals[code].total += lineTotal
        categoryTotals[code].count += 1
      }
    }

    const categoryMap: Record<string, string> = {
      '205': 'Printing',
      '210': 'Production',
      '215': 'Marketing',
      '216': 'Digital Advertising',
      '217': 'Social Media',
      '219': 'Video Production',
      '220': 'Media',
      '225': 'IT / Website',
      '330': 'PPC Passthrough',
    }

    const categoryBreakdown = Object.entries(categoryTotals).map(([code, data]) => ({
      code,
      name: categoryMap[code] || code,
      total: Math.round(data.total * 100) / 100,
      count: data.count,
    })).sort((a, b) => b.total - a.total)

    // Backward-compatible "extras detail" for the old UI section. Pulls
    // the first matches per legacy label so the existing template renders;
    // anything beyond the four legacy slots lives in `config.lines`.
    const extrasLines = config.lines.filter(l => l.category === 'extras')
    const findCents = (substr: string) =>
      (extrasLines.find(l => l.label.toLowerCase().includes(substr))?.amountCents ?? 0) / 100
    const legacyExtras = {
      atoRepayment: findCents('ato'),
      loan1: findCents('loan 1'),
      loan2: findCents('loan 2'),
      loanInterest: findCents('interest'),
    }

    return {
      period: {
        year,
        month,
        monthName: today.toLocaleString('en-AU', { month: 'long' }),
        dayOfMonth,
        daysInMonth,
      },
      // Full editable config — the new settings UI consumes this directly.
      config,
      // Legacy shape for the existing template — preserved for back-compat.
      wages,
      expenses: {
        estimated: expensesEstimated,
        extras: { detail: legacyExtras, total: extrasTotal },
        totalIncExtras: expensesTotalIncExtras,
      },
      getOutTarget,
      currentMonth: {
        invoicedTotal: Math.round(currentMonthInvoicedTotal * 100) / 100,   // gross (incl GST)
        invoicedExGst: currentMonthInvoicedExGst,                            // ex-GST (coverage basis)
        gstCollected: currentMonthGst,                                      // GST owed to ATO
        invoicedCount: currentMonthInvoicedCount,
        paceProjection: monthPaceProjection,
        truncated,
      },
      difference: Math.round(difference * 100) / 100,
      basis: 'ex_gst' as const,
      status: difference >= 0 ? 'surplus' : 'shortfall',
      categoryBreakdown,
      updatedAt: new Date().toISOString(),
    }
  })
})
