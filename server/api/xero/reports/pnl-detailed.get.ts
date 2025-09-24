import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

type XeroRow = {
  RowType?: string
  rowType?: string
  Title?: string
  title?: string
  Cells?: XeroCell[]
  cells?: XeroCell[]
  Rows?: XeroRow[]
  rows?: XeroRow[]
}

type XeroCell = {
  Value?: string | number | null
  value?: string | number | null
}

type ParsedRow = {
  title: string
  type: string
  values: number[]
  children: ParsedRow[]
}

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getRowType(row: XeroRow): string {
  return (row.RowType || row.rowType || '').toString()
}

function getRows(row: XeroRow | undefined): XeroRow[] {
  if (!row) return []
  return row.Rows || row.rows || []
}

function getCells(row: XeroRow | undefined): XeroCell[] {
  if (!row) return []
  return row.Cells || row.cells || []
}

function getRowTitle(row: XeroRow | undefined): string {
  if (!row) return ''
  return row.Title || row.title || getCellValue(getCells(row)[0]) || ''
}

function getCellValue(cell: XeroCell | undefined): string {
  const raw = cell?.Value ?? cell?.value
  return raw === undefined || raw === null ? '' : String(raw)
}

function parseNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return 0

    const isNegative = /^\(.*\)$/.test(trimmed)
    const normalized = trimmed
      .replace(/[(),]/g, '')
      .replace(/[^0-9.-]/g, '')

    const numeric = Number(normalized)
    if (Number.isNaN(numeric)) return 0

    return isNegative ? -numeric : numeric
  }

  return 0
}

function parseRow(row: XeroRow): ParsedRow {
  const type = getRowType(row).toLowerCase()
  const cells = getCells(row)
  const values = cells.slice(1).map(cell => parseNumeric(cell?.Value ?? cell?.value))
  const children = getRows(row).map(parseRow)

  return {
    title: getRowTitle(row),
    type,
    values,
    children
  }
}

function flattenRows(rows: ParsedRow[]): ParsedRow[] {
  const out: ParsedRow[] = []
  const visit = (row: ParsedRow) => {
    out.push(row)
    row.children.forEach(visit)
  }
  rows.forEach(visit)
  return out
}

function findRow(rows: ParsedRow[], matcher: RegExp): ParsedRow | undefined {
  for (const row of rows) {
    if (matcher.test(row.title)) {
      return row
    }
  }
  return undefined
}

function findSection(rows: ParsedRow[], matcher: RegExp): ParsedRow | undefined {
  const queue = [...rows]
  while (queue.length) {
    const row = queue.shift()!
    if (row.type === 'section' && matcher.test(row.title)) {
      return row
    }
    queue.push(...row.children)
  }
  return undefined
}

function sumValues(values: number[], upToIndex: number): number {
  if (values.length === 0) return 0
  const end = Math.min(upToIndex + 1, values.length)
  let total = 0
  for (let i = 0; i < end; i += 1) {
    total += values[i]
  }
  return total
}

function getDefaultMonthEnd(): Date {
  const today = new Date()
  // Go to last day of previous month by setting day to 0 of current month
  return new Date(today.getFullYear(), today.getMonth(), 0)
}

function parseDateInput(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function calculatePeriodCount(start: Date, end: Date): number {
  return ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1
}

function toLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

type BreakdownItemData = {
  name: string
  values: number[]
}

type BreakdownOptions = {
  normalizeSign?: boolean
  fallbackRows?: ParsedRow[]
  filter?: (row: ParsedRow) => boolean
}

function shouldIgnoreBreakdownRow(title: string) {
  return /total|gross|net|margin|operating\s+expense|operating\s+expenses|income\s+tax/i.test(title)
}

function collectBreakdownItems(section: ParsedRow | undefined, options: BreakdownOptions): BreakdownItemData[] {
  const items: BreakdownItemData[] = []
  const queue: ParsedRow[] = section ? [...section.children] : []

  while (queue.length) {
    const current = queue.shift()!
    if (!current.title || shouldIgnoreBreakdownRow(current.title)) {
      queue.unshift(...current.children)
      continue
    }

    if (current.type === 'row' && current.values.length > 0) {
      if (!options.filter || options.filter(current)) {
        items.push({ name: current.title || 'Other', values: current.values })
      }
    } else {
      queue.unshift(...current.children)
    }
  }

  if (items.length === 0 && options.fallbackRows) {
    for (const row of options.fallbackRows) {
      if (row.type !== 'row' || !row.title || row.values.length === 0) continue
      if (shouldIgnoreBreakdownRow(row.title)) continue
      if (options.filter && !options.filter(row)) continue
      items.push({ name: row.title, values: row.values })
    }
  }

  return items
}

function createBreakdown(
  section: ParsedRow | undefined,
  lastIndex: number,
  previousIndex: number,
  ytdIndex: number,
  options: BreakdownOptions = {}
) {
  const items = collectBreakdownItems(section, options)
  if (items.length === 0) return [] as Array<{ name: string; month: number; ytd: number; previousMonth: number; monthShare: number; ytdShare: number }>

  const normalize = Boolean(options.normalizeSign)

  const data = items.map(item => {
    const currentRaw = item.values[lastIndex] ?? 0
    const priorRaw = previousIndex >= 0 ? item.values[previousIndex] ?? 0 : 0
    const ytdRaw = sumValues(item.values, ytdIndex)

    const month = normalize ? Math.abs(currentRaw) : currentRaw
    const previousMonth = normalize ? Math.abs(priorRaw) : priorRaw
    const ytd = normalize ? Math.abs(ytdRaw) : ytdRaw

    return {
      name: item.name,
      month,
      previousMonth,
      ytd
    }
  })

  const monthTotal = data.reduce((acc, item) => acc + item.month, 0)
  const ytdTotal = data.reduce((acc, item) => acc + item.ytd, 0)

  return data
    .map(item => ({
      ...item,
      monthShare: monthTotal ? item.month / monthTotal : 0,
      ytdShare: ytdTotal ? item.ytd / ytdTotal : 0
    }))
    .sort((a, b) => b.month - a.month)
}

function buildInsights({
  monthLabel,
  summary,
  breakdown,
  trailing
}: {
  monthLabel: string
  summary: {
    revenue: { month: number; previousMonth: number }
    grossProfit: { month: number; previousMonth: number }
    netProfit: { month: number; previousMonth: number }
    netMargin: { month: number; previousMonth: number; ytd: number }
    operatingExpenses: { month: number; previousMonth: number }
  }
  breakdown: {
    revenue: Array<{ name: string; month: number; previousMonth: number; monthShare: number; ytd: number }>
    directCosts: Array<{ name: string; month: number; previousMonth: number; monthShare: number; ytd: number }>
    expenses: Array<{ name: string; month: number; previousMonth: number; monthShare: number; ytd: number }>
  }
  trailing: {
    periods: number
    netProfit: number
  }
}): string[] {
  const insights: string[] = []

  const revenueDelta = summary.revenue.month - summary.revenue.previousMonth
  if (summary.revenue.month === 0) {
    insights.push(`Revenue was $0 in ${monthLabel}. Double-check data availability for this period.`)
  } else if (Math.abs(revenueDelta) > summary.revenue.month * 0.1) {
    const direction = revenueDelta >= 0 ? 'increase' : 'decline'
    insights.push(`Revenue saw a ${direction} of ${formatCurrency(Math.abs(revenueDelta))} versus the previous month.`)
  }

  if (summary.netProfit.month < 0) {
    insights.push(`Net loss of ${formatCurrency(Math.abs(summary.netProfit.month))} recorded in ${monthLabel}.`)
  } else {
    const profitDelta = summary.netProfit.month - summary.netProfit.previousMonth
    if (Math.abs(profitDelta) > summary.netProfit.month * 0.1) {
      const direction = profitDelta >= 0 ? 'increase' : 'decline'
      insights.push(`Net profit ${direction}d by ${formatCurrency(Math.abs(profitDelta))} compared to the prior month.`)
    }
  }

  const expenseDelta = summary.operatingExpenses.month - summary.operatingExpenses.previousMonth
  if (Math.abs(expenseDelta) > summary.operatingExpenses.month * 0.1 && summary.operatingExpenses.month > 0) {
    const direction = expenseDelta >= 0 ? 'increase' : 'reduction'
    insights.push(`Operating expenses saw a ${direction} of ${formatCurrency(Math.abs(expenseDelta))} month-over-month.`)
  }

  const marginDelta = summary.netMargin.month - summary.netMargin.previousMonth
  if (Math.abs(marginDelta) > 0.02) {
    const direction = marginDelta >= 0 ? 'improved' : 'compressed'
    insights.push(`Net margin ${direction} by ${(Math.abs(marginDelta) * 100).toFixed(1)} pts versus last month.`)
  }

  const topRevenue = breakdown.revenue[0]
  if (topRevenue) {
    insights.push(`${topRevenue.name} contributed ${(topRevenue.monthShare * 100).toFixed(1)}% of monthly revenue (${formatCurrency(topRevenue.month)}).`)
    const revenueMoMDiff = topRevenue.month - topRevenue.previousMonth
    if (Math.abs(revenueMoMDiff) > Math.abs(topRevenue.previousMonth) * 0.1) {
      const direction = revenueMoMDiff >= 0 ? 'increased' : 'declined'
      insights.push(`${topRevenue.name} ${direction} by ${formatCurrency(Math.abs(revenueMoMDiff))} versus last month.`)
    }
  }

  const topExpense = breakdown.expenses[0]
  if (topExpense) {
    insights.push(`${topExpense.name} is the largest operating expense at ${formatCurrency(topExpense.month)} (${(topExpense.monthShare * 100).toFixed(1)}% of spend).`)
    const expenseDelta = topExpense.month - topExpense.previousMonth
    if (Math.abs(expenseDelta) > Math.abs(topExpense.previousMonth) * 0.1) {
      const direction = expenseDelta >= 0 ? 'rose' : 'fell'
      insights.push(`${topExpense.name} ${direction} by ${formatCurrency(Math.abs(expenseDelta))} month-over-month.`)
    }
  }

  const topDirectCost = breakdown.directCosts[0]
  if (topDirectCost) {
    insights.push(`${topDirectCost.name} represents ${(topDirectCost.monthShare * 100).toFixed(1)}% of direct costs this month (${formatCurrency(topDirectCost.month)}).`)
    const directCostDelta = topDirectCost.month - topDirectCost.previousMonth
    if (Math.abs(directCostDelta) > Math.abs(topDirectCost.previousMonth || 0) * 0.1) {
      const direction = directCostDelta >= 0 ? 'increased' : 'decreased'
      insights.push(`${topDirectCost.name} ${direction} by ${formatCurrency(Math.abs(directCostDelta))} compared with the prior month.`)
    }
  }

  if (Number.isFinite(summary.netMargin.ytd)) {
    const marginGap = summary.netMargin.month - (summary.netMargin.ytd || 0)
    if (Math.abs(marginGap) > 0.015) {
      const direction = marginGap >= 0 ? 'above' : 'below'
      insights.push(`Monthly net margin sits ${(Math.abs(marginGap) * 100).toFixed(1)} pts ${direction} the YTD average.`)
    }
  }

  if (trailing.periods >= 2) {
    const trailingLabel = `${trailing.periods}-month`
    if (trailing.netProfit < 0) {
      insights.push(`${formatCurrency(Math.abs(trailing.netProfit))} cumulative loss across the last ${trailingLabel} window. Review the drivers above.`)
    } else if (trailing.netProfit > 0) {
      insights.push(`${formatCurrency(trailing.netProfit)} cumulative profit over the last ${trailingLabel} window.`)
    }
  }

  if (insights.length === 0) {
    insights.push(`Performance in ${monthLabel} remained broadly consistent with the prior month across revenue, margin, and profitability.`)
  }

  return insights
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

function formatCurrency(value: number) {
  return currencyFormatter.format(Math.round(value))
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)

  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const requestedToDate = parseDateInput(typeof query.toDate === 'string' ? query.toDate : undefined)
  const basis = typeof query.basis === 'string' && query.basis.toLowerCase() === 'cash' ? 'Cash' : 'Accrual'

  const monthEnd = requestedToDate ?? getDefaultMonthEnd()
  const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1)
  const ytdStart = new Date(monthEnd.getFullYear(), 0, 1)

  if (monthStart > monthEnd) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid reporting period' })
  }

  const periodCount = Math.min(12, Math.max(1, calculatePeriodCount(ytdStart, monthEnd)))
  const toDateStr = ensureDateString(monthEnd)
  const fromDateStr = ensureDateString(ytdStart)

  const client = await createXeroClient({ tokenSet: token, event })
  let report
  try {
    const response = await client.accountingApi.getReportProfitAndLoss(
      tenantId,
      fromDateStr,
      toDateStr,
      periodCount,
      'MONTH',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      basis === 'Cash'
    )
    report = response.body
  } catch (err: any) {
    const statusCode = err?.response?.status || 500
    const detail = err?.response?.data || err?.message
    console.error('[pnl-detailed] Failed to fetch Profit & Loss report', detail)
    throw createError({ statusCode, statusMessage: 'Failed to fetch Profit & Loss report from Xero' })
  }

  const reportTable = report?.reports?.[0] ?? report?.Reports?.[0]
  const tableRows: XeroRow[] = reportTable ? reportTable.rows ?? reportTable.Rows ?? [] : []

  const parsedRows = tableRows
    .filter(row => getRowType(row).toLowerCase() !== 'header')
    .map(parseRow)

  const flattened = flattenRows(parsedRows)

  const headerRow = tableRows.find(row => getRowType(row).toLowerCase() === 'header')
  const periodLabels = headerRow ? getCells(headerRow).slice(1).map(cell => getCellValue(cell)) : []

  const lastIndex = Math.max(0, periodLabels.length - 1)
  const previousIndex = lastIndex > 0 ? lastIndex - 1 : -1
  const ytdIndex = lastIndex

  const revenueRow = findRow(flattened, /total\s+(revenue|income)/i)
  const expenseRow = findRow(flattened, /total\s+operating\s+expenses|total\s+expense/i)
  const cogsRow = findRow(flattened, /total\s+(cost\s+of\s+sales|direct\s+costs)/i)
  const grossProfitRow = findRow(flattened, /gross\s+profit/i)
  const netProfitRow = findRow(flattened, /net\s+profit|net\s+income|profit\s+for\s+the\s+period|profit\s+\(loss\)/i)

  const revenueSection = findSection(parsedRows, /revenue|income/i)
  const costOfSalesSection = findSection(parsedRows, /(cost\s+of\s+sales|direct\s+cost)/i)
  const expenseSection = findSection(parsedRows, /expense/i)

  const revenueMonth = revenueRow?.values[lastIndex] ?? 0
  const revenuePrev = previousIndex >= 0 ? revenueRow?.values[previousIndex] ?? 0 : 0
  const revenueYtd = revenueRow ? sumValues(revenueRow.values, ytdIndex) : revenueMonth

  const cogsMonth = cogsRow?.values[lastIndex] ?? 0
  const cogsPrev = previousIndex >= 0 ? cogsRow?.values[previousIndex] ?? 0 : 0
  const cogsYtd = cogsRow ? sumValues(cogsRow.values, ytdIndex) : cogsMonth

  const grossMonth = grossProfitRow?.values[lastIndex] ?? revenueMonth + cogsMonth
  const grossPrev = previousIndex >= 0 ? grossProfitRow?.values[previousIndex] ?? (revenuePrev + cogsPrev) : grossMonth
  const grossYtd = grossProfitRow ? sumValues(grossProfitRow.values, ytdIndex) : revenueYtd + cogsYtd

  const operatingExpensesMonthRaw = expenseRow?.values[lastIndex] ?? 0
  const operatingExpensesPrevRaw = previousIndex >= 0 ? expenseRow?.values[previousIndex] ?? 0 : 0
  const operatingExpensesYtdRaw = expenseRow ? sumValues(expenseRow.values, ytdIndex) : operatingExpensesMonthRaw

  const operatingExpensesMonth = Math.abs(operatingExpensesMonthRaw)
  const operatingExpensesPrev = Math.abs(operatingExpensesPrevRaw)
  const operatingExpensesYtd = Math.abs(operatingExpensesYtdRaw)

  const netProfitMonth = netProfitRow?.values[lastIndex] ?? (grossMonth - operatingExpensesMonthRaw)
  const netProfitPrev = previousIndex >= 0 ? netProfitRow?.values[previousIndex] ?? (grossPrev - operatingExpensesPrevRaw) : netProfitMonth
  const netProfitYtd = netProfitRow ? sumValues(netProfitRow.values, ytdIndex) : (grossYtd - operatingExpensesYtdRaw)

  const totalExpenseSeries = expenseRow?.values.map(value => Math.abs(value)) ?? new Array(periodLabels.length).fill(0)
  const revenueSeries = revenueRow?.values ?? new Array(periodLabels.length).fill(0)
  const netProfitSeries = netProfitRow?.values ?? new Array(periodLabels.length).fill(0)

  const breakdownRevenue = createBreakdown(revenueSection, lastIndex, previousIndex, ytdIndex, {
    normalizeSign: false,
    fallbackRows: flattened,
    filter: row => {
      const value = row.values[lastIndex] ?? 0
      return value > 0
    }
  })
  const breakdownDirectCosts = createBreakdown(costOfSalesSection, lastIndex, previousIndex, ytdIndex, {
    normalizeSign: true,
    fallbackRows: flattened,
    filter: row => {
      const value = row.values[lastIndex] ?? 0
      const title = row.title || ''
      return value < 0 && /(cost|cogs|direct|ppc|media|ad|production)/i.test(title)
    }
  })
  const breakdownExpenses = createBreakdown(expenseSection, lastIndex, previousIndex, ytdIndex, {
    normalizeSign: true,
    fallbackRows: flattened,
    filter: row => {
      const value = row.values[lastIndex] ?? 0
      return value < 0
    }
  })

  const summary = {
    revenue: {
      month: revenueMonth,
      previousMonth: revenuePrev,
      ytd: revenueYtd
    },
    costOfSales: {
      month: Math.abs(cogsMonth),
      previousMonth: Math.abs(cogsPrev),
      ytd: Math.abs(cogsYtd)
    },
    grossProfit: {
      month: grossMonth,
      previousMonth: grossPrev,
      ytd: grossYtd
    },
    operatingExpenses: {
      month: operatingExpensesMonth,
      previousMonth: operatingExpensesPrev,
      ytd: operatingExpensesYtd
    },
    netProfit: {
      month: netProfitMonth,
      previousMonth: netProfitPrev,
      ytd: netProfitYtd
    },
    netMargin: {
      month: revenueMonth !== 0 ? netProfitMonth / revenueMonth : 0,
      previousMonth: revenuePrev !== 0 ? netProfitPrev / revenuePrev : 0,
      ytd: revenueYtd !== 0 ? netProfitYtd / revenueYtd : 0
    }
  }

  const periodDetails = periodLabels.map((label, index) => {
    const revenue = revenueRow?.values[index] ?? 0
    const directCosts = Math.abs(cogsRow?.values[index] ?? 0)
    const operatingExpenses = Math.abs(expenseRow?.values[index] ?? 0)
    const grossProfit = revenue - directCosts
    const netProfit = netProfitRow?.values?.[index] ?? (grossProfit - operatingExpenses)

    return {
      label,
      revenue,
      directCosts,
      grossProfit,
      operatingExpenses,
      netProfit
    }
  })

  const trailingWindow = Math.min(3, periodDetails.length)
  const trailingSlice = trailingWindow > 0 ? periodDetails.slice(-trailingWindow) : []
  const trailingTotals = trailingSlice.reduce((acc, period) => {
    acc.revenue += period.revenue
    acc.directCosts += period.directCosts
    acc.operatingExpenses += period.operatingExpenses
    acc.netProfit += period.netProfit
    return acc
  }, { revenue: 0, directCosts: 0, operatingExpenses: 0, netProfit: 0 })

  const insights = buildInsights({
    monthLabel: toLabel(monthStart),
    summary: {
      revenue: summary.revenue,
      grossProfit: summary.grossProfit,
      netProfit: summary.netProfit,
      netMargin: summary.netMargin,
      operatingExpenses: summary.operatingExpenses
    },
    breakdown: {
      revenue: breakdownRevenue,
      directCosts: breakdownDirectCosts,
      expenses: breakdownExpenses
    },
    trailing: {
      periods: trailingWindow,
      netProfit: trailingTotals.netProfit
    }
  })

  return {
    meta: {
      basis,
      generatedAt: new Date().toISOString(),
      monthStart: ensureDateString(monthStart),
      monthEnd: ensureDateString(monthEnd),
      monthLabel: toLabel(monthEnd),
      ytdStart: ensureDateString(ytdStart),
      ytdLabel: `${monthEnd.getFullYear()} YTD`,
      periodLabels
    },
    summary,
    trend: {
      labels: periodLabels,
      revenue: revenueSeries,
      expenses: totalExpenseSeries,
      netProfit: netProfitSeries
    },
    breakdown: {
      revenue: breakdownRevenue,
      directCosts: breakdownDirectCosts,
      expenses: breakdownExpenses
    },
    periods: periodDetails,
    trailing: {
      periods: trailingWindow,
      ...trailingTotals
    },
    insights
  }
})
