<script setup lang="ts">
// Import cashflow components
import CashFlowChart from '~/components/dashboard/CashFlowChart.client.vue'
import WaterfallChart from '~/components/cashflow/WaterfallChart.client.vue'
import ScenarioAnalysis from '~/components/cashflow/ScenarioAnalysis.client.vue'
import AIInsights from '~/components/cashflow/AIInsights.vue'
import ExportModal from '~/components/cashflow/ExportModal.vue'

// Fetch comprehensive cash flow data
const { data: cashflowData, pending: cashflowPending, error: cashflowError, refresh: refreshCashflow } = await useFetch('/api/xero/reports/cash-flow-forecast?days=90')
const { data: scenarioData, pending: scenarioPending, error: scenarioError, refresh: refreshScenarios } = await useFetch('/api/xero/reports/cash-flow-scenarios?days=90')
const { data: waterfallData, pending: waterfallPending, error: waterfallError, refresh: refreshWaterfall } = await useFetch('/api/xero/reports/cash-flow-waterfall?period=30')
const { data: invoiceData, pending: invoicePending, error: invoiceError, refresh: refreshInvoices } = await useFetch('/api/xero/invoices')
const { data: bankData, pending: bankPending, error: bankError, refresh: refreshBank } = await useFetch('/api/xero/reports/bank-summary')
const { data: financialInsights, pending: insightsPending, error: insightsError, refresh: refreshInsights } = await useFetch('/api/xero/reports/cash-flow-insights')

const loading = computed(() => cashflowPending.value || scenarioPending.value || waterfallPending.value || invoicePending.value || bankPending.value || insightsPending.value)
const error = computed(() => cashflowError.value || scenarioError.value || waterfallError.value || invoiceError.value || bankError.value || insightsError.value)

const { isNotificationsSlideoverOpen } = useDashboard()

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function formatPercent(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 1 })
}

function formatDays(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return `${Math.round(value)} days`
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRatio(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toFixed(2)
}

// Refresh all data
async function refreshAll() {
  await Promise.all([refreshCashflow(), refreshScenarios(), refreshWaterfall(), refreshInvoices(), refreshBank(), refreshInsights()])
}

// Key metrics calculations
const metrics = computed(() => {
  if (!cashflowData.value) return null
  
  const data = cashflowData.value
  const runway = data.dailyBurnRate > 0 ? data.currentCash / data.dailyBurnRate : null
  const changePercent = data.currentCash > 0 ? ((data.projectedEndBalance - data.currentCash) / data.currentCash) * 100 : 0
  
  return {
    currentCash: data.currentCash,
    projectedEndBalance: data.projectedEndBalance,
    changePercent,
    minProjectedBalance: data.minProjectedBalance,
    maxProjectedBalance: data.maxProjectedBalance,
    burnRate: data.dailyBurnRate,
    runway,
    shortfallCount: data.shortfallDates?.length || 0
  }
})

// Outstanding receivables and payables summary
const outstandingSummary = computed(() => {
  if (!invoiceData.value) return null
  
  const outstanding = invoiceData.value.outstanding || []
  const overdue = invoiceData.value.overdue || []
  
  const outstandingTotal = outstanding.reduce((sum, inv) => sum + (inv.amountDue || 0), 0)
  const overdueTotal = overdue.reduce((sum, inv) => sum + (inv.amountDue || 0), 0)
  
  return {
    outstandingCount: outstanding.length,
    outstandingTotal,
    overdueCount: overdue.length,
    overdueTotal,
    totalReceivables: outstandingTotal + overdueTotal
  }
})

const workingCapitalMetrics = computed(() => {
  const data = financialInsights.value?.workingCapital
  if (!data) return null

  return {
    currentAssets: data.currentAssets,
    currentLiabilities: data.currentLiabilities,
    workingCapital: data.workingCapital,
    quickRatio: data.quickRatio ?? null,
    cashBalance: data.cashBalance
  }
})

const receivableInsights = computed(() => {
  const data = financialInsights.value?.receivables
  if (!data) return null

  return {
    draftInvoices: data.draftInvoices,
    submittedInvoices: data.submittedInvoices,
    quotes: data.quotes,
    totalPipeline: (data.quotes?.totalPipeline ?? 0) + (data.submittedInvoices?.total ?? 0)
  }
})

const payableInsights = computed(() => {
  const data = financialInsights.value?.payables
  if (!data) return null

  return {
    draftBills: data.draftBills,
    submittedBills: data.submittedBills,
    purchaseOrders: data.purchaseOrders,
    totalPipeline: (data.purchaseOrders?.totalPipeline ?? 0) + (data.submittedBills?.total ?? 0)
  }
})

const topOutstandingClients = computed(() => financialInsights.value?.clients?.topOutstanding || [])

// Chart data for the main forecast
const forecastChartData = computed(() => ({
  data: cashflowData.value,
  loading: loading.value
}))

// Status indicators
const cashflowStatus = computed(() => {
  if (!metrics.value) return 'unknown'
  
  if (metrics.value.shortfallCount > 0) return 'critical'
  if (metrics.value.minProjectedBalance < 10000) return 'warning'
  if (metrics.value.changePercent < -20) return 'caution'
  return 'healthy'
})

const statusConfig = {
  healthy: { color: 'emerald', icon: 'i-lucide-trending-up' },
  caution: { color: 'amber', icon: 'i-lucide-alert-triangle' },
  warning: { color: 'orange', icon: 'i-lucide-alert-circle' },
  critical: { color: 'red', icon: 'i-lucide-alert-octagon' },
  unknown: { color: 'gray', icon: 'i-lucide-help-circle' }
}

// Export modal state
const showExportModal = ref(false)

const breadcrumbs = computed(() => ([
  { label: 'Reports', to: '/reports' },
  { label: 'Cash Flow', to: '/cashflow' }
]))
</script>

<template>
  <UDashboardPanel id="cashflow">
    <template #header>
      <UDashboardNavbar title="Cash Flow" description="Real-time cash position, forecast, and insights">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UTooltip text="Notifications" :shortcuts="['N']">
            <UButton
              color="neutral"
              variant="ghost"
              square
              @click="isNotificationsSlideoverOpen = true"
            >
              <UIcon name="i-lucide-bell" class="size-5" />
            </UButton>
          </UTooltip>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UDashboardBreadcrumb :items="breadcrumbs" />
        </template>

        <template #right>
          <div class="flex gap-2">
            <UButton 
              :icon="statusConfig[cashflowStatus].icon" 
              :color="statusConfig[cashflowStatus].color"
              variant="subtle" 
              :label="cashflowStatus.charAt(0).toUpperCase() + cashflowStatus.slice(1)"
              size="sm"
            />
            <UButton 
              label="Refresh" 
              color="neutral" 
              icon="i-lucide-refresh-cw"
              :loading="loading"
              @click="refreshAll" 
            />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading State -->
    <div v-if="loading" class="space-y-6">
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <USkeleton class="h-32" v-for="i in 4" :key="i" />
      </div>
      <USkeleton class="h-96" />
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      icon="i-lucide-alert-circle"
      color="red"
      variant="subtle"
      title="Failed to load cash flow data"
      :description="error.statusMessage || 'Please check your connection and try again.'"
      class="mb-6"
    />

    <!-- Main Dashboard -->
    <div v-else class="space-y-6">
      <!-- Key Metrics Cards -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <!-- Current Cash Position -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted">Current Cash</p>
              <p class="text-2xl font-bold">{{ formatCurrency(metrics?.currentCash) }}</p>
            </div>
            <UIcon name="i-lucide-wallet" class="h-8 w-8 text-blue-500" />
          </div>
          <div class="mt-2 text-xs text-muted">
            As of {{ new Date().toLocaleDateString() }}
          </div>
        </UCard>

        <!-- 90-Day Projection -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted">90-Day Projection</p>
              <p class="text-2xl font-bold" :class="{
                'text-red-600': (metrics?.changePercent || 0) < -10,
                'text-amber-600': (metrics?.changePercent || 0) < 0,
                'text-emerald-600': (metrics?.changePercent || 0) > 0
              }">
                {{ formatCurrency(metrics?.projectedEndBalance) }}
              </p>
            </div>
            <UIcon :name="(metrics?.changePercent || 0) >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" 
                   :class="(metrics?.changePercent || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'" 
                   class="h-8 w-8" />
          </div>
          <div class="mt-2 text-xs" :class="{
            'text-red-600': (metrics?.changePercent || 0) < 0,
            'text-emerald-600': (metrics?.changePercent || 0) > 0,
            'text-muted': (metrics?.changePercent || 0) === 0
          }">
            {{ (metrics?.changePercent || 0) >= 0 ? '+' : '' }}{{ formatPercent((metrics?.changePercent || 0) / 100) }} change
          </div>
        </UCard>

        <!-- Cash Runway -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted">Cash Runway</p>
              <p class="text-2xl font-bold" :class="{
                'text-red-600': (metrics?.runway || 0) < 30,
                'text-amber-600': (metrics?.runway || 0) < 60,
                'text-emerald-600': (metrics?.runway || 0) >= 60
              }">
                {{ formatDays(metrics?.runway) }}
              </p>
            </div>
            <UIcon name="i-lucide-timer" class="h-8 w-8 text-purple-500" />
          </div>
          <div class="mt-2 text-xs text-muted">
            At current burn rate: {{ formatCurrency(metrics?.burnRate) }}/day
          </div>
        </UCard>

        <!-- Outstanding Receivables -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted">Outstanding Receivables</p>
              <p class="text-2xl font-bold text-emerald-600">
                {{ formatCurrency(outstandingSummary?.totalReceivables) }}
              </p>
            </div>
            <UIcon name="i-lucide-receipt" class="h-8 w-8 text-emerald-500" />
          </div>
          <div class="mt-2 text-xs text-muted">
            {{ outstandingSummary?.outstandingCount || 0 }} outstanding, 
            {{ outstandingSummary?.overdueCount || 0 }} overdue
          </div>
        </UCard>
      </div>

      <!-- Working Capital & Pipeline Snapshot -->
      <div v-if="workingCapitalMetrics || receivableInsights || payableInsights" class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <UCard v-if="workingCapitalMetrics">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-semibold">Working Capital</h3>
                <p class="text-xs text-muted">Balance sheet snapshot</p>
              </div>
              <UIcon name="i-lucide-pie-chart" class="h-5 w-5 text-blue-500" />
            </div>
          </template>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted">Current Assets</span>
              <span class="font-medium">{{ formatCurrency(workingCapitalMetrics.currentAssets) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Current Liabilities</span>
              <span class="font-medium">{{ formatCurrency(workingCapitalMetrics.currentLiabilities) }}</span>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-default">
              <span class="text-muted">Working Capital</span>
              <span :class="workingCapitalMetrics.workingCapital >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'">
                {{ formatCurrency(workingCapitalMetrics.workingCapital) }}
              </span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted">Quick Ratio</span>
              <span class="font-medium">{{ formatRatio(workingCapitalMetrics.quickRatio) }}</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted">Cash & Equivalents</span>
              <span class="font-medium">{{ formatCurrency(workingCapitalMetrics.cashBalance) }}</span>
            </div>
          </div>
        </UCard>

        <UCard v-if="receivableInsights">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-semibold">Revenue Pipeline</h3>
                <p class="text-xs text-muted">Pending client billings</p>
              </div>
              <UIcon name="i-lucide-trending-up" class="h-5 w-5 text-emerald-500" />
            </div>
          </template>
          <div class="space-y-3 text-sm">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Draft Invoices</span>
                <span class="font-medium">{{ formatCurrency(receivableInsights.draftInvoices?.total) }}</span>
              </div>
              <p class="text-xs text-muted">{{ receivableInsights.draftInvoices?.count || 0 }} in preparation</p>
            </div>
            <div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Submitted Invoices</span>
                <span class="font-medium">{{ formatCurrency(receivableInsights.submittedInvoices?.total) }}</span>
              </div>
              <p class="text-xs text-muted">{{ receivableInsights.submittedInvoices?.count || 0 }} awaiting approval</p>
            </div>
            <div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Draft Quotes</span>
                <span class="font-medium">{{ formatCurrency(receivableInsights.quotes?.draft?.total) }}</span>
              </div>
              <p class="text-xs text-muted">{{ receivableInsights.quotes?.draft?.count || 0 }} in scoping</p>
            </div>
            <div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Sent Quotes</span>
                <span class="font-medium">{{ formatCurrency(receivableInsights.quotes?.sent?.total) }}</span>
              </div>
              <p class="text-xs text-muted">{{ receivableInsights.quotes?.sent?.count || 0 }} with clients</p>
            </div>
            <div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Accepted Quotes</span>
                <span class="font-medium">{{ formatCurrency(receivableInsights.quotes?.accepted?.total) }}</span>
              </div>
              <p class="text-xs text-muted">{{ receivableInsights.quotes?.accepted?.count || 0 }} ready to invoice</p>
            </div>
            <div class="pt-2 border-t border-default text-xs flex items-center justify-between">
              <span class="text-muted">Total Revenue Pipeline</span>
              <span class="font-semibold text-emerald-600">{{ formatCurrency(receivableInsights.totalPipeline) }}</span>
            </div>
          </div>
        </UCard>

        <UCard v-if="payableInsights">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-semibold">Media & Vendor Commitments</h3>
                <p class="text-xs text-muted">Upcoming cash requirements</p>
              </div>
              <UIcon name="i-lucide-trending-down" class="h-5 w-5 text-red-500" />
            </div>
          </template>
          <div class="space-y-3 text-sm">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Draft Bills</span>
                <span class="font-medium">{{ formatCurrency(payableInsights.draftBills?.total) }}</span>
              </div>
              <p class="text-xs text-muted">{{ payableInsights.draftBills?.count || 0 }} in review</p>
            </div>
            <div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Submitted Bills</span>
                <span class="font-medium">{{ formatCurrency(payableInsights.submittedBills?.total) }}</span>
              </div>
              <p class="text-xs text-muted">{{ payableInsights.submittedBills?.count || 0 }} awaiting approval</p>
            </div>
            <div>
              <div class="flex items-center justify-between">
                <span class="text-muted">Purchase Orders</span>
                <span class="font-medium">{{ formatCurrency(payableInsights.purchaseOrders?.totalPipeline) }}</span>
              </div>
              <p class="text-xs text-muted">{{ (payableInsights.purchaseOrders?.draft?.count || 0) + (payableInsights.purchaseOrders?.submitted?.count || 0) }} open commitments</p>
            </div>
            <div class="pt-2 border-t border-default text-xs flex items-center justify-between">
              <span class="text-muted">Total Cash Obligations</span>
              <span class="font-semibold text-red-600">{{ formatCurrency(payableInsights.totalPipeline) }}</span>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Main Forecast Chart -->
      <UCard class="col-span-full">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold">90-Day Cash Flow Forecast</h3>
              <p class="text-sm text-muted">Projected daily cash position with inflows and outflows</p>
            </div>
            <div class="flex gap-2">
              <UButton
                icon="i-lucide-download"
                size="sm"
                color="neutral"
                variant="ghost"
                label="Export"
                @click="showExportModal = true"
              />
              <UButton
                icon="i-lucide-settings"
                size="sm"
                color="neutral"
                variant="ghost"
                label="Configure"
              />
            </div>
          </div>
        </template>

        <CashFlowChart :data="forecastChartData?.data" :loading="forecastChartData?.loading || false" />
      </UCard>

      <!-- Advanced Analysis -->
      <div class="space-y-6">
        <!-- Waterfall Chart -->
        <WaterfallChart :data="waterfallData" :loading="waterfallPending" />

        <!-- Scenario Analysis -->
        <ScenarioAnalysis :data="scenarioData" :loading="scenarioPending" />
      </div>

      <!-- Detailed Analysis Grid -->
      <div class="space-y-6">
        <!-- AI-Powered Insights -->
        <AIInsights 
          :cashflow-data="cashflowData" 
          :invoice-data="invoiceData" 
          :scenario-data="scenarioData"
          :loading="loading"
        />

        <!-- Outstanding Invoices Summary -->
        <UCard class="border-none shadow-none ring-1 ring-black/5 dark:ring-white/5 bg-gradient-to-r from-emerald-50/90 via-white to-white dark:from-emerald-950/30 dark:via-transparent">
          <template #header>
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <UIcon name="i-lucide-file-text" class="h-5 w-5" />
              Receivables Summary
            </h3>
          </template>

          <div class="space-y-4">
            <!-- Outstanding Invoices -->
            <div class="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
              <div>
                <p class="font-medium text-emerald-800 dark:text-emerald-200">Outstanding</p>
                <p class="text-sm text-emerald-600 dark:text-emerald-400">
                  {{ outstandingSummary?.outstandingCount || 0 }} invoice{{ (outstandingSummary?.outstandingCount || 0) !== 1 ? 's' : '' }}
                </p>
              </div>
              <div class="text-right">
                <p class="font-bold text-emerald-800 dark:text-emerald-200">
                  {{ formatCurrency(outstandingSummary?.outstandingTotal) }}
                </p>
              </div>
            </div>

            <!-- Overdue Invoices -->
            <div v-if="outstandingSummary?.overdueCount && outstandingSummary.overdueCount > 0" 
                 class="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <div>
                <p class="font-medium text-red-800 dark:text-red-200">Overdue</p>
                <p class="text-sm text-red-600 dark:text-red-400">
                  {{ outstandingSummary.overdueCount }} invoice{{ outstandingSummary.overdueCount !== 1 ? 's' : '' }}
                </p>
              </div>
              <div class="text-right">
                <p class="font-bold text-red-800 dark:text-red-200">
                  {{ formatCurrency(outstandingSummary.overdueTotal) }}
                </p>
              </div>
            </div>

            <!-- Quick Actions -->
            <div class="pt-2 border-t border-gray-200 dark:border-gray-800">
              <div class="flex gap-2">
                <UButton
                  label="View Invoices"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-external-link"
                  to="/invoices"
                />
                <UButton
                  label="Send Reminders"
                  color="primary"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-mail"
                />
              </div>
            </div>
          </div>
        </UCard>

        <!-- Top Outstanding Clients -->
        <UCard v-if="topOutstandingClients.length" class="border-none shadow-none ring-1 ring-black/5 dark:ring-white/5 dark:via-transparent">
          <template #header>
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <UIcon name="i-lucide-users" class="h-5 w-5" />
              Top Outstanding Clients
            </h3>
          </template>

          <div class="space-y-4">
            <div
              v-for="client in topOutstandingClients"
              :key="client.id"
              class="space-y-3 p-4 bg-white/70 dark:bg-white/5 rounded-lg border border-black/5 dark:border-white/5"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="font-semibold text-base">{{ client.name }}</p>
                  <p class="text-xs text-muted">Outstanding {{ formatCurrency(client.outstanding) }}</p>
                  <p v-if="client.overdue" class="text-xs text-red-500">
                    Overdue {{ formatCurrency(client.overdue) }} ({{ Math.round((client.overdueRatio || 0) * 100) }}%)
                  </p>
                </div>
                <div class="flex flex-col items-end gap-1 text-xs">
                  <span v-if="client.creditLimit" class="text-muted">Credit Limit: {{ formatCurrency(client.creditLimit) }}</span>
                  <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                    :class="client.overdue ? 'bg-red-50 text-red-600 dark:bg-red-950/20' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20'">
                    <UIcon :name="client.overdue ? 'i-lucide-alert-triangle' : 'i-lucide-badge-check'" class="h-4 w-4" />
                    {{ client.overdue ? 'Follow up' : 'On track' }}
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted">
                <div>
                  <span class="block uppercase tracking-wide">Invoices</span>
                  <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ client.invoiceCount }}</span>
                </div>
                <div>
                  <span class="block uppercase tracking-wide">Overdue</span>
                  <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ client.overdueCount }}</span>
                </div>
                <div>
                  <span class="block uppercase tracking-wide">Latest Invoice</span>
                  <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ formatDate(client.latestInvoiceDate) }}</span>
                </div>
                <div>
                  <span class="block uppercase tracking-wide">Next Due</span>
                  <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ formatDate(client.earliestDueDate) }}</span>
                </div>
              </div>

              <div v-if="client.sampleInvoices?.length" class="space-y-2">
                <p class="text-xs font-medium text-muted uppercase tracking-wide">Upcoming Invoices</p>
                <div class="space-y-1">
                  <div
                    v-for="invoice in client.sampleInvoices"
                    :key="invoice.id"
                    class="flex items-center justify-between text-xs bg-black/5 dark:bg-white/10 rounded px-2 py-1"
                  >
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-neutral-900 dark:text-neutral-100">{{ invoice.number || invoice.reference || invoice.id?.slice(0, 6) }}</span>
                      <span class="text-muted">Due {{ formatDate(invoice.dueDate) }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span :class="invoice.isOverdue ? 'text-red-500 font-medium' : 'text-neutral-900 dark:text-neutral-100'">
                        {{ formatCurrency(invoice.amountDue) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Historical Analysis -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UIcon name="i-lucide-bar-chart-3" class="h-5 w-5" />
            Cash Flow Analysis
          </h3>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Range Analysis -->
          <div class="space-y-3">
            <h4 class="font-medium text-sm">Projected Range</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-muted">Maximum:</span>
                <span class="font-medium text-emerald-600">
                  {{ formatCurrency(metrics?.maxProjectedBalance) }}
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Current:</span>
                <span class="font-medium">
                  {{ formatCurrency(metrics?.currentCash) }}
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Minimum:</span>
                <span class="font-medium" :class="{
                  'text-red-600': (metrics?.minProjectedBalance || 0) < 0,
                  'text-amber-600': (metrics?.minProjectedBalance || 0) < 10000 && (metrics?.minProjectedBalance || 0) >= 0
                }">
                  {{ formatCurrency(metrics?.minProjectedBalance) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Burn Rate Analysis -->
          <div class="space-y-3">
            <h4 class="font-medium text-sm">Burn Rate</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-muted">Daily:</span>
                <span class="font-medium">{{ formatCurrency(metrics?.burnRate) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Weekly:</span>
                <span class="font-medium">{{ formatCurrency((metrics?.burnRate || 0) * 7) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Monthly:</span>
                <span class="font-medium">{{ formatCurrency((metrics?.burnRate || 0) * 30) }}</span>
              </div>
            </div>
          </div>

          <!-- Forecast Accuracy -->
          <div class="space-y-3">
            <h4 class="font-medium text-sm">Forecast Period</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-muted">Period:</span>
                <span class="font-medium">{{ cashflowData?.forecastPeriod || 90 }} days</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Data Points:</span>
                <span class="font-medium">{{ cashflowData?.forecast?.length || 0 }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Last Updated:</span>
                <span class="font-medium">{{ new Date().toLocaleDateString() }}</span>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Export Modal -->
    <ExportModal v-model:open="showExportModal" />
    </template>

  </UDashboardPanel>
</template>
