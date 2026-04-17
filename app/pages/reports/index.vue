<script setup lang="ts">
import { CalendarDate, today, getLocalTimeZone } from '@internationalized/date'

definePageMeta({ layout: 'agency' })

// ── Types ──
type SummaryMetric = { month: number; previousMonth: number; ytd: number }

type PnlReport = {
  meta: { basis: string; monthLabel: string; ytdLabel: string; periodLabels: string[] }
  summary: {
    revenue: SummaryMetric
    costOfSales: SummaryMetric
    grossProfit: SummaryMetric
    operatingExpenses: SummaryMetric
    netProfit: SummaryMetric
    netMargin: SummaryMetric
  }
  trend: { labels: string[]; revenue: number[]; expenses: number[]; netProfit: number[] }
  breakdown: {
    revenue: Array<{ name: string; month: number; ytd: number; monthShare: number }>
    directCosts: Array<{ name: string; month: number; ytd: number; monthShare: number }>
    expenses: Array<{ name: string; month: number; ytd: number; monthShare: number }>
  }
  insights: string[]
}

type BalanceSheet = {
  date: string
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  workingCapital: number
  debtToEquity: number
  equityRatio: number
}

type AgingBucket = { bucket: string; amount: number; count: number; percentage: number }
type AgingContact = { name: string; amount: number; count: number; oldestDays: number }
type AgingReport = {
  reportType: string
  totalOutstanding: number
  totalInvoices: number
  averageDaysPastDue: number
  criticalCount: number
  criticalAmount: number
  agingSummary: AgingBucket[]
  topContacts: AgingContact[]
}

type BudgetCategory = {
  category: string
  budgeted: number
  actual: number
  variance: number
  variancePercent: number
  status: string
}
type BudgetReport = {
  period: { monthName: string; year: number; isCurrentMonth: boolean; daysPassed: number; daysRemaining: number }
  summary: {
    totalBudget: number
    totalActual: number
    totalVariance: number
    totalVariancePercent: number
    projectedMonthEnd: number
    overBudgetCount: number
    underBudgetCount: number
  }
  categoryAnalysis: BudgetCategory[]
  alerts: Array<{ type: string; category: string; message: string; severity: string }>
}

type PipelineReport = {
  summary: {
    totalInvoices: number
    totalValue: number
    paidValue: number
    outstandingValue: number
    paidRate: number
    overdueRate: number
    averageCollectionTime: number
    riskLevel: string
  }
  stages: Record<string, { name: string; count: number; value: number; percentage: number; averageDaysInStage: number; color: string }>
  bottlenecks: Array<{ stage: string; issue: string }>
  recommendations: string[]
}

// ── Period selector state ──
const route = useRoute()
const router = useRouter()
const tz = getLocalTimeZone()
const nowCal = today(tz)

const now = new Date()
const defaultMonth = now.getMonth() + 1
const defaultYear = now.getFullYear()

const qMonth = Number(route.query.month)
const qYear = Number(route.query.year)
const selectedMonth = ref(qMonth >= 1 && qMonth <= 12 ? qMonth : defaultMonth)
const selectedYear = ref(qYear >= 2000 && qYear <= 2100 ? qYear : defaultYear)
const popoverOpen = ref(false)

watch([selectedMonth, selectedYear], () => {
  const query: Record<string, string> = {}
  const isDefault = selectedMonth.value === defaultMonth && selectedYear.value === defaultYear
  if (!isDefault) {
    query.month = String(selectedMonth.value)
    query.year = String(selectedYear.value)
  }
  router.replace({ query })
}, { flush: 'post' })

const toDate = computed(() => {
  const d = new Date(selectedYear.value, selectedMonth.value, 0)
  return d.toISOString().slice(0, 10)
})

function monthName(m: number, y: number) {
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

const displayLabel = computed(() => monthName(selectedMonth.value, selectedYear.value))

const calendarValue = computed({
  get: () => new CalendarDate(selectedYear.value, selectedMonth.value, 1),
  set: (val: CalendarDate) => {
    selectedMonth.value = val.month
    selectedYear.value = val.year
    popoverOpen.value = false
  }
})

const shortcuts = computed(() => {
  const m = nowCal.month
  const y = nowCal.year
  const prev = m === 1 ? { month: 12, year: y - 1 } : { month: m - 1, year: y }
  const prev2 = prev.month === 1 ? { month: 12, year: prev.year - 1 } : { month: prev.month - 1, year: prev.year }
  return [
    { label: 'This Month', month: m, year: y },
    { label: 'Last Month', month: prev.month, year: prev.year },
    { label: monthName(prev2.month, prev2.year), month: prev2.month, year: prev2.year },
  ]
})

function selectShortcut(s: { month: number; year: number }) {
  selectedMonth.value = s.month
  selectedYear.value = s.year
  popoverOpen.value = false
}

function isActiveShortcut(s: { month: number; year: number }) {
  return s.month === selectedMonth.value && s.year === selectedYear.value
}

function prevMonth() {
  if (selectedMonth.value === 1) { selectedMonth.value = 12; selectedYear.value-- }
  else { selectedMonth.value-- }
}

function nextMonth() {
  if (selectedMonth.value === 12) { selectedMonth.value = 1; selectedYear.value++ }
  else { selectedMonth.value++ }
}

const isCurrentMonth = computed(() =>
  selectedMonth.value === nowCal.month && selectedYear.value === nowCal.year
)

// ── Data fetches ──
// All client-only + lazy. We never block SSR on Xero — the page renders
// skeleton cards and each widget resolves independently. getCachedData: () =>
// undefined stops Nuxt from replaying a stale snapshot across navigations.
const fetchOpts = { server: false, getCachedData: () => undefined } as const

const { data: pnl, pending: pnlPending, refresh: refreshPnl } = useLazyFetch<PnlReport>(
  '/api/xero/reports/pnl-detailed',
  { ...fetchOpts, query: computed(() => ({ toDate: toDate.value })) }
)

const { data: balanceSheet, pending: bsPending, refresh: refreshBs } = useLazyFetch<BalanceSheet>(
  '/api/xero/reports/balance-sheet',
  { ...fetchOpts, query: computed(() => ({ toDate: toDate.value })) }
)

const { data: aging, pending: agingPending, refresh: refreshAging } = useLazyFetch<AgingReport>(
  '/api/xero/reports/aging',
  fetchOpts
)

const { data: agingPayables, pending: agingPayPending } = useLazyFetch<AgingReport>(
  '/api/xero/reports/aging',
  { ...fetchOpts, query: { type: 'payables' } }
)

const { data: budget, pending: budgetPending, refresh: refreshBudget } = useLazyFetch<BudgetReport>(
  '/api/xero/reports/budget-variance',
  { ...fetchOpts, query: computed(() => ({ month: selectedMonth.value, year: selectedYear.value })) }
)

const { data: pipeline, pending: pipelinePending, refresh: refreshPipeline } = useLazyFetch<PipelineReport>(
  '/api/xero/invoice-pipeline',
  fetchOpts
)

const { data: bankSummary, pending: bankPending } = useLazyFetch<{ totalBalance: number }>(
  '/api/xero/reports/bank-summary',
  fetchOpts
)

// Xero Executive Summary — DSO / DPO / current ratio / etc., computed
// server-side by Xero rather than rederived from P&L + Balance Sheet.
type ExecutiveSummary = {
  asOf: string
  metrics: Record<string, { latest: number | null; periods: number[]; label: string }>
}
const { data: execSummary, pending: execPending } = useLazyFetch<ExecutiveSummary>(
  '/api/xero/reports/executive-summary',
  { ...fetchOpts, query: computed(() => ({ date: toDate.value })) }
)

// Recurring revenue (retainers / subscriptions) — MRR + top clients.
type RepeatingInvoices = {
  summary: { mrr: number; arr: number; activeCount: number; totalCount: number; clientCount: number }
  topClients: Array<{ contact: string; contactId: string; monthly: number; schedules: number }>
}
const { data: recurring, pending: recurringPending } = useLazyFetch<RepeatingInvoices>(
  '/api/xero/repeating-invoices',
  fetchOpts
)

// Client / project P&L via tracking categories.
type ClientPnl = {
  category: { id: string; name: string } | null
  options: Array<{ name: string; revenue: number; directCosts: number; grossProfit: number; operatingExpenses: number; netProfit: number; netMargin: number }>
  totals: { revenue?: number; directCosts?: number; operatingExpenses?: number; netProfit?: number }
}
const { data: clientPnl, pending: clientPnlPending, refresh: refreshClientPnl } = useLazyFetch<ClientPnl>(
  '/api/xero/reports/client-pnl',
  { ...fetchOpts, query: computed(() => {
    const d = new Date(selectedYear.value, selectedMonth.value - 1, 1)
    const end = new Date(selectedYear.value, selectedMonth.value, 0)
    return { fromDate: d.toISOString().slice(0, 10), toDate: end.toISOString().slice(0, 10) }
  }) }
)

// Xero-managed Budgets (BudgetSummary) — replaces our computed budget inference.
type XeroBudgets = {
  budgets: Array<{ id: string; description: string; type: string; updatedAt: string | null }>
  selected: { id: string; description: string } | null
  periodLabels: string[]
  rows: Array<{ label: string; values: number[] }>
}
const { data: xeroBudgets, pending: xeroBudgetsPending } = useLazyFetch<XeroBudgets>(
  '/api/xero/budgets',
  { ...fetchOpts, query: { periods: 6 } }
)

// Credit notes issued YTD / this month — impacts true revenue figure.
type CreditNotes = {
  summary: { issuedYtdTotal: number; issuedYtdCount: number; issuedMonthTotal: number; issuedMonthCount: number; receivedYtdTotal: number; receivedYtdCount: number }
  topContacts: Array<{ name: string; total: number; count: number }>
}
const { data: creditNotes, pending: creditNotesPending } = useLazyFetch<CreditNotes>(
  '/api/xero/credit-notes',
  fetchOpts
)

// Unearned revenue — deposits / overpayments sitting on the balance sheet.
type Prepayments = {
  summary: { totalUnearned: number; prepayRemaining: number; overpayRemaining: number; prepayCount: number; overpayCount: number; contactCount: number }
  topContacts: Array<{ name: string; prepay: number; overpay: number; total: number; count: number }>
}
const { data: unearned, pending: unearnedPending } = useLazyFetch<Prepayments>(
  '/api/xero/prepayments-overpayments',
  fetchOpts
)

// Client revenue concentration — YTD % of revenue per client + HHI risk.
type ClientConcentration = {
  summary: { clientCount: number; grandTotal: number; top1Share: number; top3Share: number; top10Share: number; hhi: number; risk: 'low' | 'medium' | 'high' }
  clients: Array<{ id: string; name: string; total: number; paid: number; outstanding: number; invoiceCount: number; sharePct: number }>
}
const { data: concentration, pending: concentrationPending } = useLazyFetch<ClientConcentration>(
  '/api/xero/client-concentration',
  fetchOpts
)

const loading = computed(() => pnlPending.value && bsPending.value)

async function refreshAll() {
  // Server caches with SWR by default; hit each endpoint once with
  // ?bust=1 so the KV entry is rewritten from live Xero, then refresh
  // the reactive data hooks to pick up the fresh values.
  const bustUrls = [
    ['/api/xero/reports/pnl-detailed', { toDate: toDate.value }],
    ['/api/xero/reports/balance-sheet', { toDate: toDate.value }],
    ['/api/xero/reports/aging', {}],
    ['/api/xero/reports/aging', { type: 'payables' }],
    ['/api/xero/reports/budget-variance', { month: selectedMonth.value, year: selectedYear.value }],
    ['/api/xero/invoice-pipeline', {}],
    ['/api/xero/reports/bank-summary', {}],
    ['/api/xero/reports/executive-summary', { date: toDate.value }],
    ['/api/xero/repeating-invoices', {}],
    ['/api/xero/reports/client-pnl', {}],
    ['/api/xero/budgets', { periods: 6 }],
    ['/api/xero/credit-notes', {}],
    ['/api/xero/prepayments-overpayments', {}],
    ['/api/xero/client-concentration', {}],
  ] as const
  await Promise.allSettled(
    bustUrls.map(([url, q]) => $fetch(url, { query: { ...q, bust: 1 } }).catch(() => null))
  )
  // Reload the page so every useLazyFetch call rehydrates from the now-
  // fresh KV. Easier than wiring `refresh()` for all 14 fetches, and
  // matches what a user expects from a Refresh button.
  if (typeof window !== 'undefined') window.location.reload()
}

// Concentration risk color
function concentrationRiskColor(risk: 'low' | 'medium' | 'high'): string {
  if (risk === 'high') return 'text-red-500'
  if (risk === 'medium') return 'text-amber-500'
  return 'text-emerald-500'
}

// Executive Summary tiles. Xero's ExecutiveSummary report doesn't publish a
// "Quick Ratio" row — use "Current assets to liabilities" as the current
// ratio and fill the other slots with Gross/Net margin, DSO/DPO, and the
// short-term cash forecast which ARE in the report.
type ExecTile = {
  key: string
  label: string
  value: number | null
  format: 'days' | 'percent' | 'ratio' | 'currency'
  good?: (v: number) => boolean
  bad?: (v: number) => boolean
}
const execTiles = computed<ExecTile[]>(() => {
  const m = execSummary.value?.metrics
  if (!m) return []
  return [
    { key: 'debtorDays', label: 'Debtor days (DSO)', value: m.debtorDays?.latest ?? null, format: 'days', good: v => v <= 45, bad: v => v > 75 },
    { key: 'creditorDays', label: 'Creditor days (DPO)', value: m.creditorDays?.latest ?? null, format: 'days', good: v => v >= 30, bad: v => v < 15 },
    { key: 'currentRatio', label: 'Current assets / liabilities', value: m.currentRatio?.latest ?? null, format: 'ratio', good: v => v >= 1.5, bad: v => v < 1 },
    { key: 'grossProfitPercent', label: 'Gross profit margin', value: m.grossProfitPercent?.latest ?? null, format: 'percent', good: v => v >= 40, bad: v => v < 20 },
    { key: 'netProfitPercent', label: 'Net profit margin', value: m.netProfitPercent?.latest ?? null, format: 'percent', good: v => v >= 15, bad: v => v < 5 },
    { key: 'shortTermCashForecast', label: 'Short-term cash forecast', value: m.shortTermCashForecast?.latest ?? null, format: 'currency', good: v => v > 0, bad: v => v < 0 },
  ]
})

function execTileColor(tile: ExecTile): string {
  if (tile.value === null) return 'text-muted'
  if (tile.bad?.(tile.value)) return 'text-red-500'
  if (tile.good?.(tile.value)) return 'text-emerald-500'
  return 'text-amber-500'
}

function fmtExecValue(tile: ExecTile): string {
  if (tile.value === null) return '—'
  switch (tile.format) {
    case 'ratio': return `${tile.value.toFixed(2)}x`
    case 'percent': return `${tile.value.toFixed(1)}%`
    case 'days': return `${Math.round(tile.value)} days`
    case 'currency': return fmt(tile.value)
  }
}

// ── Formatters ──
function fmt(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function fmtPct(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function fmtPctRaw(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return `${value.toFixed(1)}%`
}

function fmtMultiple(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return `${value.toFixed(2)}x`
}

function fmtDelta(current: number, previous: number): { label: string; sign: 'positive' | 'negative' | 'neutral' } {
  if (previous === 0) {
    if (current === 0) return { label: 'No change', sign: 'neutral' }
    return { label: current > 0 ? 'New' : 'Loss', sign: current > 0 ? 'positive' : 'negative' }
  }
  const delta = current - previous
  const ratio = delta / Math.abs(previous)
  return {
    label: `${delta >= 0 ? '+' : ''}${(ratio * 100).toFixed(1)}% MoM`,
    sign: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'
  }
}

// ── Computed metrics ──
const summary = computed(() => pnl.value?.summary ?? null)
const monthLabel = computed(() => pnl.value?.meta.monthLabel ?? displayLabel.value)

// Scorecard
const scorecard = computed(() => {
  const s = summary.value
  if (!s) return []

  const cashPosition = bankSummary.value?.totalBalance ?? 0
  const grossMargin = s.revenue.month !== 0 ? s.grossProfit.month / s.revenue.month : 0
  const netMargin = s.netMargin.month

  return [
    {
      label: 'Cash Position',
      value: fmt(cashPosition),
      icon: 'i-lucide-wallet',
      color: 'text-blue-500',
      sub: 'Bank accounts total'
    },
    {
      label: 'Monthly Revenue',
      value: fmt(s.revenue.month),
      icon: 'i-lucide-trending-up',
      color: 'text-emerald-500',
      delta: fmtDelta(s.revenue.month, s.revenue.previousMonth),
      sub: `YTD ${fmt(s.revenue.ytd)}`
    },
    {
      label: 'Gross Profit',
      value: fmt(s.grossProfit.month),
      icon: 'i-lucide-bar-chart-3',
      color: 'text-violet-500',
      delta: fmtDelta(s.grossProfit.month, s.grossProfit.previousMonth),
      sub: `Margin ${fmtPct(grossMargin)}`
    },
    {
      label: 'Net Profit',
      value: fmt(s.netProfit.month),
      icon: 'i-lucide-target',
      color: s.netProfit.month >= 0 ? 'text-emerald-500' : 'text-red-500',
      delta: fmtDelta(s.netProfit.month, s.netProfit.previousMonth),
      sub: `Margin ${fmtPct(netMargin)}`
    },
    {
      label: 'Receivables',
      value: fmt(aging.value?.totalOutstanding),
      icon: 'i-lucide-receipt',
      color: 'text-amber-500',
      sub: `${aging.value?.totalInvoices ?? 0} invoices outstanding`
    },
    {
      label: 'Overdue',
      value: fmt(aging.value?.criticalAmount),
      icon: 'i-lucide-alert-triangle',
      color: (aging.value?.criticalCount ?? 0) > 0 ? 'text-red-500' : 'text-green-500',
      sub: aging.value?.criticalCount ? `${aging.value.criticalCount} invoices 90+ days` : 'None past 90 days'
    }
  ]
})

// Aging buckets (for bar chart)
const agingBuckets = computed(() => aging.value?.agingSummary ?? [])
const agingTotal = computed(() => aging.value?.totalOutstanding ?? 0)
const topDebtors = computed(() => aging.value?.topContacts?.slice(0, 5) ?? [])

// Balance sheet ratios
type BenchmarkLevel = 'green' | 'yellow' | 'red'
const bsRatios = computed(() => {
  const bs = balanceSheet.value
  if (!bs) return []
  return [
    {
      label: 'Working Capital',
      value: fmt(bs.workingCapital),
      benchmark: bs.workingCapital > 0
        ? { level: 'green' as BenchmarkLevel, label: 'Positive' }
        : { level: 'red' as BenchmarkLevel, label: 'Negative' }
    },
    {
      label: 'Debt-to-Equity',
      value: fmtMultiple(bs.debtToEquity),
      benchmark: bs.debtToEquity <= 1.5
        ? { level: 'green' as BenchmarkLevel, label: 'Conservative' }
        : bs.debtToEquity <= 3
          ? { level: 'yellow' as BenchmarkLevel, label: 'Moderate' }
          : { level: 'red' as BenchmarkLevel, label: 'High leverage' }
    },
    {
      label: 'Equity Ratio',
      value: fmtPct(bs.equityRatio),
      benchmark: bs.equityRatio >= 0.5
        ? { level: 'green' as BenchmarkLevel, label: 'Strong' }
        : bs.equityRatio >= 0.3
          ? { level: 'yellow' as BenchmarkLevel, label: 'Average' }
          : { level: 'red' as BenchmarkLevel, label: 'Low' }
    }
  ]
})

const benchmarkDotColor: Record<BenchmarkLevel, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500'
}

// Budget table
const budgetColumns = [
  { accessorKey: 'category', header: 'Category', id: 'bv-cat' },
  { accessorKey: 'budgeted', header: 'Budget', id: 'bv-budget', class: 'text-right' },
  { accessorKey: 'actual', header: 'Actual', id: 'bv-actual', class: 'text-right' },
  { accessorKey: 'variance', header: 'Variance', id: 'bv-var', class: 'text-right' },
  { accessorKey: 'status', header: 'Status', id: 'bv-status' }
]

const budgetRows = computed(() =>
  (budget.value?.categoryAnalysis ?? [])
    .filter(c => c.actual > 0 || c.budgeted > 0)
    .map(c => ({
      category: c.category,
      budgeted: fmt(c.budgeted),
      actual: fmt(c.actual),
      variance: `${c.variance >= 0 ? '+' : ''}${fmt(c.variance)} (${c.variancePercent >= 0 ? '+' : ''}${c.variancePercent.toFixed(1)}%)`,
      status: c.status
    }))
)

// Pipeline metrics
const pipelineStages = computed(() => {
  if (!pipeline.value?.stages) return []
  const order = ['draft', 'submitted', 'authorised', 'overdue', 'paid']
  return order
    .filter(key => pipeline.value!.stages[key])
    .map(key => {
      const stage = pipeline.value!.stages[key]
      return { key, ...stage }
    })
})

// Aging bar color
function agingBarColor(bucket: string) {
  if (bucket === 'current') return 'bg-green-500'
  if (bucket === '1-30') return 'bg-blue-500'
  if (bucket === '31-60') return 'bg-yellow-500'
  if (bucket === '61-90') return 'bg-orange-500'
  return 'bg-red-500'
}

function agingBarLabel(bucket: string) {
  if (bucket === 'current') return 'Current'
  if (bucket === '90+') return '90+ days'
  return `${bucket} days`
}

// Pipeline stage color
function stageColor(key: string) {
  const map: Record<string, string> = {
    draft: 'neutral', submitted: 'info', authorised: 'warning', overdue: 'error', paid: 'success'
  }
  return map[key] ?? 'neutral'
}

// Quick nav links
const quickLinks = [
  { label: 'Profit & Loss', description: 'Detailed P&L with breakdowns, benchmarks, and client concentration', icon: 'i-lucide-pie-chart', to: '/profit-loss', color: 'text-violet-500' },
  { label: 'Cash Flow', description: 'Forecast, scenarios, waterfall, and working capital analysis', icon: 'i-lucide-trending-up', to: '/cashflow', color: 'text-blue-500' },
  { label: 'Invoices', description: 'Invoice pipeline, aging, and collection tracking', icon: 'i-lucide-receipt', to: '/invoices', color: 'text-emerald-500' },
  { label: 'Expenses', description: 'Expense tracking and budget management', icon: 'i-lucide-credit-card', to: '/expenses', color: 'text-amber-500' },
  { label: 'Consolidated P&L', description: 'Aggregated performance across all connected organizations', icon: 'i-lucide-layers', to: '/reports/consolidated', color: 'text-pink-500' },
  { label: 'Customers', description: 'Client accounts, balances, and payment history', icon: 'i-lucide-users', to: '/customers', color: 'text-cyan-500' },
]

const breadcrumbs = computed(() => ([
  { label: 'XeroFlow', to: '/xeroflow' },
  { label: 'Financial Reports', to: '/reports' }
]))
</script>

<template>
  <UDashboardPanel id="financial-reports">
    <template #header>
      <UDashboardNavbar title="Financial Reports" :description="`Agency financial command center — ${displayLabel}`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="Refresh"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="refreshAll"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :links="breadcrumbs" />

          <!-- Month picker -->
          <div class="flex items-center gap-1 ml-4">
            <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="xs" @click="prevMonth" />

            <UPopover v-model:open="popoverOpen" :content="{ align: 'start' }">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-calendar"
                class="data-[state=open]:bg-elevated group min-w-[170px] justify-between"
              >
                <span class="font-medium text-sm">{{ displayLabel }}</span>
                <template #trailing>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="shrink-0 text-dimmed size-4 group-data-[state=open]:rotate-180 transition-transform duration-200"
                  />
                </template>
              </UButton>

              <template #content>
                <div class="flex items-stretch sm:divide-x divide-default">
                  <div class="flex flex-col py-1">
                    <div class="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Quick Select</div>
                    <UButton
                      v-for="s in shortcuts"
                      :key="s.label"
                      :label="s.label"
                      color="neutral"
                      variant="ghost"
                      class="rounded-none px-4 text-sm"
                      :class="[isActiveShortcut(s) ? 'bg-elevated font-medium' : 'hover:bg-elevated/50']"
                      @click="selectShortcut(s)"
                    />
                  </div>
                  <div class="p-2">
                    <UCalendar v-model="calendarValue" class="rounded-lg" />
                  </div>
                </div>
              </template>
            </UPopover>

            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="isCurrentMonth"
              @click="nextMonth"
            />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="loading" class="space-y-6">
        <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <USkeleton v-for="n in 6" :key="`sc-${n}`" class="h-28" />
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <USkeleton class="h-64" />
          <USkeleton class="h-64" />
        </div>
        <USkeleton class="h-80" />
      </div>

      <div v-else class="space-y-6">
        <!-- ═══ Financial Health Scorecard ═══ -->
        <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <UCard v-for="card in scorecard" :key="card.label" :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">{{ card.label }}</p>
              <UIcon :name="card.icon" :class="['size-5', card.color]" />
            </div>
            <p class="text-xl font-bold">{{ card.value }}</p>
            <div v-if="card.delta" class="mt-1">
              <span
                :class="[
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                  card.delta.sign === 'positive' && 'bg-positive/10 text-positive',
                  card.delta.sign === 'negative' && 'bg-negative/10 text-negative',
                  card.delta.sign === 'neutral' && 'bg-muted/30 text-muted'
                ]"
              >
                {{ card.delta.label }}
              </span>
            </div>
            <p class="text-[11px] text-muted mt-1">{{ card.sub }}</p>
          </UCard>
        </div>

        <!-- ═══ Executive Summary (Xero KPIs) + Recurring Revenue ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <!-- Executive Summary tiles from Xero's server-side KPI report -->
          <UCard class="xl:col-span-2" :ui="{ body: '!p-6 space-y-4' }">
            <header class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase text-muted">Executive Summary</p>
                <h3 class="text-lg font-semibold">Key financial ratios</h3>
              </div>
              <span class="text-[10px] text-muted">Source: Xero</span>
            </header>
            <div v-if="execPending" class="grid grid-cols-3 gap-3">
              <USkeleton v-for="n in 6" :key="`es-sk-${n}`" class="h-20" />
            </div>
            <div v-else-if="execTiles.length" class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div v-for="tile in execTiles" :key="tile.key" class="rounded-lg border border-default px-3 py-3 bg-elevated/30">
                <p class="text-[10px] uppercase text-muted tracking-wide mb-1">{{ tile.label }}</p>
                <p :class="['text-lg font-semibold', execTileColor(tile)]">{{ fmtExecValue(tile) }}</p>
              </div>
            </div>
            <p v-else class="text-sm text-muted">Executive Summary unavailable — Xero may not have returned any periods for this date.</p>
          </UCard>

          <!-- Recurring revenue from repeating invoices -->
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase text-muted">Recurring Revenue</p>
                <h3 class="text-lg font-semibold">Retainers &amp; subscriptions</h3>
              </div>
              <UIcon name="i-lucide-repeat" class="size-4 text-primary" />
            </header>
            <div v-if="recurringPending" class="space-y-3">
              <USkeleton class="h-10" />
              <USkeleton class="h-10" />
              <USkeleton class="h-10" />
            </div>
            <template v-else-if="recurring">
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-lg border border-default px-3 py-3 bg-elevated/30">
                  <p class="text-[10px] uppercase text-muted tracking-wide">MRR</p>
                  <p class="text-xl font-semibold">{{ fmt(recurring.summary.mrr) }}</p>
                </div>
                <div class="rounded-lg border border-default px-3 py-3 bg-elevated/30">
                  <p class="text-[10px] uppercase text-muted tracking-wide">ARR</p>
                  <p class="text-xl font-semibold">{{ fmt(recurring.summary.arr) }}</p>
                </div>
              </div>
              <div class="text-xs text-muted">
                {{ recurring.summary.activeCount }} active schedule{{ recurring.summary.activeCount === 1 ? '' : 's' }}
                across {{ recurring.summary.clientCount }} client{{ recurring.summary.clientCount === 1 ? '' : 's' }}
              </div>
              <div v-if="recurring.topClients?.length" class="pt-3 border-t border-default space-y-2">
                <p class="text-[10px] uppercase text-muted font-semibold tracking-wider">Top recurring clients</p>
                <div v-for="c in recurring.topClients.slice(0, 5)" :key="c.contactId || c.contact" class="flex items-center justify-between text-xs">
                  <span class="truncate pr-2">{{ c.contact }}</span>
                  <span class="font-medium text-muted">{{ fmt(c.monthly) }}/mo</span>
                </div>
              </div>
            </template>
            <p v-else class="text-sm text-muted">No repeating invoices found. Set up retainers in Xero to populate this tile.</p>
          </UCard>
        </div>

        <!-- ═══ Unearned Revenue + Credits Issued + Client Concentration ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <!-- Unearned revenue (prepayments + overpayments) -->
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase text-muted">Unearned Revenue</p>
                <h3 class="text-lg font-semibold">Deposits &amp; credits held</h3>
              </div>
              <UIcon name="i-lucide-wallet-cards" class="size-4 text-amber-500" />
            </header>
            <div v-if="unearnedPending" class="space-y-3">
              <USkeleton class="h-14" /><USkeleton class="h-10" />
            </div>
            <template v-else-if="unearned">
              <div class="rounded-lg border border-default px-3 py-3 bg-elevated/30">
                <p class="text-[10px] uppercase text-muted tracking-wide">Total held</p>
                <p class="text-2xl font-semibold">{{ fmt(unearned.summary.totalUnearned) }}</p>
                <p class="text-[11px] text-muted mt-1">
                  {{ fmt(unearned.summary.prepayRemaining) }} prepay · {{ fmt(unearned.summary.overpayRemaining) }} overpay
                </p>
              </div>
              <div class="text-xs text-muted">
                {{ unearned.summary.prepayCount + unearned.summary.overpayCount }} records across {{ unearned.summary.contactCount }} client{{ unearned.summary.contactCount === 1 ? '' : 's' }}
              </div>
              <div v-if="unearned.topContacts?.length" class="pt-3 border-t border-default space-y-2">
                <p class="text-[10px] uppercase text-muted font-semibold tracking-wider">Top balances</p>
                <div v-for="c in unearned.topContacts.slice(0, 4)" :key="c.name" class="flex items-center justify-between text-xs">
                  <span class="truncate pr-2">{{ c.name }}</span>
                  <span class="font-medium text-muted">{{ fmt(c.total) }}</span>
                </div>
              </div>
            </template>
            <p v-else class="text-sm text-muted">No unearned revenue — no open prepayments or overpayments.</p>
          </UCard>

          <!-- Credit notes issued -->
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase text-muted">Credits Issued</p>
                <h3 class="text-lg font-semibold">Client credit notes</h3>
              </div>
              <UIcon name="i-lucide-file-minus" class="size-4 text-red-500" />
            </header>
            <div v-if="creditNotesPending" class="space-y-3">
              <USkeleton class="h-14" /><USkeleton class="h-10" />
            </div>
            <template v-else-if="creditNotes">
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-lg border border-default px-3 py-3 bg-elevated/30">
                  <p class="text-[10px] uppercase text-muted tracking-wide">This month</p>
                  <p class="text-xl font-semibold">{{ fmt(creditNotes.summary.issuedMonthTotal) }}</p>
                  <p class="text-[11px] text-muted">{{ creditNotes.summary.issuedMonthCount }} issued</p>
                </div>
                <div class="rounded-lg border border-default px-3 py-3 bg-elevated/30">
                  <p class="text-[10px] uppercase text-muted tracking-wide">YTD</p>
                  <p class="text-xl font-semibold">{{ fmt(creditNotes.summary.issuedYtdTotal) }}</p>
                  <p class="text-[11px] text-muted">{{ creditNotes.summary.issuedYtdCount }} issued</p>
                </div>
              </div>
              <div v-if="creditNotes.summary.receivedYtdTotal > 0" class="text-xs text-muted">
                Received YTD: {{ fmt(creditNotes.summary.receivedYtdTotal) }} ({{ creditNotes.summary.receivedYtdCount }} from suppliers)
              </div>
              <div v-if="creditNotes.topContacts?.length" class="pt-3 border-t border-default space-y-2">
                <p class="text-[10px] uppercase text-muted font-semibold tracking-wider">Most credited YTD</p>
                <div v-for="c in creditNotes.topContacts.slice(0, 4)" :key="c.name" class="flex items-center justify-between text-xs">
                  <span class="truncate pr-2">{{ c.name }}</span>
                  <span class="font-medium text-muted">{{ fmt(c.total) }}</span>
                </div>
              </div>
            </template>
            <p v-else class="text-sm text-muted">No credit notes in the period.</p>
          </UCard>

          <!-- Client concentration -->
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase text-muted">Client Concentration</p>
                <h3 class="text-lg font-semibold">Revenue mix (YTD)</h3>
              </div>
              <UBadge v-if="concentration" :color="concentration.summary.risk === 'high' ? 'error' : concentration.summary.risk === 'medium' ? 'warning' : 'success'" variant="subtle" size="xs">
                {{ concentration.summary.risk }} risk
              </UBadge>
            </header>
            <div v-if="concentrationPending" class="space-y-3">
              <USkeleton class="h-14" /><USkeleton class="h-10" />
            </div>
            <template v-else-if="concentration && concentration.clients.length">
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-lg border border-default px-2 py-2 bg-elevated/30">
                  <p class="text-[10px] uppercase text-muted tracking-wide">Top 1</p>
                  <p :class="['text-lg font-semibold', concentrationRiskColor(concentration.summary.top1Share > 35 ? 'high' : concentration.summary.top1Share > 20 ? 'medium' : 'low')]">
                    {{ concentration.summary.top1Share.toFixed(1) }}%
                  </p>
                </div>
                <div class="rounded-lg border border-default px-2 py-2 bg-elevated/30">
                  <p class="text-[10px] uppercase text-muted tracking-wide">Top 3</p>
                  <p class="text-lg font-semibold">{{ concentration.summary.top3Share.toFixed(1) }}%</p>
                </div>
                <div class="rounded-lg border border-default px-2 py-2 bg-elevated/30">
                  <p class="text-[10px] uppercase text-muted tracking-wide">Top 10</p>
                  <p class="text-lg font-semibold">{{ concentration.summary.top10Share.toFixed(1) }}%</p>
                </div>
              </div>
              <div class="text-xs text-muted">
                {{ concentration.summary.clientCount }} clients · {{ fmt(concentration.summary.grandTotal) }} YTD
              </div>
              <div class="pt-3 border-t border-default space-y-2">
                <p class="text-[10px] uppercase text-muted font-semibold tracking-wider">Top clients</p>
                <div v-for="c in concentration.clients.slice(0, 5)" :key="c.id || c.name" class="flex items-center justify-between text-xs gap-2">
                  <span class="truncate">{{ c.name }}</span>
                  <div class="flex items-center gap-2 shrink-0">
                    <div class="h-1 w-16 rounded-full bg-elevated overflow-hidden">
                      <div class="h-full bg-primary" :style="{ width: Math.min(100, c.sharePct * 2) + '%' }" />
                    </div>
                    <span class="font-medium text-muted w-12 text-right">{{ c.sharePct.toFixed(1) }}%</span>
                  </div>
                </div>
              </div>
            </template>
            <p v-else class="text-sm text-muted">No YTD revenue found yet.</p>
          </UCard>
        </div>

        <!-- ═══ Client / Project P&L (via tracking categories) ═══ -->
        <UCard :ui="{ body: '!p-6 space-y-5' }">
          <header class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase text-muted">Client P&amp;L</p>
              <h3 class="text-lg font-semibold">
                {{ clientPnl?.category?.name ? `By ${clientPnl.category.name.toLowerCase()}` : 'Tracking-category split' }}
              </h3>
            </div>
            <span v-if="clientPnl?.category" class="text-[10px] text-muted">{{ monthLabel }}</span>
          </header>

          <div v-if="clientPnlPending" class="space-y-2">
            <USkeleton v-for="n in 5" :key="`cp-sk-${n}`" class="h-8" />
          </div>
          <template v-else-if="clientPnl?.category && clientPnl.options.length">
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-xs uppercase text-muted border-b border-default">
                    <th class="py-2 pr-3 font-medium">{{ clientPnl.category.name }}</th>
                    <th class="py-2 px-3 font-medium text-right">Revenue</th>
                    <th class="py-2 px-3 font-medium text-right">Gross profit</th>
                    <th class="py-2 px-3 font-medium text-right">Net profit</th>
                    <th class="py-2 pl-3 font-medium text-right">Net margin</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="opt in clientPnl.options.slice(0, 10)" :key="opt.name" class="border-b border-default/40 hover:bg-elevated/40">
                    <td class="py-2 pr-3">{{ opt.name }}</td>
                    <td class="py-2 px-3 text-right font-medium">{{ fmt(opt.revenue) }}</td>
                    <td class="py-2 px-3 text-right">{{ fmt(opt.grossProfit) }}</td>
                    <td class="py-2 px-3 text-right" :class="opt.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'">{{ fmt(opt.netProfit) }}</td>
                    <td class="py-2 pl-3 text-right text-xs text-muted">{{ fmtPct(opt.netMargin) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="clientPnl.options.length > 10" class="text-xs text-muted pt-2">
              Showing top 10 of {{ clientPnl.options.length }} {{ clientPnl.category.name.toLowerCase() }}s
            </p>
          </template>
          <p v-else class="text-sm text-muted">
            No tracking-category data. Set up a Client or Project tracking category in Xero and tag your invoices to see per-client profitability here.
          </p>
        </UCard>

        <!-- ═══ P&L Summary + Balance Sheet ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <!-- P&L Summary -->
          <UCard :ui="{ body: '!p-6 space-y-5' }">
            <header class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase text-muted">Profit &amp; Loss</p>
                <h3 class="text-lg font-semibold">{{ monthLabel }}</h3>
              </div>
              <UButton label="Deep Dive" variant="ghost" color="primary" size="xs" to="/profit-loss" icon="i-lucide-arrow-right" trailing />
            </header>

            <div v-if="summary" class="space-y-3">
              <div v-for="item in [
                { label: 'Revenue', val: summary.revenue },
                { label: 'Cost of Sales', val: summary.costOfSales },
                { label: 'Gross Profit', val: summary.grossProfit },
                { label: 'Operating Expenses', val: summary.operatingExpenses },
                { label: 'Net Profit', val: summary.netProfit }
              ]" :key="item.label" class="flex items-center justify-between text-sm">
                <span class="text-muted">{{ item.label }}</span>
                <div class="flex items-center gap-3">
                  <span class="font-medium">{{ fmt(item.val.month) }}</span>
                  <span class="text-xs text-muted w-20 text-right">{{ fmt(item.val.ytd) }} YTD</span>
                </div>
              </div>

              <div class="pt-3 border-t border-default flex items-center justify-between text-sm">
                <span class="text-muted">Net Margin</span>
                <div class="flex items-center gap-3">
                  <span class="font-semibold">{{ fmtPct(summary.netMargin.month) }}</span>
                  <span class="text-xs text-muted w-20 text-right">{{ fmtPct(summary.netMargin.ytd) }} YTD</span>
                </div>
              </div>
            </div>

            <!-- Top insights -->
            <div v-if="pnl?.insights?.length" class="pt-3 border-t border-default space-y-2">
              <p class="text-[10px] uppercase text-muted font-semibold tracking-wider">Insights</p>
              <div v-for="(insight, i) in pnl.insights.slice(0, 3)" :key="i" class="flex gap-2 items-start">
                <UIcon name="i-lucide-sparkles" class="size-3.5 text-primary mt-0.5 shrink-0" />
                <span class="text-xs text-muted leading-relaxed">{{ insight }}</span>
              </div>
            </div>
          </UCard>

          <!-- Balance Sheet -->
          <UCard :ui="{ body: '!p-6 space-y-5' }">
            <header class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase text-muted">Balance Sheet</p>
                <h3 class="text-lg font-semibold">Position as at {{ balanceSheet?.date ?? toDate }}</h3>
              </div>
            </header>

            <div v-if="bsPending" class="space-y-3">
              <USkeleton v-for="n in 3" :key="`bs-sk-${n}`" class="h-5" />
            </div>
            <template v-else-if="balanceSheet">
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <p class="text-xs text-muted uppercase mb-1">Total Assets</p>
                  <p class="text-xl font-semibold">{{ fmt(balanceSheet.totalAssets) }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted uppercase mb-1">Total Liabilities</p>
                  <p class="text-xl font-semibold">{{ fmt(balanceSheet.totalLiabilities) }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted uppercase mb-1">Total Equity</p>
                  <p class="text-xl font-semibold">{{ fmt(balanceSheet.totalEquity) }}</p>
                </div>
              </div>

              <div class="space-y-3 pt-3 border-t border-default">
                <div v-for="ratio in bsRatios" :key="ratio.label" class="flex items-center justify-between">
                  <span class="text-sm text-muted">{{ ratio.label }}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium">{{ ratio.value }}</span>
                    <span class="flex items-center gap-1">
                      <span :class="['inline-block size-2 rounded-full', benchmarkDotColor[ratio.benchmark.level]]" />
                      <span class="text-[10px] text-muted">{{ ratio.benchmark.label }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <p v-else class="text-sm text-muted">Balance sheet data unavailable.</p>
          </UCard>
        </div>

        <!-- ═══ Receivables Aging ═══ -->
        <UCard :ui="{ body: '!p-6 space-y-5' }">
          <header class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase text-muted">Receivables Aging</p>
              <h3 class="text-lg font-semibold">{{ fmt(agingTotal) }} Outstanding</h3>
            </div>
            <div v-if="aging" class="flex items-center gap-3 text-xs text-muted">
              <span>{{ aging.totalInvoices }} invoices</span>
              <span>Avg {{ Math.round(aging.averageDaysPastDue) }} days</span>
            </div>
          </header>

          <div v-if="agingPending" class="space-y-3">
            <USkeleton v-for="n in 5" :key="`ag-sk-${n}`" class="h-8" />
          </div>
          <template v-else-if="agingBuckets.length">
            <!-- Aging bars -->
            <div class="space-y-2">
              <div v-for="bucket in agingBuckets" :key="bucket.bucket" class="flex items-center gap-3">
                <span class="text-xs text-muted w-20 text-right shrink-0">{{ agingBarLabel(bucket.bucket) }}</span>
                <div class="flex-1 h-6 bg-muted/10 rounded-full overflow-hidden relative">
                  <div
                    :class="['h-full rounded-full transition-all duration-500', agingBarColor(bucket.bucket)]"
                    :style="{ width: agingTotal > 0 ? `${Math.max(2, (bucket.amount / agingTotal) * 100)}%` : '0%' }"
                  />
                </div>
                <div class="text-xs text-right shrink-0 w-28">
                  <span class="font-medium">{{ fmt(bucket.amount) }}</span>
                  <span class="text-muted ml-1">({{ bucket.count }})</span>
                </div>
              </div>
            </div>

            <!-- Top debtors -->
            <div v-if="topDebtors.length" class="pt-4 border-t border-default">
              <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-3">Top Outstanding Contacts</p>
              <div class="space-y-2">
                <div v-for="contact in topDebtors" :key="contact.name" class="flex items-center justify-between text-sm">
                  <div class="flex items-center gap-2 min-w-0">
                    <UAvatar :label="contact.name.charAt(0)" size="xs" />
                    <span class="font-medium truncate">{{ contact.name }}</span>
                    <UBadge v-if="contact.oldestDays > 60" color="error" variant="subtle" size="xs">
                      {{ contact.oldestDays }}d
                    </UBadge>
                  </div>
                  <div class="flex items-center gap-2 text-xs shrink-0">
                    <span class="font-medium">{{ fmt(contact.amount) }}</span>
                    <span class="text-muted">({{ contact.count }})</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <p v-else class="text-sm text-muted">No aging data available. Connect to Xero to view receivables.</p>
        </UCard>

        <!-- ═══ Xero Budgets (native) ═══ -->
        <UCard v-if="xeroBudgetsPending || xeroBudgets?.selected" :ui="{ body: '!p-6 space-y-5' }">
          <header class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase text-muted">Xero Budget</p>
              <h3 class="text-lg font-semibold">{{ xeroBudgets?.selected?.description || 'Primary budget' }}</h3>
            </div>
            <span class="text-[10px] text-muted">Source: Xero BudgetSummary</span>
          </header>
          <div v-if="xeroBudgetsPending" class="space-y-2">
            <USkeleton v-for="n in 6" :key="`xb-sk-${n}`" class="h-7" />
          </div>
          <template v-else-if="xeroBudgets && xeroBudgets.rows.length">
            <div class="max-h-80 overflow-y-auto border border-default/40 rounded-md">
              <table class="w-full text-sm">
                <thead class="sticky top-0 bg-default border-b border-default">
                  <tr class="text-left text-xs uppercase text-muted">
                    <th class="py-2 pl-3 pr-2 font-medium">Account</th>
                    <th v-for="label in xeroBudgets.periodLabels" :key="label" class="py-2 px-2 font-medium text-right">{{ label }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in xeroBudgets.rows" :key="row.label" class="border-b border-default/30 hover:bg-elevated/40">
                    <td class="py-1.5 pl-3 pr-2 truncate max-w-[200px]">{{ row.label }}</td>
                    <td v-for="(v, i) in row.values" :key="i" class="py-1.5 px-2 text-right font-medium" :class="v === 0 ? 'text-muted' : ''">{{ v === 0 ? '—' : fmt(v) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-[11px] text-muted">{{ xeroBudgets.rows.length }} accounts across {{ xeroBudgets.periodLabels.length }} periods</p>
          </template>
          <p v-else class="text-sm text-muted">No budget configured in Xero, or the selected budget has no entries.</p>
        </UCard>

        <!-- ═══ Budget Variance + Invoice Pipeline ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <!-- Budget Variance -->
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase text-muted">Budget vs Actual</p>
                <h3 class="text-lg font-semibold">{{ budget?.period?.monthName ?? displayLabel }} {{ budget?.period?.year ?? selectedYear }}</h3>
              </div>
              <div v-if="budget?.summary" class="text-right">
                <p class="text-sm font-semibold" :class="(budget.summary.totalVariance ?? 0) > 0 ? 'text-red-500' : 'text-green-500'">
                  {{ budget.summary.totalVariance >= 0 ? '+' : '' }}{{ fmt(budget.summary.totalVariance) }}
                </p>
                <p class="text-[10px] text-muted">{{ fmtPctRaw(budget.summary.totalVariancePercent) }} variance</p>
              </div>
            </header>

            <div v-if="budgetPending" class="space-y-3">
              <USkeleton v-for="n in 4" :key="`bud-sk-${n}`" class="h-8" />
            </div>
            <template v-else-if="budgetRows.length">
              <div class="flex gap-3 text-xs">
                <UBadge v-if="budget?.summary?.overBudgetCount" color="error" variant="subtle">
                  {{ budget.summary.overBudgetCount }} over budget
                </UBadge>
                <UBadge v-if="budget?.summary?.underBudgetCount" color="success" variant="subtle">
                  {{ budget.summary.underBudgetCount }} under budget
                </UBadge>
                <UBadge v-if="budget?.period?.isCurrentMonth" color="info" variant="subtle">
                  Projected: {{ fmt(budget?.summary?.projectedMonthEnd) }}
                </UBadge>
              </div>

              <!-- Cap the Budget table height; long budget lists would
                   otherwise push Invoice Pipeline far below the fold. -->
              <div class="max-h-96 overflow-y-auto border border-default/40 rounded-md">
                <UTable :columns="budgetColumns" :data="budgetRows" sticky>
                  <template #status-cell="{ row }">
                    <UBadge
                      :color="row.original.status === 'over' ? 'error' : row.original.status === 'under' ? 'success' : 'neutral'"
                      variant="subtle"
                      size="xs"
                    >
                      {{ row.original.status === 'over' ? 'Over' : row.original.status === 'under' ? 'Under' : 'On Track' }}
                    </UBadge>
                  </template>
                </UTable>
              </div>
              <p class="text-[10px] text-muted">{{ budgetRows.length }} {{ budgetRows.length === 1 ? 'category' : 'categories' }} — scroll for more</p>

              <!-- Budget alerts -->
              <div v-if="budget?.alerts?.length" class="space-y-1 pt-2 border-t border-default">
                <div v-for="(alert, i) in budget.alerts.slice(0, 3)" :key="i" class="flex gap-2 items-start">
                  <UIcon
                    :name="alert.severity === 'high' ? 'i-lucide-alert-triangle' : 'i-lucide-info'"
                    :class="alert.severity === 'high' ? 'text-red-500' : 'text-amber-500'"
                    class="size-3.5 mt-0.5 shrink-0"
                  />
                  <span class="text-xs text-muted">{{ alert.message }}</span>
                </div>
              </div>
            </template>
            <p v-else class="text-sm text-muted">No budget data available for this period.</p>
          </UCard>

          <!-- Invoice Pipeline -->
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase text-muted">Invoice Pipeline</p>
                <h3 class="text-lg font-semibold">{{ fmt(pipeline?.summary?.totalValue) }} Total</h3>
              </div>
              <div v-if="pipeline?.summary" class="flex items-center gap-2">
                <UBadge
                  :color="pipeline.summary.riskLevel === 'low' ? 'success' : pipeline.summary.riskLevel === 'medium' ? 'warning' : 'error'"
                  variant="subtle"
                >
                  {{ pipeline.summary.riskLevel === 'low' ? 'Healthy' : pipeline.summary.riskLevel === 'medium' ? 'Watch' : 'At Risk' }}
                </UBadge>
              </div>
            </header>

            <div v-if="pipelinePending" class="space-y-3">
              <USkeleton v-for="n in 5" :key="`pipe-sk-${n}`" class="h-10" />
            </div>
            <template v-else-if="pipelineStages.length">
              <!-- Stage bars -->
              <div class="space-y-2">
                <div v-for="stage in pipelineStages" :key="stage.key" class="flex items-center gap-3">
                  <span class="text-xs text-muted w-20 text-right shrink-0">{{ stage.name }}</span>
                  <div class="flex-1 h-7 bg-muted/10 rounded overflow-hidden flex items-center px-2 relative">
                    <div
                      class="absolute inset-y-0 left-0 rounded transition-all duration-500 opacity-20"
                      :class="{
                        'bg-neutral-400': stage.key === 'draft',
                        'bg-blue-500': stage.key === 'submitted',
                        'bg-amber-500': stage.key === 'authorised',
                        'bg-red-500': stage.key === 'overdue',
                        'bg-emerald-500': stage.key === 'paid'
                      }"
                      :style="{ width: (pipeline?.summary?.totalValue ?? 0) > 0 ? `${Math.max(3, stage.percentage)}%` : '0%' }"
                    />
                    <span class="relative text-xs font-medium">{{ stage.count }}</span>
                  </div>
                  <span class="text-xs font-medium shrink-0 w-24 text-right">{{ fmt(stage.value) }}</span>
                </div>
              </div>

              <!-- Key metrics -->
              <div class="grid grid-cols-3 gap-3 pt-3 border-t border-default">
                <div>
                  <p class="text-[10px] text-muted uppercase">Avg Collection</p>
                  <p class="text-sm font-semibold">{{ pipeline?.summary?.averageCollectionTime ?? 0 }} days</p>
                </div>
                <div>
                  <p class="text-[10px] text-muted uppercase">Overdue Rate</p>
                  <p class="text-sm font-semibold" :class="(pipeline?.summary?.overdueRate ?? 0) > 15 ? 'text-red-500' : ''">
                    {{ fmtPctRaw(pipeline?.summary?.overdueRate) }}
                  </p>
                </div>
                <div>
                  <p class="text-[10px] text-muted uppercase">Outstanding</p>
                  <p class="text-sm font-semibold">{{ fmt(pipeline?.summary?.outstandingValue) }}</p>
                </div>
              </div>

              <!-- Recommendations -->
              <div v-if="pipeline?.recommendations?.length" class="space-y-1 pt-2 border-t border-default">
                <div v-for="(rec, i) in pipeline.recommendations.slice(0, 3)" :key="i" class="flex gap-2 items-start">
                  <UIcon name="i-lucide-lightbulb" class="size-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span class="text-xs text-muted">{{ rec }}</span>
                </div>
              </div>
            </template>
            <p v-else class="text-sm text-muted">No pipeline data available.</p>
          </UCard>
        </div>

        <!-- ═══ Payables Summary (compact) ═══ -->
        <UCard v-if="agingPayables && !agingPayPending" :ui="{ body: '!p-6' }">
          <header class="flex items-center justify-between mb-4">
            <div>
              <p class="text-xs uppercase text-muted">Payables Aging</p>
              <h3 class="text-lg font-semibold">{{ fmt(agingPayables.totalOutstanding) }} Owed to Vendors</h3>
            </div>
            <div class="flex items-center gap-3 text-xs text-muted">
              <span>{{ agingPayables.totalInvoices }} bills</span>
              <span>Avg {{ Math.round(agingPayables.averageDaysPastDue) }} days</span>
            </div>
          </header>

          <div class="flex gap-3 flex-wrap">
            <div
              v-for="bucket in agingPayables.agingSummary"
              :key="bucket.bucket"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/5 border border-default"
            >
              <span :class="['inline-block size-2.5 rounded-full', agingBarColor(bucket.bucket)]" />
              <span class="text-xs text-muted">{{ agingBarLabel(bucket.bucket) }}</span>
              <span class="text-xs font-medium">{{ fmt(bucket.amount) }}</span>
              <span class="text-[10px] text-muted">({{ bucket.count }})</span>
            </div>
          </div>
        </UCard>

        <!-- ═══ Quick Navigation ═══ -->
        <div>
          <p class="text-xs uppercase text-muted font-semibold tracking-wider mb-3">Deep Dive Reports</p>
          <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <NuxtLink
              v-for="link in quickLinks"
              :key="link.to"
              :to="link.to"
              class="group flex flex-col gap-2 p-4 rounded-xl border border-default bg-default hover:bg-elevated transition-colors"
            >
              <UIcon :name="link.icon" :class="['size-6', link.color]" />
              <p class="text-sm font-medium group-hover:text-primary transition-colors">{{ link.label }}</p>
              <p class="text-[11px] text-muted leading-relaxed">{{ link.description }}</p>
            </NuxtLink>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
