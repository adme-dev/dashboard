<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

// Async components for better performance
const AsyncKPICards = defineAsyncComponent(() => import('~/components/dashboard/KPICards.vue'))
const AsyncCashFlowChart = defineAsyncComponent(() => import('~/components/dashboard/CashFlowChart.client.vue'))
const AsyncInvoicePipeline = defineAsyncComponent(() => import('~/components/dashboard/InvoicePipeline.vue'))
const AsyncAnomalyAlerts = defineAsyncComponent(() => import('~/components/dashboard/AnomalyAlerts.vue'))

// Check connection status - required for all dashboard data
const { data: statusData, refresh: refreshStatus } = await useFetch('/api/xero/status')
const isConnected = computed(() => statusData.value?.connected || false)

// Only fetch data when connected to Xero
const { data: kpiData, pending: kpiPending, error: kpiError, refresh: refreshKPI } = await useFetch('/api/kpis-advanced', {
  lazy: true
})

const { data: cashFlowData, pending: cashFlowPending, refresh: refreshCashFlow } = await useFetch('/api/xero/reports/cash-flow-forecast?days=90', {
  lazy: true
})

const { data: pipelineData, pending: pipelinePending, refresh: refreshPipeline } = await useFetch('/api/xero/invoice-pipeline?days=90', {
  lazy: true
})

const { data: anomalyData, pending: anomalyPending, refresh: refreshAnomalies } = await useFetch('/api/ai/anomaly-detection?days=30&sensitivity=2', {
  lazy: true
})

// Auto-refresh every 5 minutes
const refreshInterval = 5 * 60 * 1000
let refreshTimer: NodeJS.Timeout

onMounted(() => {
  refreshTimer = setInterval(() => {
    if (isConnected) {
      Promise.all([refreshKPI(), refreshCashFlow(), refreshPipeline(), refreshAnomalies()])
    }
  }, refreshInterval)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

// Manual refresh all
async function refreshAll() {
  await Promise.all([refreshKPI(), refreshCashFlow(), refreshPipeline(), refreshAnomalies()])
}

// Keyboard shortcuts
onMounted(() => {
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      switch (e.key) {
        case 'r':
          e.preventDefault()
          refreshAll()
          break
        case 'k':
          e.preventDefault()
          // Open command palette (will implement later)
          break
      }
    }
  }
  
  document.addEventListener('keydown', handleKeydown)
  
  return () => {
    document.removeEventListener('keydown', handleKeydown)
  }
})

// Breadcrumbs
const breadcrumbs = computed(() => ([
  { label: 'Home', to: '/' },
  { label: 'Executive Dashboard', to: '/dashboard' }
]))

// Page title with live indicator
const pageTitle = computed(() => {
  const baseTitle = 'Executive Dashboard'
  return isConnected ? `${baseTitle} • Live` : `${baseTitle} • Demo`
})

// Critical alerts from KPI data
const criticalAlerts = computed(() => {
  return kpiData.value?.alerts?.filter(alert => alert.severity === 'critical') || []
})
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
              :loading="kpiPending || cashFlowPending"
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
              color="red"
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
          color="red"
          variant="subtle"
          :title="alert.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())"
          :description="alert.message"
          class="mb-2"
        />
      </div>

      <!-- Connection Error -->
      <div v-if="kpiError && isConnected" class="mb-6">
        <UAlert
          icon="i-lucide-wifi-off"
          color="red"
          title="Connection Error"
          description="Unable to fetch live data from Xero. Please check your connection."
        />
      </div>

      <div class="space-y-6">
        <!-- KPI Cards -->
        <ClientOnly>
          <AsyncKPICards 
            :data="kpiData" 
            :loading="kpiPending" 
            :connected="isConnected"
          />
          <template #fallback>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
              <USkeleton class="h-32" v-for="i in 4" :key="i" />
            </div>
          </template>
        </ClientOnly>

        <!-- Main Dashboard Grid -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <!-- Cash Flow Forecast (2/3 width) -->
          <div class="xl:col-span-2">
            <ClientOnly>
              <AsyncCashFlowChart 
                :data="cashFlowData" 
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
                :data="anomalyData" 
                :loading="anomalyPending"
              />
              <template #fallback>
                <USkeleton class="h-80" />
              </template>
            </ClientOnly>
          </div>
        </div>

        <!-- Invoice Pipeline -->
        <ClientOnly>
          <AsyncInvoicePipeline 
            :data="pipelineData" 
            :loading="pipelinePending"
          />
          <template #fallback>
            <USkeleton class="h-64" />
          </template>
        </ClientOnly>

        <!-- Quick Actions -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Quick Actions</h3>
              <span class="text-xs bg-muted px-2 py-1 rounded">Cmd+K</span>
            </div>
          </template>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <UButton
              to="/expenses"
              color="neutral"
              variant="subtle"
              class="flex flex-col items-center p-4 h-auto"
            >
              <UIcon name="i-lucide-credit-card" class="h-6 w-6 mb-2" />
              <span class="text-sm">Expense Analytics</span>
            </UButton>

            <UButton
              to="/reports"
              color="neutral"
              variant="subtle"
              class="flex flex-col items-center p-4 h-auto"
            >
              <UIcon name="i-lucide-bar-chart-3" class="h-6 w-6 mb-2" />
              <span class="text-sm">Financial Reports</span>
            </UButton>

            <UButton
              to="/cashflow"
              color="neutral"
              variant="subtle"
              class="flex flex-col items-center p-4 h-auto"
            >
              <UIcon name="i-lucide-trending-up" class="h-6 w-6 mb-2" />
              <span class="text-sm">Cash Flow</span>
            </UButton>

            <UButton
              to="/anomalies"
              color="neutral"
              variant="subtle"
              class="flex flex-col items-center p-4 h-auto"
            >
              <UIcon name="i-lucide-search" class="h-6 w-6 mb-2" />
              <span class="text-sm">Anomaly Detection</span>
            </UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* Add any custom styles here */
</style>
