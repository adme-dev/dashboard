import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { toXeroDateTime } from '../../utils/xeroDataFetcher'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'


/**
 * GET /api/xero/get-out
 *
 * Calculates the "Get Out" cashflow target for the business.
 * Pulls live invoice data from Xero for current month billing,
 * and combines with configured fixed costs to show:
 *   - Estimated Monthly Wages
 *   - Expenses only Total
 *   - Extras (ATO, loans, interest)
 *   - Total Expenses inc Extras
 *   - Updated monthly GET OUT (revenue target)
 *   - Current Month Invoicing Total
 *   - Difference (shortfall / surplus)
 *
 * Fixed costs are read from agency_settings table (configurable per tenant).
 */

interface GetOutConfig {
  monthlyWages: number
  estimatedExpenses: number
  extras: {
    atoRepayment: number
    loan1: number
    loan2: number
    loanInterest: number
  }
}

function getDefaultConfig(): GetOutConfig {
  return {
    monthlyWages: 102_263,
    estimatedExpenses: 44_026,
    extras: {
      atoRepayment: 5_000,
      loan1: 3_000,
      loan2: 1_500,
      loanInterest: 824,
    },
  }
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

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
            accessToken: token.access_token!,
            tenantId,
            path: `Invoices?${params.toString()}`,
          })
        )
        const invoices = body?.invoices || []
        all.push(...invoices)
        if (invoices.length < 100) return { invoices: all, truncated: false }
      }
      console.warn(`[get-out] hit page cap 10 for tenant ${tenantId} — there may be more invoices not counted`)
      return { invoices: all, truncated: true }
    }

    const { invoices, truncated } = await fetchAllPages()
    const currentMonthInvoicedTotal = invoices.reduce(
      (sum: number, inv: any) => sum + (Number(inv.total) || 0),
      0
    )
    const currentMonthInvoicedCount = invoices.length

    // ── Load configuration (fallback to defaults) ──
    // TODO: load from DB once agency_settings table has get_out_config column
    const config = getDefaultConfig()

    const extrasTotal =
      config.extras.atoRepayment +
      config.extras.loan1 +
      config.extras.loan2 +
      config.extras.loanInterest

    const expensesTotalIncExtras = config.estimatedExpenses + extrasTotal
    const getOutTarget = config.monthlyWages + expensesTotalIncExtras
    const difference = currentMonthInvoicedTotal - getOutTarget

    // ── Projection ──
    // If we keep invoicing at current pace, where do we land?
    const monthPaceProjection = dayOfMonth > 0
      ? Math.round((currentMonthInvoicedTotal / dayOfMonth) * daysInMonth)
      : 0

    // ── Category breakdown from line items ──
    // Aggregate by COA code from the invoice line items
    const categoryTotals: Record<string, { total: number; count: number }> = {}
    for (const inv of invoices) {
      const items = inv.lineItems || []
      for (const item of items) {
        const code = item.accountCode || 'unknown'
        if (!categoryTotals[code]) {
          categoryTotals[code] = { total: 0, count: 0 }
        }
        const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitAmount) || 0)
        categoryTotals[code].total += lineTotal
        categoryTotals[code].count += 1
      }
    }

    // Map to friendly names
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

    return {
      period: {
        year,
        month,
        monthName: today.toLocaleString('en-AU', { month: 'long' }),
        dayOfMonth,
        daysInMonth,
      },
      config,
      wages: config.monthlyWages,
      expenses: {
        estimated: config.estimatedExpenses,
        extras: {
          detail: config.extras,
          total: extrasTotal,
        },
        totalIncExtras: expensesTotalIncExtras,
      },
      getOutTarget,
      currentMonth: {
        invoicedTotal: Math.round(currentMonthInvoicedTotal * 100) / 100,
        invoicedCount: currentMonthInvoicedCount,
        paceProjection: monthPaceProjection,
        truncated,
      },
      difference: Math.round(difference * 100) / 100,
      status: difference >= 0 ? 'surplus' : 'shortfall',
      categoryBreakdown,
      updatedAt: new Date().toISOString(),
    }
  })
})
