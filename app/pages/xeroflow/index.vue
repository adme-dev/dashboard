<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-finance'] })

import { defineAsyncComponent } from 'vue'
import { createSingleFlight, runTasksSequentially } from '~/utils/asyncControl'

// Async components for better performance
const AsyncKPICards = defineAsyncComponent(() => import('~/components/dashboard/KPICards.vue'))
const AsyncCashFlowChart = defineAsyncComponent(() => import('~/components/dashboard/CashFlowChart.client.vue'))
const AsyncInvoicePipeline = defineAsyncComponent(() => import('~/components/dashboard/InvoicePipeline.vue'))
const AsyncAnomalyAlerts = defineAsyncComponent(() => import('~/components/dashboard/AnomalyAlerts.vue'))
const AsyncReceivablesAging = defineAsyncComponent(() => import('~/components/dashboard/ReceivablesAgingWidget.vue'))
const AsyncOverheadBurn = defineAsyncComponent(() => import('~/components/dashboard/OverheadBurnWidget.vue'))

// Check connection status (no await — keeps component instance alive for lifecycle hooks)
const { data: statusData, refresh: refreshStatus } = useFetch('/api/xero/status')
const isConnected = computed(() => statusData.value?.connected || false)

// Reporting basis for the money KPIs (accrual ⇄ cash). Persisted per
// browser (same key as the Reports page so the choice follows the user);
// the reactive query re-fetches automatically when it changes.
const kpiBasis = useLocalStorage<'accrual' | 'cash'>('kpi-basis', 'accrual')

// Data fetches — gated on Xero connection, default to null to prevent Vue prop warnings
const { data: kpiData, pending: kpiPending, error: kpiError, refresh: refreshKPI } = useFetch('/api/kpis-advanced', {
  query: { basis: kpiBasis },
  immediate: false,
  retry: 0,
  default: () => null
})
const liveDataErrorDescription = computed(() => {
  const status = (kpiError.value as any)?.statusCode
  if (status === 429 || status === 502 || status === 504) {
    return 'Xero is connected, but live data is temporarily rate-limited. The dashboard will retry safely.'
  }
  return 'Xero is connected, but live data is temporarily unavailable. Please try again shortly.'
})

const { data: cashFlowData, pending: cashFlowPending, refresh: refreshCashFlow } = useFetch('/api/xero/reports/cash-flow-forecast?days=90', {
  immediate: false,
  retry: 0,
  default: () => null
})

const { data: pipelineData, pending: pipelinePending, refresh: refreshPipeline } = useFetch('/api/xero/invoice-pipeline?days=90', {
  immediate: false,
  retry: 0,
  default: () => null
})

const { data: anomalyData, pending: anomalyPending, refresh: refreshAnomalies } = useFetch('/api/ai/anomalies', {
  query: { tab: 'active' },
  immediate: false,
  default: () => null
})

// Budget variance data
const { data: budgetData, pending: budgetPending, refresh: refreshBudget } = useFetch('/api/xero/reports/budget-variance', {
  immediate: false,
  retry: 0,
  default: () => null
})

const refreshDashboard = createSingleFlight(async () => {
  await runTasksSequentially([
    refreshKPI,
    refreshCashFlow,
    refreshPipeline,
    refreshAnomalies,
    refreshBudget,
  ])
})

// Only fetch data when Xero is connected
watch(isConnected, (connected) => {
  if (connected) {
    void refreshDashboard()
  }
}, { immediate: true })

// Manual refresh all — bypasses the server's 5-minute SWR cache (?bust=1)
// so a user-clicked refresh shows live Xero data, not the cached snapshot.
// The Xero-backed fetches go through $fetch with the bust flag and land in
// the same data refs; anomalies aren't a Xero cache so a plain refresh does.
const manualRefreshing = ref(false)
async function refreshAll() {
  manualRefreshing.value = true
  try {
    await runTasksSequentially([
      async () => {
        kpiData.value = await $fetch(`/api/kpis-advanced?bust=1&basis=${kpiBasis.value}`, { retry: 0 }).catch(() => kpiData.value) as any
      },
      async () => {
        cashFlowData.value = await $fetch('/api/xero/reports/cash-flow-forecast?days=90&bust=1', { retry: 0 }).catch(() => cashFlowData.value) as any
      },
      async () => {
        pipelineData.value = await $fetch('/api/xero/invoice-pipeline?days=90&bust=1', { retry: 0 }).catch(() => pipelineData.value) as any
      },
      async () => {
        budgetData.value = await $fetch('/api/xero/reports/budget-variance?bust=1', { retry: 0 }).catch(() => budgetData.value) as any
      },
      refreshAnomalies,
    ])
  } finally {
    manualRefreshing.value = false
  }
}

// Auto-refresh every 5 minutes
const refreshInterval = 5 * 60 * 1000
let refreshTimer: NodeJS.Timeout

onMounted(() => {
  refreshTimer = setInterval(() => {
    if (isConnected.value) {
      void refreshDashboard()
    }
  }, refreshInterval)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

// Keyboard shortcuts
let keydownHandler: ((e: KeyboardEvent) => void) | null = null

onMounted(() => {
  keydownHandler = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      switch (e.key) {
        case 'r':
          e.preventDefault()
          refreshAll()
          break
        case 'k':
          e.preventDefault()
          break
      }
    }
  }
  document.addEventListener('keydown', keydownHandler)
})

onUnmounted(() => {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler)
  }
})

// Breadcrumbs
const breadcrumbs = computed(() => ([
  { label: 'Home', to: '/' },
  { label: 'XeroFlow Dashboard', to: '/xeroflow' }
]))

// Page title with live indicator
const pageTitle = computed(() => {
  const baseTitle = 'XeroFlow Dashboard'
  return isConnected ? `${baseTitle} • Live` : `${baseTitle} • Demo`
})

// Critical alerts from KPI data
const criticalAlerts = computed(() => {
  return kpiData.value?.alerts?.filter((alert: any) => alert.severity === 'critical') || []
})

// Budget variance helpers
const budgetVariance = computed(() => (budgetData.value as any) || null)

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)

const budgetStatusColor = (status: string) => {
  switch (status) {
    case 'over': return 'text-red-600 dark:text-red-400'
    case 'under': return 'text-emerald-600 dark:text-emerald-400'
    default: return 'text-muted'
  }
}

const budgetStatusBg = (status: string) => {
  switch (status) {
    case 'over': return 'bg-red-50 dark:bg-red-500/10'
    case 'under': return 'bg-emerald-50 dark:bg-emerald-500/10'
    default: return 'bg-elevated'
  }
}

// Top budget alerts (over-budget categories)
const budgetAlerts = computed(() => {
  if (!budgetVariance.value?.categoryAnalysis) return []
  return budgetVariance.value.categoryAnalysis
    .filter((c: any) => c.status === 'over')
    .sort((a: any, b: any) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, 4)
})

// Quick action links for all XeroFlow pages
const quickActions = [
  { label: 'Invoices', icon: 'i-lucide-receipt', to: '/invoices' },
  { label: 'Expenses', icon: 'i-lucide-wallet', to: '/expenses' },
  { label: 'Cash Flow', icon: 'i-lucide-trending-up', to: '/cashflow' },
  { label: 'Reports', icon: 'i-lucide-bar-chart-3', to: '/reports' },
  { label: 'Profit & Loss', icon: 'i-lucide-pie-chart', to: '/profit-loss' },
  { label: 'Customers', icon: 'i-lucide-users', to: '/customers' },
  { label: 'Anomalies', icon: 'i-lucide-alert-triangle', to: '/anomalies' },
  { label: 'Insights', icon: 'i-lucide-lightbulb', to: '/insights' },
  { label: 'Recommendations', icon: 'i-lucide-clipboard-check', to: '/recommendations' },
  { label: 'Finance AI', icon: 'i-lucide-brain', to: '/agency/ai/finance' },
]
</script>

<template>
  <UDashboardPanel id="executive-dashboard">
    <template #header>
      <UDashboardNavbar :title="pageTitle">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-3">
            <!-- Live indicator -->
            <div v-if="isConnected" class="flex items-center gap-2 text-xs text-muted">
              <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live Data
            </div>
            <div v-else class="flex items-center gap-2 text-xs text-muted">
              <div class="w-2 h-2 bg-amber-500 rounded-full" />
              Demo Mode
            </div>

            <!-- Refresh button -->
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="manualRefreshing || kpiPending || cashFlowPending"
              @click="refreshAll"
            />

            <!-- Settings -->
            <UButton
              icon="i-lucide-settings"
              color="neutral"
              variant="ghost"
              size="sm"
              to="/settings"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :links="breadcrumbs" />
        </template>

        <template #right>
          <div class="flex items-center gap-4">
            <!-- Critical alerts badge -->
            <UBadge
              v-if="criticalAlerts.length > 0"
              :label="`${criticalAlerts.length} Critical Alert${criticalAlerts.length > 1 ? 's' : ''}`"
              color="error"
              variant="subtle"
            />

            <!-- Last updated -->
            <span class="text-xs text-muted">
              Updated {{ new Date().toLocaleTimeString() }}
            </span>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Critical Alerts Banner -->
      <div v-if="criticalAlerts.length > 0" class="mb-6">
        <UAlert
          v-for="alert in criticalAlerts"
          :key="alert.message"
          icon="i-lucide-alert-triangle"
          color="error"
          variant="subtle"
          :title="alert.type.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())"
          :description="alert.message"
          class="mb-2"
        />
      </div>

      <!-- Connection Error -->
      <div v-if="kpiError && isConnected" class="mb-6">
        <UAlert
          icon="i-lucide-wifi-off"
          color="warning"
          title="Live Data Delayed"
          :description="liveDataErrorDescription"
        />
      </div>

      <div class="space-y-6">
        <!-- KPI Cards -->
        <ClientOnly>
          <AsyncKPICards
            v-model:basis="kpiBasis"
            :data="kpiData as any"
            :loading="kpiPending"
            :connected="isConnected"
          />
          <template #fallback>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
              <USkeleton class="h-32" v-for="i in 4" :key="i" />
            </div>
          </template>
        </ClientOnly>

        <!-- Main Dashboard Grid: Cash Flow + Anomaly Alerts -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <!-- Cash Flow Forecast (2/3 width) -->
          <div class="xl:col-span-2">
            <ClientOnly>
              <AsyncCashFlowChart
                :data="cashFlowData as any"
                :loading="cashFlowPending"
              />
              <template #fallback>
                <USkeleton class="h-80" />
              </template>
            </ClientOnly>
          </div>

          <!-- Anomaly Alerts (1/3 width) -->
          <div>
            <ClientOnly>
              <AsyncAnomalyAlerts
                :data="anomalyData as any"
                :loading="anomalyPending"
              />
              <template #fallback>
                <USkeleton class="h-80" />
              </template>
            </ClientOnly>
          </div>
        </div>

        <!-- Financial Health Row: Receivables Aging + Overhead Burn -->
        <div v-if="isConnected" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ClientOnly>
            <AsyncReceivablesAging />
            <template #fallback>
              <USkeleton class="h-64" />
            </template>
          </ClientOnly>

          <ClientOnly>
            <AsyncOverheadBurn />
            <template #fallback>
              <USkeleton class="h-64" />
            </template>
          </ClientOnly>
        </div>

        <!-- Invoice Pipeline -->
        <ClientOnly>
          <AsyncInvoicePipeline
            :data="pipelineData as any"
            :loading="pipelinePending"
          />
          <template #fallback>
            <USkeleton class="h-64" />
          </template>
        </ClientOnly>

        <!-- Budget vs Actual -->
        <UCard v-if="isConnected">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">Budget vs Actual</h3>
                <p class="text-sm text-muted">
                  {{ budgetVariance?.period?.monthName || 'Current month' }} spending against plan
                </p>
              </div>
              <UButton
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                size="sm"
                to="/profit-loss"
              />
            </div>
          </template>

          <!-- Loading -->
          <div v-if="budgetPending" class="space-y-4">
            <div class="grid grid-cols-3 gap-4">
              <USkeleton class="h-20" v-for="i in 3" :key="i" />
            </div>
            <USkeleton class="h-32" />
          </div>

          <!-- Content -->
          <div v-else-if="budgetVariance?.summary" class="space-y-5">
            <!-- Summary cards -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="p-4 rounded-lg bg-elevated text-center">
                <div class="text-2xl font-bold text-highlighted">
                  {{ formatCurrency(budgetVariance.summary.totalBudget) }}
                </div>
                <div class="text-xs text-muted mt-1">Budgeted</div>
              </div>
              <div class="p-4 rounded-lg bg-elevated text-center">
                <div class="text-2xl font-bold text-highlighted">
                  {{ formatCurrency(budgetVariance.summary.totalActual) }}
                </div>
                <div class="text-xs text-muted mt-1">Actual Spend</div>
              </div>
              <div
                class="p-4 rounded-lg text-center"
                :class="budgetVariance.summary.totalVariance > 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'"
              >
                <div
                  class="text-2xl font-bold"
                  :class="budgetVariance.summary.totalVariance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                >
                  {{ budgetVariance.summary.totalVariance > 0 ? '+' : '' }}{{ formatCurrency(budgetVariance.summary.totalVariance) }}
                </div>
                <div class="text-xs text-muted mt-1">
                  Variance ({{ budgetVariance.summary.totalVariancePercent > 0 ? '+' : '' }}{{ budgetVariance.summary.totalVariancePercent.toFixed(1) }}%)
                </div>
              </div>
            </div>

            <!-- Over-budget alerts -->
            <div v-if="budgetAlerts.length > 0" class="space-y-3">
              <h4 class="text-sm font-medium text-highlighted">Over-Budget Categories</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  v-for="cat in budgetAlerts"
                  :key="cat.category"
                  class="flex items-center justify-between p-3 rounded-lg border border-default"
                >
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-highlighted truncate">{{ cat.category }}</div>
                    <div class="text-xs text-muted">
                      {{ formatCurrency(cat.actual) }} of {{ formatCurrency(cat.budgeted) }}
                    </div>
                  </div>
                  <UBadge color="error" variant="subtle" size="xs">
                    +{{ Math.abs(cat.variancePercent).toFixed(0) }}%
                  </UBadge>
                </div>
              </div>
            </div>

            <!-- Budget health summary bar -->
            <div class="flex items-center gap-3 pt-3 border-t border-default">
              <div class="flex items-center gap-2 text-sm">
                <UIcon name="i-lucide-alert-circle" class="h-4 w-4 text-red-500" />
                <span class="text-muted">{{ budgetVariance.summary.overBudgetCount }} over</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <UIcon name="i-lucide-check-circle" class="h-4 w-4 text-emerald-500" />
                <span class="text-muted">{{ budgetVariance.summary.underBudgetCount }} under</span>
              </div>
              <div v-if="budgetVariance.summary.projectedMonthEnd" class="ml-auto text-sm text-muted">
                Projected month-end: <span class="font-medium text-highlighted">{{ formatCurrency(budgetVariance.summary.projectedMonthEnd) }}</span>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else class="flex items-center justify-center py-12">
            <div class="text-center">
              <UIcon name="i-lucide-calculator" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
              <p class="text-muted">No budget data available</p>
              <p class="text-sm text-dimmed">Budget tracking requires configured budgets in Xero</p>
            </div>
          </div>
        </UCard>

        <!-- Quick Actions -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">XeroFlow Navigation</h3>
              <span class="text-xs text-dimmed bg-elevated px-2 py-1 rounded">Cmd+K</span>
            </div>
          </template>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <UButton
              v-for="action in quickActions"
              :key="action.to"
              :to="action.to"
              color="neutral"
              variant="subtle"
              class="flex flex-col items-center p-4 h-auto"
            >
              <UIcon :name="action.icon" class="h-5 w-5 mb-1.5" />
              <span class="text-xs">{{ action.label }}</span>
            </UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
