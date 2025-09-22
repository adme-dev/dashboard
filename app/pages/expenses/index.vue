<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const AsyncCategoryDonut = defineAsyncComponent(() => import('~/components/expenses/CategoryDonut.client.vue'))
const AsyncVendorContributionBars = defineAsyncComponent(() => import('~/components/expenses/VendorContributionBars.client.vue'))
const AsyncCategoryTreemap = defineAsyncComponent(() => import('~/components/expenses/CategoryTreemap.client.vue'))

// Check if connected to Xero - required for real data
const { data: statusData, refresh: refreshStatus } = await useFetch('/api/xero/status')
const isConnected = computed(() => statusData.value?.connected || false)

// Only fetch data if connected to Xero
const { data, pending, error, refresh } = await useFetch('/api/xero/expenses', {
  lazy: true
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
  if (!from || !to) return 90
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
  const from = expensesData.value?.range?.from
  const to = expensesData.value?.range?.to
  if (!from || !to) {
    return 'Trailing 90 days'
  }
  return `Last ${daySpan.value} days (${from} → ${to})`
})

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
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
      color: 'green'
    })
  } catch (error) {
    console.error('Export failed:', error)
    const toast = useToast()
    toast.add({
      title: 'Export Failed',
      description: 'Unable to export expense data',
      icon: 'i-lucide-alert-circle',
      color: 'red'
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
          <span class="text-sm text-muted">{{ rangeDescription }}</span>
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
                color="red" 
                size="lg"
                @click="navigateTo('/api/xero/login')"
              >
                <UIcon name="i-lucide-link" class="h-5 w-5 mr-2" />
                Connect to Xero
              </UButton>
              <UButton 
                color="gray" 
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
                Over {{ daySpan }} days
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
                  <UBadge color="blue" variant="subtle">{{ metrics.vendorCount }}</UBadge>
                </div>
                
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div class="flex items-center gap-3">
                    <UIcon name="i-lucide-layers" class="h-4 w-4 text-green-600" />
                    <span class="text-sm font-medium">Expense Categories</span>
                  </div>
                  <UBadge color="green" variant="subtle">{{ metrics.categoryCount }}</UBadge>
                </div>

                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div class="flex items-center gap-3">
                    <UIcon name="i-lucide-percent" class="h-4 w-4 text-purple-600" />
                    <span class="text-sm font-medium">Top Category Share</span>
                  </div>
                  <UBadge color="purple" variant="subtle">
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
                    <UButton size="sm" variant="ghost" class="justify-start text-xs">
                      <UIcon name="i-lucide-filter" class="h-3 w-3" />
                      Filter
                    </UButton>
                    <UButton size="sm" variant="ghost" class="justify-start text-xs">
                      <UIcon name="i-lucide-search" class="h-3 w-3" />
                      Search
                    </UButton>
                    <UButton size="sm" variant="ghost" class="justify-start text-xs">
                      <UIcon name="i-lucide-calendar" class="h-3 w-3" />
                      Period
                    </UButton>
                    <UButton size="sm" variant="ghost" class="justify-start text-xs">
                      <UIcon name="i-lucide-share" class="h-3 w-3" />
                      Export
                    </UButton>
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>
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
        
        <!-- End Dashboard Content -->
      </div>
    </template>
  </UDashboardPanel>
</template>
