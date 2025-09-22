<script setup lang="ts">
const { data: pnl, pending: pnlPending, error: pnlError } = await useFetch('/api/xero/reports/pnl')
const { data: bs, pending: bsPending, error: bsError } = await useFetch('/api/xero/reports/balance-sheet')

const pnlData = computed(() => pnl.value ?? null)

const latestPeriod = computed(() => {
  const periods = pnlData.value?.periods ?? []
  return periods[periods.length - 1]
})

const previousPeriod = computed(() => {
  const periods = pnlData.value?.periods ?? []
  return periods.length > 1 ? periods[periods.length - 2] : undefined
})

const netProfitChange = computed(() => {
  if (!latestPeriod.value || !previousPeriod.value) return null
  return latestPeriod.value.netProfit - previousPeriod.value.netProfit
})

const profitMarginChange = computed(() => {
  if (!latestPeriod.value || !previousPeriod.value) return null
  return (latestPeriod.value.profitMargin - previousPeriod.value.profitMargin) * 100
})

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function formatPercent(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return `${value.toFixed(1)}%`
}

function trendBadgeColor(value: number | null) {
  if (value === null) return 'neutral'
  if (value > 0) return 'success'
  if (value < 0) return 'error'
  return 'neutral'
}

function formatMultiple(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return `${value.toFixed(2)}x`
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Financial Reports"
      description="Visualize profit trends and balance sheet health"
    />

    <UPageGrid class="gap-4 sm:gap-6">
      <UPageCard title="Profit & Loss Snapshot" variant="subtle">
        <div v-if="pnlPending" class="space-y-3">
          <USkeleton class="h-4 w-32" />
          <USkeleton
            v-for="n in 3"
            :key="n"
            class="h-4 w-full"
          />
        </div>
        <div v-else-if="pnlError" class="text-sm text-negative">
          Failed to load Profit &amp; Loss data.
        </div>
        <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p class="text-xs text-muted uppercase mb-1">
              Revenue
            </p>
            <p class="text-xl font-semibold">
              {{ formatCurrency(pnl?.revenueTotal) }}
            </p>
            <p class="text-xs text-muted">
              {{ latestPeriod?.label || 'Current period' }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted uppercase mb-1">
              Expenses
            </p>
            <p class="text-xl font-semibold">
              {{ formatCurrency(pnl?.expensesTotal) }}
            </p>
            <p class="text-xs text-muted">
              Including operating costs &amp; overhead
            </p>
          </div>
          <div>
            <p class="text-xs text-muted uppercase mb-1">
              Net Profit
            </p>
            <div class="flex items-baseline gap-2">
              <p class="text-xl font-semibold">
                {{ formatCurrency(pnl?.netProfit) }}
              </p>
              <UBadge v-if="netProfitChange !== null" :color="trendBadgeColor(netProfitChange)">
                {{ netProfitChange > 0 ? '+' : '' }}{{ formatCurrency(netProfitChange) }} vs previous
              </UBadge>
            </div>
            <p class="text-xs text-muted">
              {{ previousPeriod?.label || 'No prior period' }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted uppercase mb-1">
              Profit Margin
            </p>
            <div class="flex items-baseline gap-2">
              <p class="text-xl font-semibold">
                {{ formatPercent((pnl?.profitMargin || 0) * 100) }}
              </p>
              <UBadge v-if="profitMarginChange !== null" :color="trendBadgeColor(profitMarginChange)">
                {{ profitMarginChange > 0 ? '+' : '' }}{{ profitMarginChange.toFixed(1) }} pts
              </UBadge>
            </div>
            <p class="text-xs text-muted">
              Change period-over-period
            </p>
          </div>
        </div>
      </UPageCard>

      <template v-if="!pnlPending && !pnlError">
        <ProfitTrendChart
          v-if="(pnl?.periods?.length || 0) > 1"
          :periods="pnl?.periods || []"
        />
        <UPageCard v-else variant="subtle">
          <p class="text-sm text-muted">
            More than one reporting period is needed to show the profit trend.
          </p>
        </UPageCard>

        <ExpenseBreakdownChart
          v-if="(pnl?.expensesByCategory?.length || 0) > 0"
          :items="pnl?.expensesByCategory || []"
        />
        <UPageCard v-else variant="subtle">
          <p class="text-sm text-muted">
            Expense categories will appear once Xero returns a detailed breakdown.
          </p>
        </UPageCard>
      </template>

      <UPageCard title="Balance Sheet" variant="subtle" class="md:col-span-2">
        <div v-if="bsPending" class="space-y-3">
          <USkeleton class="h-4 w-32" />
          <USkeleton
            v-for="n in 3"
            :key="n"
            class="h-4 w-full"
          />
        </div>
        <div v-else-if="bsError" class="text-sm text-negative">
          Failed to load Balance Sheet data.
        </div>
        <div v-else>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <p class="text-xs text-muted uppercase mb-1">
                Total Assets
              </p>
              <p class="text-xl font-semibold">
                {{ formatCurrency(bs?.totalAssets) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted uppercase mb-1">
                Total Liabilities
              </p>
              <p class="text-xl font-semibold">
                {{ formatCurrency(bs?.totalLiabilities) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted uppercase mb-1">
                Total Equity
              </p>
              <p class="text-xl font-semibold">
                {{ formatCurrency(bs?.totalEquity) }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="rounded-lg border border-border/60 p-4">
              <p class="text-xs text-muted uppercase mb-1">
                Working Capital
              </p>
              <p class="text-lg font-semibold">
                {{ formatCurrency(bs?.workingCapital) }}
              </p>
              <p class="text-xs text-muted">
                Liquidity to cover short-term obligations
              </p>
            </div>
            <div class="rounded-lg border border-border/60 p-4">
              <p class="text-xs text-muted uppercase mb-1">
                Debt-to-Equity
              </p>
              <p class="text-lg font-semibold">
                {{ formatMultiple(bs?.debtToEquity) }}
              </p>
              <p class="text-xs text-muted">
                Leverage compared to shareholder equity
              </p>
            </div>
            <div class="rounded-lg border border-border/60 p-4">
              <p class="text-xs text-muted uppercase mb-1">
                Equity Ratio
              </p>
              <p class="text-lg font-semibold">
                {{ formatPercent((bs?.equityRatio || 0) * 100) }}
              </p>
              <p class="text-xs text-muted">
                Share of assets financed by equity
              </p>
            </div>
          </div>
        </div>
      </UPageCard>
    </UPageGrid>
  </UPage>
</template>
