<script setup lang="ts">
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

const { data, pending, error, refresh } = await useFetch<ProfitAndLossReport>('/api/xero/reports/pnl-detailed')

const report = computed(() => data.value ?? null)

const loading = computed(() => pending.value)
const hasError = computed(() => Boolean(error.value))

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
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

const ratioMetrics = computed(() => {
  if (!report.value) return []
  const { summary } = report.value
  return [{
    label: 'Gross Margin',
    month: summary.grossProfit.month && summary.revenue.month ? summary.grossProfit.month / summary.revenue.month : 0,
    ytd: summary.grossProfit.ytd && summary.revenue.ytd ? summary.grossProfit.ytd / summary.revenue.ytd : 0
  }, {
    label: 'Operating Expense Ratio',
    month: summary.operatingExpenses.month && summary.revenue.month ? summary.operatingExpenses.month / summary.revenue.month : 0,
    ytd: summary.operatingExpenses.ytd && summary.revenue.ytd ? summary.operatingExpenses.ytd / summary.revenue.ytd : 0
  }, {
    label: 'Net Margin',
    month: summary.netMargin.month,
    ytd: summary.netMargin.ytd
  }]
})

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

const revenueBreakdown = computed(() => report.value?.breakdown.revenue ?? [])
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
  { key: 'label', label: 'Period', id: 'period-label' },
  { key: 'revenue', label: 'Revenue', id: 'period-revenue', class: 'text-right' },
  { key: 'directCosts', label: 'Direct Costs', id: 'period-direct-costs', class: 'text-right' },
  { key: 'operatingExpenses', label: 'Operating Expenses', id: 'period-op-ex', class: 'text-right' },
  { key: 'netProfit', label: 'Net Profit', id: 'period-net', class: 'text-right' }
]))

const periodRows = computed(() => recentPeriods.value.map(period => ({
  label: period.label,
  revenue: formatCurrency(period.revenue),
  directCosts: formatCurrency(period.directCosts),
  operatingExpenses: formatCurrency(period.operatingExpenses),
  netProfit: signedCurrency(period.netProfit)
})))

const revenueColumns = computed(() => ([
  { key: 'name', label: 'Category', id: 'revenue-category' },
  { key: 'month', label: monthLabel.value, id: 'revenue-month', class: 'text-right' },
  { key: 'share', label: 'Mix', id: 'revenue-share', class: 'text-right' },
  { key: 'ytd', label: ytdLabel.value, id: 'revenue-ytd', class: 'text-right' }
]))

const expenseColumns = computed(() => ([
  { key: 'name', label: 'Category', id: 'expense-category' },
  { key: 'month', label: monthLabel.value, id: 'expense-month', class: 'text-right' },
  { key: 'share', label: 'Mix', id: 'expense-share', class: 'text-right' },
  { key: 'ytd', label: ytdLabel.value, id: 'expense-ytd', class: 'text-right' }
]))

const directCostColumns = computed(() => ([
  { key: 'name', label: 'Category', id: 'direct-cost-category' },
  { key: 'month', label: monthLabel.value, id: 'direct-cost-month', class: 'text-right' },
  { key: 'share', label: 'Mix', id: 'direct-cost-share', class: 'text-right' },
  { key: 'ytd', label: ytdLabel.value, id: 'direct-cost-ytd', class: 'text-right' }
]))

const basisLabel = computed(() => report.value?.meta.basis ?? 'Accrual')
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
      <UDashboardNavbar title="Profit &amp; Loss" description="Accrual-based performance with last month and YTD detail">
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
          color="negative"
          variant="soft"
          icon="i-lucide-alert-triangle"
        />
        <UButton icon="i-lucide-refresh-cw" @click="refreshAll">
          Retry
        </UButton>
      </div>

      <div v-else class="space-y-6">
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

          <UCard :ui="{ body: '!p-6' }">
            <p class="text-xs text-muted uppercase mb-2">Margins</p>
            <div class="space-y-4">
              <div v-for="metric in ratioMetrics" :key="metric.label">
                <div class="flex items-center justify-between text-xs text-muted mb-1">
                  <span>{{ metric.label }}</span>
                  <span>{{ ytdLabel }}</span>
                </div>
                <div class="flex items-baseline justify-between">
                  <p class="text-lg font-semibold">{{ formatPercent(metric.month) }}</p>
                  <p class="text-sm font-medium">{{ formatPercent(metric.ytd) }}</p>
                </div>
                <p class="text-xs text-muted">{{ monthLabel }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <UCard v-if="trailingSummary.periods >= 2" :ui="{ body: '!p-6 space-y-6' }">
          <header class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase text-muted">Trailing performance clarity</p>
              <h3 class="text-lg font-semibold">Last {{ trailingSummary.periods }} months</h3>
            </div>
            <UBadge :color="trailingSummary.netProfit >= 0 ? 'positive' : 'negative'" variant="subtle">
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
                <UTable :columns="periodColumns" :rows="periodRows" />
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
                :rows="directCostBreakdown.map(item => ({
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
                :rows="revenueBreakdown.map(item => ({
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
                :rows="expenseBreakdown.map(item => ({
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
