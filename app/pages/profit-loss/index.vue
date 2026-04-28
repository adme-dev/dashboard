<script setup lang="ts">
import { CalendarDate, today, getLocalTimeZone } from '@internationalized/date'

definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

type TrendSeries = {
  labels: string[]
  revenue: number[]
  expenses: number[]
  netProfit: number[]
}

type BreakdownItem = {
  name: string
  month: number
  previousMonth: number
  ytd: number
  monthShare: number
  ytdShare: number
}

type SummaryMetric = {
  month: number
  previousMonth: number
  ytd: number
}

type DeltaDescriptor = {
  label: string
  sign: 'positive' | 'negative' | 'neutral'
}

type SummaryRow = {
  label: string
  metric: SummaryMetric
  delta: DeltaDescriptor
}

type ProfitAndLossReport = {
  meta: {
    basis: string
    generatedAt: string
    monthStart: string
    monthEnd: string
    monthLabel: string
    ytdStart: string
    ytdLabel: string
    periodLabels: string[]
  }
  summary: {
    revenue: SummaryMetric
    costOfSales: SummaryMetric
    grossProfit: SummaryMetric
    operatingExpenses: SummaryMetric
    netProfit: SummaryMetric
    netMargin: SummaryMetric
  }
  trend: TrendSeries
  breakdown: {
    revenue: BreakdownItem[]
    directCosts: BreakdownItem[]
    expenses: BreakdownItem[]
  }
  periods: Array<{
    label: string
    revenue: number
    directCosts: number
    grossProfit: number
    operatingExpenses: number
    netProfit: number
  }>
  trailing: {
    periods: number
    revenue: number
    directCosts: number
    operatingExpenses: number
    netProfit: number
  }
  insights: string[]
}

import ProfitTrendChart from '~/components/reports/ProfitTrendChart.client.vue'

// ── URL query string sync ──
const route = useRoute()
const router = useRouter()

const now = new Date()
const defaultMonth = now.getMonth() + 1
const defaultYear = now.getFullYear()

// Seed from URL query params (with validation)
const qMonth = Number(route.query.month)
const qYear = Number(route.query.year)
const qBasis = String(route.query.basis || '')

// ── Month picker state ──
const tz = getLocalTimeZone()
const nowCal = today(tz)
const selectedMonth = ref(qMonth >= 1 && qMonth <= 12 ? qMonth : defaultMonth)
const selectedYear = ref(qYear >= 2000 && qYear <= 2100 ? qYear : defaultYear)
const basis = ref<'accrual' | 'cash'>(qBasis === 'cash' ? 'cash' : 'accrual')
const popoverOpen = ref(false)

// Push state back to URL for shareable links
watch([selectedMonth, selectedYear, basis], () => {
  const query: Record<string, string> = {}
  const isDefaultPeriod = selectedMonth.value === defaultMonth && selectedYear.value === defaultYear
  if (!isDefaultPeriod) {
    query.month = String(selectedMonth.value)
    query.year = String(selectedYear.value)
  }
  if (basis.value !== 'accrual') {
    query.basis = basis.value
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

// Calendar model
const calendarValue = computed({
  get: () => new CalendarDate(selectedYear.value, selectedMonth.value, 1),
  set: (val: CalendarDate) => {
    selectedMonth.value = val.month
    selectedYear.value = val.year
    popoverOpen.value = false
  }
})

// Shortcuts
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
  if (selectedMonth.value === 1) {
    selectedMonth.value = 12
    selectedYear.value--
  } else {
    selectedMonth.value--
  }
}

function nextMonth() {
  if (selectedMonth.value === 12) {
    selectedMonth.value = 1
    selectedYear.value++
  } else {
    selectedMonth.value++
  }
}

const isCurrentMonth = computed(() =>
  selectedMonth.value === nowCal.month && selectedYear.value === nowCal.year
)

// ── P&L data fetch ──
const { data, pending, error, refresh } = await useFetch<ProfitAndLossReport>(
  '/api/xero/reports/pnl-detailed',
  { query: computed(() => ({ toDate: toDate.value, basis: basis.value })) }
)

// ── Client profitability fetch ──
const { data: profitability, pending: profitPending } = await useFetch<{
  summary: { clientCount: number; totalCommission: number }
  clients: Array<{ name: string; commission: number; commissionRate: number }>
}>('/api/agency/projects/profitability', {
  query: computed(() => ({ month: selectedMonth.value, year: selectedYear.value }))
})

// ── KPIs fetch ──
const { data: kpis } = await useFetch<{
  revenuePerEmployee: number
  teamUtilization: Array<{ name: string; rate: number; target: number }>
}>('/api/agency/kpis')

const report = computed(() => data.value ?? null)

const loading = computed(() => pending.value)
const profitLoading = computed(() => profitPending.value)
const hasError = computed(() => Boolean(error.value))

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function formatPercent(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function formatDelta(current: number, previous: number): DeltaDescriptor {
  if (previous === 0) {
    if (current === 0) return { label: 'No change', sign: 'neutral' as const }
    return { label: `${current > 0 ? '+' : '-'}${formatCurrency(Math.abs(current))} vs prior`, sign: current > 0 ? 'positive' as const : 'negative' as const }
  }

  const delta = current - previous
  const ratio = delta / Math.abs(previous)
  const label = `${delta >= 0 ? '+' : ''}${(ratio * 100).toFixed(1)}% MoM`
  const sign = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'
  return { label, sign }
}

const monthLabel = computed(() => report.value?.meta.monthLabel ?? 'Latest month')
const ytdLabel = computed(() => report.value?.meta.ytdLabel ?? 'Year to date')

const summaryRows = computed<SummaryRow[]>(() => {
  if (!report.value) return []
  const { summary } = report.value

  return [{
    label: 'Revenue',
    metric: summary.revenue
  }, {
    label: 'Cost of Sales',
    metric: summary.costOfSales
  }, {
    label: 'Gross Profit',
    metric: summary.grossProfit
  }, {
    label: 'Operating Expenses',
    metric: summary.operatingExpenses
  }, {
    label: 'Net Profit',
    metric: summary.netProfit
  }].map(item => ({
    ...item,
    delta: formatDelta(item.metric.month, item.metric.previousMonth)
  }))
})

// ── Ratio metrics with benchmarks ──
type BenchmarkLevel = 'green' | 'yellow' | 'red'

function grossMarginBenchmark(value: number): { level: BenchmarkLevel; label: string } {
  const pct = value * 100
  if (pct >= 60) return { level: 'green', label: 'Strong' }
  if (pct >= 40) return { level: 'yellow', label: 'Average' }
  return { level: 'red', label: 'Below target' }
}

function netMarginBenchmark(value: number): { level: BenchmarkLevel; label: string } {
  const pct = value * 100
  if (pct >= 15) return { level: 'green', label: 'Healthy' }
  if (pct >= 5) return { level: 'yellow', label: 'Tight' }
  return { level: 'red', label: 'Unprofitable' }
}

function opexRatioBenchmark(value: number): { level: BenchmarkLevel; label: string } {
  const pct = value * 100
  if (pct <= 60) return { level: 'green', label: 'Efficient' }
  if (pct <= 75) return { level: 'yellow', label: 'High' }
  return { level: 'red', label: 'Excessive' }
}

const benchmarkDotColor: Record<BenchmarkLevel, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500'
}

const hasRevenueData = computed(() => {
  if (!report.value) return false
  const { summary } = report.value
  return summary.revenue.month !== 0 || summary.revenue.ytd !== 0
})

const ratioMetrics = computed(() => {
  if (!report.value) return []
  const { summary } = report.value

  // Guard only the denominator (revenue) — numerator of 0 is valid (0/revenue = 0%)
  const grossMargin = summary.revenue.month !== 0 ? summary.grossProfit.month / summary.revenue.month : 0
  const opexRatio = summary.revenue.month !== 0 ? summary.operatingExpenses.month / summary.revenue.month : 0
  const netMargin = summary.netMargin.month

  return [{
    label: 'Gross Margin',
    month: grossMargin,
    ytd: summary.revenue.ytd !== 0 ? summary.grossProfit.ytd / summary.revenue.ytd : 0,
    benchmark: hasRevenueData.value ? grossMarginBenchmark(grossMargin) : { level: 'yellow' as BenchmarkLevel, label: 'No data' }
  }, {
    label: 'Operating Expense Ratio',
    month: opexRatio,
    ytd: summary.revenue.ytd !== 0 ? summary.operatingExpenses.ytd / summary.revenue.ytd : 0,
    benchmark: hasRevenueData.value ? opexRatioBenchmark(opexRatio) : { level: 'yellow' as BenchmarkLevel, label: 'No data' }
  }, {
    label: 'Net Margin',
    month: netMargin,
    ytd: summary.netMargin.ytd,
    benchmark: hasRevenueData.value ? netMarginBenchmark(netMargin) : { level: 'yellow' as BenchmarkLevel, label: 'No data' }
  }]
})

const revenueBreakdown = computed(() => report.value?.breakdown.revenue ?? [])

// ── Revenue concentration (client data → P&L category fallback) ──
type ConcentrationItem = { label: string; value: number }

const hasClientData = computed(() => {
  const clients = profitability.value?.clients
  return clients && clients.length > 0 && clients.some(c => (c.commission ?? 0) > 0)
})

const concentrationSource = computed<'client' | 'category'>(() =>
  hasClientData.value ? 'client' : 'category'
)

const concentrationItems = computed<ConcentrationItem[]>(() => {
  // Prefer client-level commission data from media_spend
  if (hasClientData.value) {
    const sorted = [...profitability.value!.clients].sort((a, b) => b.commission - a.commission)
    return sorted.slice(0, 5).map(c => ({ label: c.name, value: c.commission }))
  }
  // Fallback: revenue categories from P&L breakdown
  if (revenueBreakdown.value.length) {
    const sorted = [...revenueBreakdown.value].sort((a, b) => b.month - a.month)
    return sorted.slice(0, 5).map(item => ({ label: item.name, value: item.month }))
  }
  return []
})

const concentrationTotal = computed(() => {
  if (hasClientData.value) return profitability.value?.summary?.totalCommission ?? 0
  return revenueBreakdown.value.reduce((sum, item) => sum + item.month, 0)
})

const concentrationRisk = computed<{ level: BenchmarkLevel; label: string }>(() => {
  const items = concentrationItems.value
  const total = concentrationTotal.value
  if (!items.length || total <= 0) return { level: 'green', label: 'N/A' }
  const top1Share = items[0].value / total
  const top3 = items.slice(0, 3)
  const top3Share = top3.reduce((sum, c) => sum + c.value, 0) / total
  if (top1Share > 0.4) return { level: 'red', label: 'High Risk' }
  if (top3Share > 0.7) return { level: 'yellow', label: 'Moderate' }
  return { level: 'green', label: 'Diversified' }
})

// ── Revenue per head ──
const teamSize = computed(() => kpis.value?.teamUtilization?.length ?? 0)
const revenuePerEmployee = computed(() => kpis.value?.revenuePerEmployee ?? 0)

function revenuePerHeadBenchmark(value: number): { level: BenchmarkLevel; label: string } {
  if (value >= 150000) return { level: 'green', label: 'Above benchmark' }
  if (value >= 100000) return { level: 'yellow', label: 'Average' }
  return { level: 'red', label: 'Below benchmark' }
}

const trendData = computed(() => {
  if (!report.value) return []
  return report.value.trend.labels.map((label, index) => {
    const revenue = report.value?.trend.revenue[index] ?? 0
    const expenses = report.value?.trend.expenses[index] ?? 0
    const netProfit = report.value?.trend.netProfit[index] ?? 0
    const profitMargin = revenue !== 0 ? netProfit / revenue : 0

    return {
      label,
      revenue,
      expenses,
      netProfit,
      profitMargin
    }
  })
})

const directCostBreakdown = computed(() => report.value?.breakdown.directCosts ?? [])
const expenseBreakdown = computed(() => report.value?.breakdown.expenses ?? [])
const insights = computed(() => report.value?.insights ?? [])

const recentPeriods = computed(() => report.value?.periods?.slice(-3) ?? [])

const trailingSummary = computed(() => report.value?.trailing ?? {
  periods: 0,
  revenue: 0,
  directCosts: 0,
  operatingExpenses: 0,
  netProfit: 0
})

const lastTwoTotals = computed(() => {
  const periods = report.value?.periods?.slice(-2) ?? []
  if (periods.length === 0) {
    return {
      periods: 0,
      revenue: 0,
      directCosts: 0,
      operatingExpenses: 0,
      netProfit: 0
    }
  }

  return periods.reduce((acc, period) => {
    acc.revenue += period.revenue
    acc.directCosts += period.directCosts
    acc.operatingExpenses += period.operatingExpenses
    acc.netProfit += period.netProfit
    acc.periods = periods.length
    return acc
  }, {
    periods: periods.length,
    revenue: 0,
    directCosts: 0,
    operatingExpenses: 0,
    netProfit: 0
  })
})

function signedCurrency(value: number) {
  if (value === 0) return formatCurrency(0)
  const formatted = formatCurrency(Math.abs(value))
  return value > 0 ? `+${formatted}` : `-${formatted}`
}

const periodColumns = computed(() => ([
  { accessorKey: 'label', header: 'Period', id: 'period-label' },
  { accessorKey: 'revenue', header: 'Revenue', id: 'period-revenue', class: 'text-right' },
  { accessorKey: 'directCosts', header: 'Direct Costs', id: 'period-direct-costs', class: 'text-right' },
  { accessorKey: 'operatingExpenses', header: 'Operating Expenses', id: 'period-op-ex', class: 'text-right' },
  { accessorKey: 'netProfit', header: 'Net Profit', id: 'period-net', class: 'text-right' }
]))

const periodRows = computed(() => recentPeriods.value.map(period => ({
  label: period.label,
  revenue: formatCurrency(period.revenue),
  directCosts: formatCurrency(period.directCosts),
  operatingExpenses: formatCurrency(period.operatingExpenses),
  netProfit: signedCurrency(period.netProfit)
})))

const revenueColumns = computed(() => ([
  { accessorKey: 'name', header: 'Category', id: 'revenue-category' },
  { accessorKey: 'month', header: monthLabel.value, id: 'revenue-month', class: 'text-right' },
  { accessorKey: 'share', header: 'Mix', id: 'revenue-share', class: 'text-right' },
  { accessorKey: 'ytd', header: ytdLabel.value, id: 'revenue-ytd', class: 'text-right' }
]))

const expenseColumns = computed(() => ([
  { accessorKey: 'name', header: 'Category', id: 'expense-category' },
  { accessorKey: 'month', header: monthLabel.value, id: 'expense-month', class: 'text-right' },
  { accessorKey: 'share', header: 'Mix', id: 'expense-share', class: 'text-right' },
  { accessorKey: 'ytd', header: ytdLabel.value, id: 'expense-ytd', class: 'text-right' }
]))

const directCostColumns = computed(() => ([
  { accessorKey: 'name', header: 'Category', id: 'direct-cost-category' },
  { accessorKey: 'month', header: monthLabel.value, id: 'direct-cost-month', class: 'text-right' },
  { accessorKey: 'share', header: 'Mix', id: 'direct-cost-share', class: 'text-right' },
  { accessorKey: 'ytd', header: ytdLabel.value, id: 'direct-cost-ytd', class: 'text-right' }
]))

const basisLabel = computed(() => report.value?.meta.basis ?? (basis.value === 'cash' ? 'Cash' : 'Accrual'))
const generatedAt = computed(() => {
  const raw = report.value?.meta.generatedAt
  if (!raw) return '-'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
})

const breadcrumbs = computed(() => ([
  { label: 'Reports', to: '/reports' },
  { label: 'Profit & Loss', to: '/profit-loss' }
]))

const refreshAll = async () => {
  await refresh()
}
</script>

<template>
  <UDashboardPanel id="profit-loss">
    <template #header>
      <UDashboardNavbar title="Profit &amp; Loss" :description="`${basisLabel}-basis performance — ${displayLabel}`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge variant="subtle" color="neutral">
            {{ basisLabel }} basis
          </UBadge>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :links="breadcrumbs" />

          <!-- Month picker -->
          <div class="flex items-center gap-1 ml-4">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="prevMonth"
            />

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

          <!-- Cash / Accrual toggle -->
          <div class="flex items-center gap-0.5 ml-3 border-l border-default pl-3">
            <UButton
              label="Accrual"
              size="xs"
              :variant="basis === 'accrual' ? 'soft' : 'ghost'"
              :color="basis === 'accrual' ? 'primary' : 'neutral'"
              @click="basis = 'accrual'"
            />
            <UButton
              label="Cash"
              size="xs"
              :variant="basis === 'cash' ? 'soft' : 'ghost'"
              :color="basis === 'cash' ? 'primary' : 'neutral'"
              @click="basis = 'cash'"
            />
          </div>
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
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <USkeleton v-for="n in 5" :key="`summary-${n}`" class="h-28" />
        </div>
        <USkeleton class="h-80" />
      </div>

      <div v-else-if="hasError" class="space-y-4">
        <UAlert
          title="Unable to load Profit &amp; Loss data"
          description="There was an issue retrieving the detailed report from Xero. Please try again."
          color="error"
          variant="soft"
          icon="i-lucide-alert-triangle"
        />
        <UButton icon="i-lucide-refresh-cw" @click="refreshAll">
          Retry
        </UButton>
      </div>

      <div v-else class="space-y-6">
        <!-- Summary + Margins row -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <UCard class="xl:col-span-2" :ui="{ body: '!p-6 space-y-6' }">
            <header class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs uppercase text-muted mb-1">Summary</p>
                <h2 class="text-2xl font-semibold">{{ monthLabel }}</h2>
                <p class="text-sm text-muted">Comparing prior month and {{ ytdLabel }}</p>
              </div>
              <div class="text-right text-xs text-muted">
                <p>Generated {{ generatedAt }}</p>
              </div>
            </header>

            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div
                v-for="item in summaryRows"
                :key="item.label"
                class="space-y-3"
              >
                <p class="text-xs text-muted uppercase">{{ item.label }}</p>
                <div>
                  <p class="text-xl font-semibold">{{ formatCurrency(item.metric.month) }}</p>
                  <p class="text-xs text-muted">{{ monthLabel }}</p>
                </div>
                <div class="text-sm">
                  <span :class="[
                    'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs',
                    item.delta.sign === 'positive' && 'bg-positive/10 text-positive',
                    item.delta.sign === 'negative' && 'bg-negative/10 text-negative',
                    item.delta.sign === 'neutral' && 'bg-muted/30 text-muted'
                  ]">
                    {{ item.delta.label }}
                  </span>
                </div>
                <div>
                  <p class="text-sm font-medium">{{ formatCurrency(item.metric.ytd) }}</p>
                  <p class="text-xs text-muted">{{ ytdLabel }}</p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Margins with benchmark indicators -->
          <div class="space-y-4">
            <UCard :ui="{ body: '!p-6' }">
              <p class="text-xs text-muted uppercase mb-2">Margins</p>
              <div class="space-y-4">
                <div v-for="metric in ratioMetrics" :key="metric.label">
                  <div class="flex items-center justify-between text-xs text-muted mb-1">
                    <span>{{ metric.label }}</span>
                    <span>{{ ytdLabel }}</span>
                  </div>
                  <div class="flex items-baseline justify-between">
                    <div class="flex items-center gap-2">
                      <p class="text-lg font-semibold">{{ formatPercent(metric.month) }}</p>
                      <span class="flex items-center gap-1">
                        <span :class="['inline-block size-2 rounded-full', benchmarkDotColor[metric.benchmark.level]]" />
                        <span class="text-[10px] text-muted">{{ metric.benchmark.label }}</span>
                      </span>
                    </div>
                    <p class="text-sm font-medium">{{ formatPercent(metric.ytd) }}</p>
                  </div>
                  <p class="text-xs text-muted">{{ monthLabel }}</p>
                </div>
              </div>
            </UCard>

            <!-- Revenue per head widget -->
            <UCard :ui="{ body: '!p-6' }">
              <div class="flex items-center justify-between mb-2">
                <p class="text-xs text-muted uppercase">Revenue per Head</p>
                <UBadge variant="subtle" color="neutral" size="xs">All time</UBadge>
              </div>
              <div class="flex items-baseline gap-2">
                <p class="text-lg font-semibold">{{ formatCurrency(revenuePerEmployee) }}</p>
                <span v-if="teamSize > 0" class="flex items-center gap-1">
                  <span :class="['inline-block size-2 rounded-full', benchmarkDotColor[revenuePerHeadBenchmark(revenuePerEmployee).level]]" />
                  <span class="text-[10px] text-muted">{{ revenuePerHeadBenchmark(revenuePerEmployee).label }}</span>
                </span>
              </div>
              <p class="text-xs text-muted mt-1">{{ teamSize }} team member{{ teamSize !== 1 ? 's' : '' }}</p>
            </UCard>
          </div>
        </div>

        <!-- Revenue concentration -->
        <UCard :ui="{ body: '!p-6 space-y-4' }">
          <header class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase text-muted">Revenue Concentration</p>
              <h3 class="text-lg font-semibold">
                {{ concentrationSource === 'client' ? 'Top 5 Clients by Commission' : 'Top 5 Revenue Categories' }}
              </h3>
            </div>
            <div v-if="concentrationItems.length" class="flex items-center gap-2">
              <UBadge
                :color="concentrationRisk.level === 'green' ? 'success' : concentrationRisk.level === 'yellow' ? 'warning' : 'error'"
                variant="subtle"
              >
                {{ concentrationRisk.label }}
              </UBadge>
              <span class="text-xs text-muted">
                {{ formatCurrency(concentrationTotal) }} total
              </span>
            </div>
          </header>

          <div v-if="profitLoading && !concentrationItems.length" class="space-y-3">
            <USkeleton v-for="n in 3" :key="`conc-${n}`" class="h-10" />
          </div>
          <div v-else-if="concentrationItems.length" class="space-y-3">
            <div v-for="item in concentrationItems" :key="item.label" class="space-y-1">
              <div class="flex items-center justify-between text-sm">
                <span class="font-medium truncate max-w-[240px]">{{ item.label }}</span>
                <div class="flex items-center gap-2 text-xs text-muted">
                  <span>{{ formatCurrency(item.value) }}</span>
                  <span>{{ concentrationTotal > 0 ? ((item.value / concentrationTotal) * 100).toFixed(1) : '0' }}%</span>
                </div>
              </div>
              <div class="h-2 bg-muted/20 rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary rounded-full transition-all duration-300"
                  :style="{ width: concentrationTotal > 0 ? `${(item.value / concentrationTotal) * 100}%` : '0%' }"
                />
              </div>
            </div>
            <p v-if="concentrationSource === 'category'" class="text-xs text-muted pt-1">
              Showing revenue categories from P&amp;L. Client-level data will appear when media spend is synced for this period.
            </p>
          </div>
          <p v-else class="text-sm text-muted">
            No revenue data available for {{ displayLabel }}.
          </p>
        </UCard>

        <!-- Trailing performance -->
        <UCard v-if="trailingSummary.periods >= 2" :ui="{ body: '!p-6 space-y-6' }">
          <header class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase text-muted">Trailing performance clarity</p>
              <h3 class="text-lg font-semibold">Last {{ trailingSummary.periods }} months</h3>
            </div>
            <UBadge :color="trailingSummary.netProfit >= 0 ? 'success' : 'error'" variant="subtle">
              {{ signedCurrency(trailingSummary.netProfit) }} net
            </UBadge>
          </header>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div class="space-y-2">
              <p class="text-xs uppercase text-muted">Trailing window ({{ trailingSummary.periods }} months)</p>
              <ul class="space-y-1">
                <li class="flex justify-between"><span>Revenue</span><span>{{ formatCurrency(trailingSummary.revenue) }}</span></li>
                <li class="flex justify-between"><span>Direct costs</span><span>{{ formatCurrency(trailingSummary.directCosts) }}</span></li>
                <li class="flex justify-between"><span>Gross profit</span><span>{{ formatCurrency(trailingSummary.revenue - trailingSummary.directCosts) }}</span></li>
                <li class="flex justify-between"><span>Operating expenses</span><span>{{ formatCurrency(trailingSummary.operatingExpenses) }}</span></li>
                <li class="flex justify-between font-medium"><span>Net profit</span><span>{{ signedCurrency(trailingSummary.netProfit) }}</span></li>
              </ul>
              <p v-if="trailingSummary.periods > lastTwoTotals.periods" class="text-xs text-muted">
                Extra {{ trailingSummary.periods - lastTwoTotals.periods }} month(s) add {{ signedCurrency(trailingSummary.netProfit - lastTwoTotals.netProfit) }} to the cumulative result, explaining the reported $173k loss versus the $60k two-month view.
              </p>
            </div>

            <div class="space-y-2" v-if="lastTwoTotals.periods === 2">
              <p class="text-xs uppercase text-muted">Last two closed months</p>
              <ul class="space-y-1">
                <li class="flex justify-between"><span>Revenue</span><span>{{ formatCurrency(lastTwoTotals.revenue) }}</span></li>
                <li class="flex justify-between"><span>Direct costs</span><span>{{ formatCurrency(lastTwoTotals.directCosts) }}</span></li>
                <li class="flex justify-between"><span>Gross profit</span><span>{{ formatCurrency(lastTwoTotals.revenue - lastTwoTotals.directCosts) }}</span></li>
                <li class="flex justify-between"><span>Operating expenses</span><span>{{ formatCurrency(lastTwoTotals.operatingExpenses) }}</span></li>
                <li class="flex justify-between font-medium"><span>Net profit</span><span>{{ signedCurrency(lastTwoTotals.netProfit) }}</span></li>
              </ul>
              <p class="text-xs text-muted">
                Figures above align with management's July &amp; August view. Direct costs include PPC/media charges, which explains the lower trading income compared to invoice totals.
              </p>
            </div>
          </div>
        </UCard>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <ProfitTrendChart
            v-if="trendData.length > 1"
            :periods="trendData"
            class="xl:col-span-2"
          />
          <UCard v-else variant="subtle" class="xl:col-span-2">
            <div class="p-6 text-sm text-muted">
              Additional historical periods are required to render the trend chart.
            </div>
          </UCard>

          <div class="space-y-4">
            <UCard :ui="{ body: '!p-6' }">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <p class="text-xs uppercase text-muted mb-1">Current Basis</p>
                  <p class="font-semibold">{{ basisLabel }} accounting</p>
                </div>
                <UBadge color="primary" variant="subtle">{{ ytdLabel }}</UBadge>
              </div>
              <ul class="space-y-3 text-sm text-muted">
                <li>
                  Month range: {{ report?.meta.monthStart }} → {{ report?.meta.monthEnd }}
                </li>
                <li>
                  Periods analysed: {{ report?.meta.periodLabels.length }}
                </li>
                <li>
                  Net margin: {{ formatPercent(report?.summary.netMargin.month || 0) }} (month)
                </li>
                <li>
                  Net margin YTD: {{ formatPercent(report?.summary.netMargin.ytd || 0) }}
                </li>
              </ul>
            </UCard>

            <UCard title="Recent Period Performance" variant="subtle">
              <template v-if="periodRows.length">
                <UTable :columns="periodColumns" :data="periodRows" />
                <p class="text-xs text-muted mt-3">
                  Use this to reconcile management reporting. Net profit is shown with signs to highlight months driving cumulative losses.
                </p>
              </template>
              <template v-else>
                <p class="text-sm text-muted">Historical period detail was not provided in the P&amp;L response.</p>
              </template>
            </UCard>
          </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <UCard title="Direct Costs Breakdown" variant="subtle">
            <template v-if="directCostBreakdown.length">
              <UTable
                :columns="directCostColumns"
                :data="directCostBreakdown.map(item => ({
                  name: item.name,
                  month: formatCurrency(item.month),
                  share: formatPercent(item.monthShare),
                  ytd: formatCurrency(item.ytd)
                }))"
              />
              <p class="text-xs text-muted mt-3">
                Direct costs capture PPC and other pass-through media spend booked against trading income. Large swings here explain why invoiced income differs from the accounting revenue figure.
              </p>
            </template>
            <template v-else>
              <p class="text-sm text-muted">No direct cost detail was returned for the selected month.</p>
            </template>
          </UCard>

          <UCard title="Revenue Breakdown" variant="subtle">
            <template v-if="revenueBreakdown.length">
              <UTable
                :columns="revenueColumns"
                :data="revenueBreakdown.map(item => ({
                  name: item.name,
                  month: formatCurrency(item.month),
                  share: formatPercent(item.monthShare),
                  ytd: formatCurrency(item.ytd)
                }))"
              />
            </template>
            <template v-else>
              <p class="text-sm text-muted">No revenue categories returned for the selected month.</p>
            </template>
          </UCard>

          <UCard title="Operating Expenses Breakdown" variant="subtle">
            <template v-if="expenseBreakdown.length">
              <UTable
                :columns="expenseColumns"
                :data="expenseBreakdown.map(item => ({
                  name: item.name,
                  month: formatCurrency(item.month),
                  share: formatPercent(item.monthShare),
                  ytd: formatCurrency(item.ytd)
                }))"
              />
            </template>
            <template v-else>
              <p class="text-sm text-muted">No operating expense categories returned for the selected month.</p>
            </template>
          </UCard>
        </div>

        <UCard title="Automated Insights" variant="subtle">
          <template v-if="insights.length">
            <ul class="space-y-3">
              <li v-for="(insight, index) in insights" :key="index" class="flex gap-3 items-start">
                <UIcon name="i-lucide-sparkles" class="h-5 w-5 text-primary mt-0.5" />
                <span class="text-sm leading-relaxed">{{ insight }}</span>
              </li>
            </ul>
          </template>
          <template v-else>
            <p class="text-sm text-muted">Insights will appear once we detect notable changes in your monthly results.</p>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
