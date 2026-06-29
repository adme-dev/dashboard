<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-finance'] })

import { defineAsyncComponent } from 'vue'

const AsyncCategoryDonut = defineAsyncComponent(() => import('~/components/expenses/CategoryDonut.client.vue'))
const AsyncVendorContributionBars = defineAsyncComponent(() => import('~/components/expenses/VendorContributionBars.client.vue'))
const AsyncCategoryTreemap = defineAsyncComponent(() => import('~/components/expenses/CategoryTreemap.client.vue'))

// Check if connected to Xero - required for real data.
// Client-only + getCachedData so the page renders immediately and reflects
// current connection state on every navigation.
const { data: statusData, refresh: refreshStatus } = useLazyFetch('/api/xero/status', {
  server: false,
  key: 'xero-status-expenses',
  getCachedData: () => undefined,
})
const isConnected = computed(() => statusData.value?.connected || false)

// Period selection
const now = new Date()
const selectedMonth = ref(now.getMonth() + 1) // 1-indexed
const selectedYear = ref(now.getFullYear())

const periodFrom = computed(() => {
  const d = new Date(selectedYear.value, selectedMonth.value - 1, 1)
  return d.toISOString().slice(0, 10)
})
const periodTo = computed(() => {
  const d = new Date(selectedYear.value, selectedMonth.value, 0) // last day of month
  return d.toISOString().slice(0, 10)
})

const periodLabel = computed(() => {
  const d = new Date(selectedYear.value, selectedMonth.value - 1)
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
})

function prevMonth() {
  if (selectedMonth.value === 1) {
    selectedMonth.value = 12
    selectedYear.value--
  } else {
    selectedMonth.value--
  }
}
function nextMonth() {
  if (isCurrentMonth.value) return
  if (selectedMonth.value === 12) {
    selectedMonth.value = 1
    selectedYear.value++
  } else {
    selectedMonth.value++
  }
}
const isCurrentMonth = computed(() => selectedMonth.value === now.getMonth() + 1 && selectedYear.value === now.getFullYear())

// Only fetch data if connected to Xero.
// Lazy + client-only: don't block page render on Xero latency and never
// serve a stale cached response from Nuxt's data layer.
const { data, pending, error, refresh } = useLazyFetch('/api/xero/expenses', {
  server: false,
  getCachedData: () => undefined,
  query: computed(() => ({ from: periodFrom.value, to: periodTo.value }))
})

// Refresh data when connection status changes
watch(isConnected, async (newValue, oldValue) => {
  if (newValue !== oldValue && newValue) {
    await refresh()
  }
})

const expensesData = computed(() => data.value ?? null)

const daySpan = computed(() => {
  const from = expensesData.value?.range?.from
  const to = expensesData.value?.range?.to
  if (!from || !to) return 30
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const diffMs = toDate.valueOf() - fromDate.valueOf()
  return Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)) || 0, 1)
})

const metrics = computed(() => {
  const categories = expensesData.value?.categories ?? []
  const vendors = expensesData.value?.vendors ?? []
  const totalSpend = categories.reduce((total, item) => total + (item.amount || 0), 0)
  const averagePerDay = totalSpend / daySpan.value

  const topCategory = categories[0]
  const topVendor = vendors[0]

  return {
    totalSpend,
    averagePerDay,
    categoryCount: categories.length,
    vendorCount: vendors.length,
    topCategory,
    topVendor
  }
})

const breadcrumbs = computed(() => ([
  { label: 'Reports', to: '/reports' },
  { label: 'Expense Analytics', to: '/expenses' }
]))

const rangeDescription = computed(() => {
  if (!isConnected.value) {
    return 'Connect to Xero to view expense data'
  }
  return periodLabel.value
})

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

const categoryColumns = [
  { accessorKey: 'name', header: 'Category' },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }: { row: { getValue: (key: string) => number } }) => formatCurrency(row.getValue('amount'))
  }
]

const vendorColumns = [
  { accessorKey: 'name', header: 'Vendor' },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }: { row: { getValue: (key: string) => number } }) => formatCurrency(row.getValue('amount'))
  }
]

// Transaction table
const transactionColumns = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'vendor', header: 'Vendor' },
  { accessorKey: 'category', header: 'Category' },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }: { row: { getValue: (key: string) => number } }) => formatCurrency(row.getValue('amount'))
  },
  {
    accessorKey: 'taxAmount',
    header: 'GST',
    cell: ({ row }: { row: { getValue: (key: string) => number } }) => formatCurrency(row.getValue('taxAmount'))
  },
  { accessorKey: 'status', header: 'Status' },
]

const txPage = ref(1)
const txPerPage = 10
const txSearch = ref('')
const txSortField = ref<'amount' | 'date'>('date')
const txSortDir = ref<'asc' | 'desc'>('desc')

const filteredTransactions = computed(() => {
  const items = [...(expensesData.value?.transactions || [])]
  const q = txSearch.value.toLowerCase().trim()
  if (!q) return items
  return items.filter((tx: any) =>
    (tx.vendor || '').toLowerCase().includes(q) ||
    (tx.category || '').toLowerCase().includes(q) ||
    (tx.description || '').toLowerCase().includes(q) ||
    (tx.invoiceNumber || '').toLowerCase().includes(q) ||
    (tx.status || '').toLowerCase().includes(q)
  )
})

const sortedTransactions = computed(() => {
  const items = [...filteredTransactions.value]
  items.sort((a: any, b: any) => {
    const field = txSortField.value
    const dir = txSortDir.value === 'asc' ? 1 : -1
    if (field === 'amount') return (a.amount - b.amount) * dir
    return (a.date || '').localeCompare(b.date || '') * dir
  })
  return items
})

const paginatedTransactions = computed(() => {
  const start = (txPage.value - 1) * txPerPage
  return sortedTransactions.value.slice(start, start + txPerPage)
})

const txTotalPages = computed(() => Math.ceil(sortedTransactions.value.length / txPerPage))

function toggleTxSort(field: 'amount' | 'date') {
  if (txSortField.value === field) {
    txSortDir.value = txSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    txSortField.value = field
    txSortDir.value = 'desc'
  }
  txPage.value = 1
}

watch(txSearch, () => { txPage.value = 1 })

// MoM helpers
const momData = computed(() => expensesData.value?.monthOverMonth)
const momDirection = computed(() => {
  if (!momData.value) return 'neutral'
  const c = momData.value.change
  if (Math.abs(c) < 2) return 'neutral'
  return c > 0 ? 'up' : 'down'
})

// Daily trend max
const dailyMax = computed(() => {
  const totals = expensesData.value?.dailyTotals || []
  return Math.max(...totals.map((d: any) => d.amount), 1)
})

// Fixed vs variable percentage
const fvTotal = computed(() => {
  const fv = expensesData.value?.fixedVsVariable
  if (!fv) return 0
  return fv.fixed.total + fv.variable.total
})

// Export functionality
async function exportData(format: 'csv' | 'json') {
  try {
    const { downloadCSV, downloadJSON, getExportFilename } = await import('~/utils/export')
    
    if (!expensesData.value) {
      throw new Error('No data to export')
    }

    const exportData = [
      ...expensesData.value.categories.map((item) => ({
        type: 'Category',
        name: item.name,
        amount: item.amount,
        dateRange: `${expensesData.value?.range?.from} to ${expensesData.value?.range?.to}`
      })),
      ...expensesData.value.vendors.map((item) => ({
        type: 'Vendor',
        name: item.name,
        amount: item.amount,
        dateRange: `${expensesData.value?.range?.from} to ${expensesData.value?.range?.to}`
      }))
    ]

    if (format === 'csv') {
      downloadCSV(exportData, getExportFilename('expenses', 'csv'))
    } else {
      downloadJSON({
        exportDate: new Date().toISOString(),
        dateRange: expensesData.value.range,
        summary: {
          totalSpend: metrics.value.totalSpend,
          averagePerDay: metrics.value.averagePerDay,
          categoryCount: metrics.value.categoryCount,
          vendorCount: metrics.value.vendorCount
        },
        data: exportData
      }, getExportFilename('expenses', 'json'))
    }

    // Show success toast
    const toast = useToast()
    toast.add({
      title: 'Export Successful',
      description: `Expense data exported as ${format.toUpperCase()}`,
      icon: 'i-lucide-check-circle',
      color: 'success'
    })
  } catch (error) {
    console.error('Export failed:', error)
    const toast = useToast()
    toast.add({
      title: 'Export Failed',
      description: 'Unable to export expense data',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
  }
}
</script>

<template>
  <UDashboardPanel id="expenses">
    <template #header>
      <UDashboardNavbar title="Expense Analytics">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <!-- Export Buttons -->
            <UButton
              icon="i-lucide-download"
              label="CSV"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="exportData('csv')"
            />
            
            <UButton
              icon="i-lucide-file-code"
              label="JSON"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="exportData('json')"
              class="hidden sm:flex"
            />

            <!-- Refresh Button -->
            <UButton 
              icon="i-lucide-refresh-cw"
              label="Refresh"
              color="neutral" 
              size="sm"
              @click="async () => { await refreshStatus(); await refresh(); }" 
              class="hidden sm:flex"
            />
            
            <!-- Mobile Refresh Button -->
            <UButton 
              icon="i-lucide-refresh-cw"
              color="neutral" 
              variant="ghost"
              size="sm"
              @click="async () => { await refreshStatus(); await refresh(); }" 
              class="sm:hidden"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :links="breadcrumbs" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <!-- Month Picker -->
            <div class="flex items-center gap-1">
              <UButton icon="i-lucide-chevron-left" size="xs" variant="ghost" color="neutral" @click="prevMonth" />
              <span class="text-sm font-medium min-w-[140px] text-center">{{ periodLabel }}</span>
              <UButton icon="i-lucide-chevron-right" size="xs" variant="ghost" color="neutral" :disabled="isCurrentMonth" @click="nextMonth" />
            </div>

            <!-- Period shortcuts -->
            <UDropdownMenu :items="[[
              { label: 'This Month', icon: 'i-lucide-calendar', onSelect: () => { selectedMonth = now.getMonth() + 1; selectedYear = now.getFullYear() } },
              { label: 'Last Month', icon: 'i-lucide-calendar-minus', onSelect: () => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); selectedMonth = d.getMonth() + 1; selectedYear = d.getFullYear() } },
              { label: '2 Months Ago', icon: 'i-lucide-calendar-clock', onSelect: () => { const d = new Date(now.getFullYear(), now.getMonth() - 2, 1); selectedMonth = d.getMonth() + 1; selectedYear = d.getFullYear() } },
            ]]">
              <UButton icon="i-lucide-calendar" size="xs" variant="ghost" color="neutral" />
            </UDropdownMenu>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-4">
        <USkeleton class="h-6 w-40" />
        <USkeleton class="h-32 w-full" />
      </div>
      <div v-else-if="error" class="text-negative text-sm">
        Failed to load expenses.
      </div>

      <div v-else class="space-y-8">
        <!-- Connection Required Banner -->
        <div v-if="!isConnected" class="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50 rounded-xl p-6 border border-red-200 dark:border-red-800/50 mb-8">
          <div class="text-center">
            <div class="p-4 bg-red-100 dark:bg-red-900/50 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <UIcon name="i-lucide-plug-zap" class="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <h2 class="text-xl font-bold text-red-900 dark:text-red-100 mb-2">Xero Connection Required</h2>
            <p class="text-red-700 dark:text-red-300 mb-6 max-w-md mx-auto">
              To view your expense analytics, you need to connect your Xero account. This ensures you see real, up-to-date financial data.
            </p>
            <div class="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <UButton
                color="error"
                size="lg"
                @click="navigateTo('/api/xero/login')"
              >
                <UIcon name="i-lucide-link" class="h-5 w-5 mr-2" />
                Connect to Xero
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                size="lg"
                @click="navigateTo('/settings')"
              >
                <UIcon name="i-lucide-settings" class="h-5 w-5 mr-2" />
                Settings
              </UButton>
            </div>
          </div>
        </div>

        <!-- Dashboard Content - Only show when connected -->
        <div v-if="isConnected">
        <!-- Executive Summary Cards -->
        <div class="bg-gray-50/50 dark:bg-gray-800/20 mb-5 rounded-xl p-6 border border-gray-200 dark:border-gray-700/50">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <UIcon name="i-lucide-trending-up" class="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Financial Overview</h2>
                <p class="text-sm text-muted">{{ rangeDescription }}</p>
              </div>
            </div>
            <div v-if="isConnected" class="flex items-center gap-2">
              <div class="w-2 h-2 bg-green-500 rounded-full"></div>
              <span class="text-xs text-green-700 dark:text-green-300 font-medium">Live Data</span>
            </div>
          </div>
          
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20">
              <div class="flex items-center gap-2 mb-2">
                <UIcon name="i-lucide-dollar-sign" class="h-4 w-4 text-green-600" />
                <p class="text-xs font-medium text-muted uppercase tracking-wide">Total Spend</p>
              </div>
              <p class="text-2xl font-bold text-green-600 mb-1">
                {{ formatCurrency(metrics.totalSpend) }}
              </p>
              <p class="text-xs text-muted">
                Across {{ metrics.categoryCount }} categories
              </p>
            </div>

            <div class="bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20">
              <div class="flex items-center gap-2 mb-2">
                <UIcon name="i-lucide-calendar" class="h-4 w-4 text-blue-600" />
                <p class="text-xs font-medium text-muted uppercase tracking-wide">Daily Average</p>
              </div>
              <p class="text-2xl font-bold text-blue-600 mb-1">
                {{ formatCurrency(metrics.averagePerDay) }}
              </p>
              <p class="text-xs text-muted">
                {{ periodLabel }}
              </p>
            </div>

            <div class="bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20">
              <div class="flex items-center gap-2 mb-2">
                <UIcon name="i-lucide-tag" class="h-4 w-4 text-purple-600" />
                <p class="text-xs font-medium text-muted uppercase tracking-wide">Top Category</p>
              </div>
              <p class="text-lg font-bold text-purple-600 mb-1 truncate" :title="metrics.topCategory?.name">
                {{ metrics.topCategory?.name || 'No data' }}
              </p>
              <p class="text-xs text-muted">
                {{ formatCurrency(metrics.topCategory?.amount) }}
              </p>
            </div>

            <div class="bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20">
              <div class="flex items-center gap-2 mb-2">
                <UIcon name="i-lucide-building" class="h-4 w-4 text-orange-600" />
                <p class="text-xs font-medium text-muted uppercase tracking-wide">Top Vendor</p>
              </div>
              <p class="text-lg font-bold text-orange-600 mb-1 truncate" :title="metrics.topVendor?.name">
                {{ metrics.topVendor?.name || 'No data' }}
              </p>
              <p class="text-xs text-muted">
                {{ formatCurrency(metrics.topVendor?.amount) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Month-over-Month Banner -->
        <div
          v-if="momData && momData.previous.total > 0"
          class="rounded-lg px-4 py-3 flex items-center gap-3 mb-5"
          :class="{
            'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50': momDirection === 'up',
            'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50': momDirection === 'down',
            'bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/50': momDirection === 'neutral',
          }"
        >
          <UIcon
            :name="momDirection === 'up' ? 'i-lucide-trending-up' : momDirection === 'down' ? 'i-lucide-trending-down' : 'i-lucide-minus'"
            class="h-5 w-5 shrink-0"
            :class="{
              'text-red-600 dark:text-red-400': momDirection === 'up',
              'text-emerald-600 dark:text-emerald-400': momDirection === 'down',
              'text-gray-600 dark:text-gray-400': momDirection === 'neutral',
            }"
          />
          <p class="text-sm font-medium"
            :class="{
              'text-red-800 dark:text-red-200': momDirection === 'up',
              'text-emerald-800 dark:text-emerald-200': momDirection === 'down',
              'text-gray-700 dark:text-gray-300': momDirection === 'neutral',
            }"
          >
            Spending is {{ Math.abs(momData.change) }}%
            {{ momDirection === 'up' ? 'higher' : momDirection === 'down' ? 'lower' : 'about the same as' }}
            {{ momDirection !== 'neutral' ? 'than' : '' }} last period
            <span class="text-xs font-normal ml-1">({{ formatCurrency(Math.abs(momData.changeAmount)) }} {{ momData.changeAmount >= 0 ? 'more' : 'less' }})</span>
          </p>
        </div>

        <!-- Daily Spend Trend -->
        <div v-if="(expensesData?.dailyTotals || []).length > 1" class="mb-5">
          <div class="bg-gray-50/50 dark:bg-gray-800/20 rounded-xl p-4 border border-gray-200 dark:border-gray-700/50">
            <div class="flex items-center gap-2 mb-3">
              <UIcon name="i-lucide-bar-chart" class="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Daily Spend</h3>
            </div>
            <div class="flex items-end gap-[2px] h-16">
              <div
                v-for="day in (expensesData?.dailyTotals || [])"
                :key="day.date"
                class="flex-1 bg-blue-500/80 dark:bg-blue-400/60 rounded-t-sm hover:bg-blue-600 dark:hover:bg-blue-400 transition-colors cursor-default min-w-[2px]"
                :style="{ height: `${Math.max((day.amount / dailyMax) * 100, 4)}%` }"
                :title="`${day.date}: ${formatCurrency(day.amount)}`"
              />
            </div>
            <div class="flex justify-between mt-1">
              <span class="text-[10px] text-muted">{{ (expensesData?.dailyTotals || [])[0]?.date?.slice(8) }}</span>
              <span class="text-[10px] text-muted">{{ (expensesData?.dailyTotals || []).at(-1)?.date?.slice(8) }}</span>
            </div>
          </div>
        </div>

        <!-- Analytics Dashboard -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <!-- Main Chart Area -->
          <div class="xl:col-span-2 space-y-6">
            <!-- Category Distribution -->
            <UCard class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-blue-50 dark:bg-blue-900/50 rounded-lg">
                      <UIcon name="i-lucide-pie-chart" class="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 class="text-lg font-semibold">Expense Distribution</h3>
                      <p class="text-sm text-muted">Category breakdown and analysis</p>
                    </div>
                  </div>
                </div>
              </template>

              <ClientOnly>
                <AsyncCategoryDonut :categories="data?.categories || []" />
              </ClientOnly>
            </UCard>

            <!-- Category Treemap Visualization -->
            <UCard class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-green-50 dark:bg-green-900/50 rounded-lg">
                      <UIcon name="i-lucide-layout-grid" class="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 class="text-lg font-semibold">Category Breakdown</h3>
                      <p class="text-sm text-muted">Visual expense distribution</p>
                    </div>
                  </div>
                  <UBadge color="primary" variant="subtle">
                    {{ (data?.categories || []).length }} categories
                  </UBadge>
                </div>
              </template>

              <ClientOnly>
                <AsyncCategoryTreemap :categories="data?.categories || []" />
              </ClientOnly>
            </UCard>

            <!-- Fixed vs Variable Split (left column) -->
            <UCard v-if="expensesData?.fixedVsVariable" class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <template #header>
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-cyan-50 dark:bg-cyan-900/50 rounded-lg">
                    <UIcon name="i-lucide-split" class="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold">Fixed vs Variable</h3>
                    <p class="text-sm text-muted">Cost structure breakdown</p>
                  </div>
                </div>
              </template>

              <div class="space-y-4">
                <!-- Stacked bar -->
                <div class="h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                  <div
                    class="h-full bg-blue-500 transition-all duration-500"
                    :style="{ width: fvTotal > 0 ? `${(expensesData.fixedVsVariable.fixed.total / fvTotal) * 100}%` : '0%' }"
                  />
                  <div
                    class="h-full bg-emerald-500 transition-all duration-500"
                    :style="{ width: fvTotal > 0 ? `${(expensesData.fixedVsVariable.variable.total / fvTotal) * 100}%` : '0%' }"
                  />
                </div>

                <!-- Legend -->
                <div class="grid grid-cols-2 gap-3">
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div class="flex items-center gap-2 mb-1">
                      <div class="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span class="text-xs font-medium text-muted">Fixed</span>
                    </div>
                    <p class="text-sm font-bold tabular-nums">{{ formatCurrency(expensesData.fixedVsVariable.fixed.total) }}</p>
                    <p class="text-[10px] text-muted">{{ fvTotal > 0 ? ((expensesData.fixedVsVariable.fixed.total / fvTotal) * 100).toFixed(0) : 0 }}%</p>
                  </div>
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div class="flex items-center gap-2 mb-1">
                      <div class="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span class="text-xs font-medium text-muted">Variable</span>
                    </div>
                    <p class="text-sm font-bold tabular-nums">{{ formatCurrency(expensesData.fixedVsVariable.variable.total) }}</p>
                    <p class="text-[10px] text-muted">{{ fvTotal > 0 ? ((expensesData.fixedVsVariable.variable.total / fvTotal) * 100).toFixed(0) : 0 }}%</p>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- GST Summary (left column) -->
            <UCard v-if="expensesData?.taxSummary" class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <template #header>
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-amber-50 dark:bg-amber-900/50 rounded-lg">
                    <UIcon name="i-lucide-receipt" class="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold">GST Summary</h3>
                    <p class="text-sm text-muted">Tax breakdown</p>
                  </div>
                </div>
              </template>

              <div class="space-y-3">
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span class="text-sm text-muted">Gross Total</span>
                  <span class="text-sm font-bold tabular-nums">{{ formatCurrency(expensesData.taxSummary.totalGross) }}</span>
                </div>
                <div class="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <span class="text-sm font-medium text-amber-800 dark:text-amber-200">GST Component</span>
                  <span class="text-sm font-bold text-amber-700 dark:text-amber-300 tabular-nums">{{ formatCurrency(expensesData.taxSummary.totalTax) }}</span>
                </div>
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span class="text-sm text-muted">Net Total</span>
                  <span class="text-sm font-bold tabular-nums">{{ formatCurrency(expensesData.taxSummary.totalNet) }}</span>
                </div>

                <div v-if="expensesData.taxSummary.byTaxType.length" class="border-t border-gray-100 dark:border-gray-800 pt-3 mt-3">
                  <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">By Tax Type</h4>
                  <div class="space-y-2">
                    <div
                      v-for="tt in expensesData.taxSummary.byTaxType.slice(0, 5)"
                      :key="tt.taxType"
                      class="flex items-center justify-between text-sm"
                    >
                      <span class="text-muted truncate">{{ tt.taxType }}</span>
                      <span class="font-medium tabular-nums ml-2">{{ formatCurrency(tt.tax) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Sidebar Analytics -->
          <div class="space-y-6">
            <!-- Vendor Concentration -->
            <UCard class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <template #header>
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-orange-50 dark:bg-orange-900/50 rounded-lg">
                    <UIcon name="i-lucide-bar-chart-3" class="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold">Vendor Analysis</h3>
                    <p class="text-sm text-muted">Top spending relationships</p>
                  </div>
                </div>
              </template>
              
              <ClientOnly>
                <AsyncVendorContributionBars :vendors="data?.vendors || []" />
              </ClientOnly>
            </UCard>


            <!-- Quick Stats -->
            <UCard class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <template #header>
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-purple-50 dark:bg-purple-900/50 rounded-lg">
                    <UIcon name="i-lucide-activity" class="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold">Key Insights</h3>
                    <p class="text-sm text-muted">Performance indicators</p>
                  </div>
                </div>
              </template>
              
              <div class="space-y-4">
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div class="flex items-center gap-3">
                    <UIcon name="i-lucide-users" class="h-4 w-4 text-blue-600" />
                    <span class="text-sm font-medium">Active Vendors</span>
                  </div>
                  <UBadge color="info" variant="subtle">{{ metrics.vendorCount }}</UBadge>
                </div>
                
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div class="flex items-center gap-3">
                    <UIcon name="i-lucide-layers" class="h-4 w-4 text-green-600" />
                    <span class="text-sm font-medium">Expense Categories</span>
                  </div>
                  <UBadge color="success" variant="subtle">{{ metrics.categoryCount }}</UBadge>
                </div>

                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div class="flex items-center gap-3">
                    <UIcon name="i-lucide-percent" class="h-4 w-4 text-purple-600" />
                    <span class="text-sm font-medium">Top Category Share</span>
                  </div>
                  <UBadge color="secondary" variant="subtle">
                    {{ metrics.topCategory && metrics.totalSpend > 0
                      ? `${((metrics.topCategory.amount / metrics.totalSpend) * 100).toFixed(1)}%`
                      : '0%'
                    }}
                  </UBadge>
                </div>
              </div>
            </UCard>

            <!-- Expense Trends -->
            <UCard class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <template #header>
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-indigo-50 dark:bg-indigo-900/50 rounded-lg">
                    <UIcon name="i-lucide-trending-up" class="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold">Expense Trends</h3>
                    <p class="text-sm text-muted">Distribution patterns</p>
                  </div>
                </div>
              </template>
              
              <div class="space-y-6">
                <!-- Category Distribution Mini Chart -->
                <div>
                  <h4 class="text-sm font-semibold mb-3 text-muted">Top 5 Categories</h4>
                  <div class="space-y-2">
                    <div
                      v-for="(category, index) in (data?.categories || []).slice(0, 5)"
                      :key="category.name"
                      class="relative"
                    >
                      <div class="flex items-center justify-between text-sm mb-1">
                        <span class="truncate" :title="category.name">
                          {{ category.name.length > 20 ? category.name.substring(0, 20) + '...' : category.name }}
                        </span>
                        <span class="text-xs text-muted">
                          {{ metrics.totalSpend > 0 ? ((category.amount / metrics.totalSpend) * 100).toFixed(1) : 0 }}%
                        </span>
                      </div>
                      <div class="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all duration-500"
                          :style="{ 
                            backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#ef4444'][index % 5],
                            width: metrics.totalSpend > 0 
                              ? `${(category.amount / metrics.totalSpend) * 100}%` 
                              : '0%' 
                          }"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Vendor Distribution -->
                <div class="border-t border-gray-100 dark:border-gray-800 pt-4">
                  <h4 class="text-sm font-semibold mb-3 text-muted">Top 5 Vendors</h4>
                  <div class="space-y-2">
                    <div
                      v-for="(vendor, index) in (data?.vendors || []).slice(0, 5)"
                      :key="vendor.name"
                      class="flex items-center gap-2 text-sm"
                    >
                      <div 
                        class="w-3 h-3 rounded-full flex-shrink-0"
                        :class="`bg-${['indigo', 'cyan', 'pink', 'yellow', 'emerald'][index % 5]}-500`"
                      />
                      <span class="truncate flex-1" :title="vendor.name">{{ vendor.name }}</span>
                      <span class="font-medium text-green-600 text-xs">{{ formatCurrency(vendor.amount) }}</span>
                    </div>
                  </div>
                </div>

                <!-- Quick Actions -->
                <div class="border-t border-gray-100 dark:border-gray-800 pt-4">
                  <h4 class="text-sm font-semibold mb-3 text-muted">Quick Actions</h4>
                  <div class="grid grid-cols-2 gap-2">
                    <UButton size="sm" variant="ghost" class="justify-start text-xs" @click="prevMonth">
                      <UIcon name="i-lucide-chevron-left" class="h-3 w-3" />
                      Prev Month
                    </UButton>
                    <UButton size="sm" variant="ghost" class="justify-start text-xs" :disabled="isCurrentMonth" @click="nextMonth">
                      <UIcon name="i-lucide-chevron-right" class="h-3 w-3" />
                      Next Month
                    </UButton>
                    <UButton size="sm" variant="ghost" class="justify-start text-xs" @click="exportData('csv')">
                      <UIcon name="i-lucide-download" class="h-3 w-3" />
                      Export CSV
                    </UButton>
                    <UButton size="sm" variant="ghost" class="justify-start text-xs" @click="refresh()">
                      <UIcon name="i-lucide-refresh-cw" class="h-3 w-3" />
                      Refresh
                    </UButton>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Subscriptions -->
            <UCard v-if="expensesData?.subscriptions?.items?.length" class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-violet-50 dark:bg-violet-900/50 rounded-lg">
                      <UIcon name="i-lucide-repeat" class="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <h3 class="text-lg font-semibold">Subscriptions</h3>
                      <p class="text-sm text-muted">Recurring vendors</p>
                    </div>
                  </div>
                  <UBadge color="secondary" variant="subtle">
                    {{ expensesData.subscriptions.items.length }} recurring
                  </UBadge>
                </div>
              </template>

              <div class="space-y-2">
                <div
                  v-for="sub in expensesData.subscriptions.items.slice(0, 8)"
                  :key="sub.vendor"
                  class="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{{ sub.vendor }}</p>
                    <div class="flex items-center gap-2 mt-0.5">
                      <UBadge v-if="sub.department" color="info" variant="subtle" size="xs">{{ sub.department }}</UBadge>
                      <span class="text-[10px] text-muted capitalize">{{ sub.frequency }}</span>
                    </div>
                  </div>
                  <span class="text-sm font-bold tabular-nums shrink-0">{{ formatCurrency(sub.amount) }}</span>
                </div>

                <div v-if="expensesData.subscriptions.total > 0" class="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between">
                  <span class="text-sm font-medium text-muted">Total Recurring</span>
                  <span class="text-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums">{{ formatCurrency(expensesData.subscriptions.total) }}</span>
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Transaction Drill-Down Table -->
        <div v-if="(expensesData?.transactions || []).length">
          <UCard class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <UIcon name="i-lucide-list" class="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold">Recent Transactions</h3>
                    <p class="text-sm text-muted">Top {{ sortedTransactions.length }} expense items</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UInput
                    v-model="txSearch"
                    icon="i-lucide-search"
                    placeholder="Search vendor, category..."
                    size="xs"
                    class="w-48"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="toggleTxSort('date')"
                    :class="txSortField === 'date' ? 'font-bold' : ''"
                  >
                    Date {{ txSortField === 'date' ? (txSortDir === 'asc' ? '↑' : '↓') : '' }}
                  </UButton>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="toggleTxSort('amount')"
                    :class="txSortField === 'amount' ? 'font-bold' : ''"
                  >
                    Amount {{ txSortField === 'amount' ? (txSortDir === 'asc' ? '↑' : '↓') : '' }}
                  </UButton>
                </div>
              </div>
            </template>

            <UTable :data="paginatedTransactions" :columns="transactionColumns" />

            <template v-if="txTotalPages > 1" #footer>
              <div class="flex items-center justify-between px-2">
                <span class="text-xs text-muted">
                  Page {{ txPage }} of {{ txTotalPages }}
                </span>
                <div class="flex items-center gap-1">
                  <UButton
                    icon="i-lucide-chevron-left"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :disabled="txPage <= 1"
                    @click="txPage--"
                  />
                  <UButton
                    icon="i-lucide-chevron-right"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :disabled="txPage >= txTotalPages"
                    @click="txPage++"
                  />
                </div>
              </div>
            </template>
          </UCard>
        </div>

        <!-- AI-Powered Insights - Full Width at Bottom -->
        <div class="mt-8">
          <ClientOnly>
            <ExpensesAIInsights />
            <template #fallback>
              <UCard class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
                <div class="flex items-center justify-center h-32">
                  <div class="text-center">
                    <USkeleton class="h-4 w-32 mx-auto mb-2" />
                    <USkeleton class="h-3 w-24 mx-auto" />
                  </div>
                </div>
              </UCard>
            </template>
          </ClientOnly>
        </div>
        </div>

        <!-- End Dashboard Content -->
      </div>
    </template>
  </UDashboardPanel>
</template>
