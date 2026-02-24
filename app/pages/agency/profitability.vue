<script setup lang="ts">
definePageMeta({
  title: 'Project Profitability',
  middleware: ['auth']
})

const toast = useToast()

// Filters
const statusFilter = ref('all')
const clientFilter = ref<string | null>(null)

// Fetch profitability data
const { data: profitData, pending, refresh } = await useFetch('/api/agency/projects/profitability', {
  query: {
    status: statusFilter,
    clientId: clientFilter
  }
})

// Fetch clients for filter
const { data: clientsData } = await useFetch('/api/agency/clients', {
  query: { limit: 100 }
})

const summary = computed(() => (profitData.value?.summary || {
  totalProjects: 0,
  activeProjects: 0,
  completedProjects: 0,
  totalBudget: 0,
  totalCost: 0,
  totalProfit: 0,
  avgMargin: 0,
  totalHours: 0,
  avgHourlyRate: 0
}) as any)

const projects = computed(() => (profitData.value?.projects || []) as any[])
const byClient = computed(() => (profitData.value?.byClient || []) as any[])
const marginDistribution = computed(() => (profitData.value?.marginDistribution || []) as any[])
const clients = computed(() => ((clientsData.value as any)?.clients || []) as any[])

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`
}

// Status options
const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'On Hold', value: 'on_hold' }
]

// Table columns for projects
const projectColumns: any[] = [
  { key: 'name', label: 'Project' },
  { key: 'clientName', label: 'Client' },
  { key: 'budgetAmount', label: 'Budget' },
  { key: 'totalCost', label: 'Cost' },
  { key: 'grossProfit', label: 'Profit' },
  { key: 'grossMargin', label: 'Margin' },
  { key: 'hoursWorked', label: 'Hours' },
  { key: 'effectiveRate', label: 'Eff. Rate' },
  { key: 'status', label: 'Status' }
]

// Table columns for clients
const clientColumns: any[] = [
  { key: 'name', label: 'Client' },
  { key: 'projectCount', label: 'Projects' },
  { key: 'totalRevenue', label: 'Revenue' },
  { key: 'totalCost', label: 'Cost' },
  { key: 'totalProfit', label: 'Profit' },
  { key: 'avgMargin', label: 'Avg Margin' },
  { key: 'totalHours', label: 'Hours' }
]

// Get margin color
const getMarginColor = (margin: number): string => {
  if (margin < 0) return 'text-red-500'
  if (margin < 20) return 'text-amber-500'
  if (margin < 40) return 'text-yellow-500'
  if (margin < 60) return 'text-emerald-500'
  return 'text-green-500'
}

// Get margin badge color
const getMarginBadgeColor = (margin: number): 'error' | 'warning' | 'success' | 'neutral' => {
  if (margin < 0) return 'error'
  if (margin < 20) return 'warning'
  if (margin < 40) return 'neutral'
  return 'success'
}

// Get status badge color
const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' => {
  switch (status) {
    case 'active': return 'success'
    case 'completed': return 'neutral'
    case 'on_hold': return 'warning'
    case 'cancelled': return 'error'
    default: return 'neutral'
  }
}

// Distribution colors
const getDistributionColor = (range: string): string => {
  switch (range) {
    case 'negative': return 'bg-red-500'
    case 'low': return 'bg-amber-500'
    case 'moderate': return 'bg-yellow-500'
    case 'good': return 'bg-emerald-500'
    case 'excellent': return 'bg-green-500'
    default: return 'bg-gray-500'
  }
}

const getDistributionLabel = (range: string): string => {
  switch (range) {
    case 'negative': return '< 0%'
    case 'low': return '0-20%'
    case 'moderate': return '20-40%'
    case 'good': return '40-60%'
    case 'excellent': return '> 60%'
    default: return range
  }
}

// Sort projects
const sortBy = ref<'grossProfit' | 'grossMargin' | 'budgetAmount'>('grossProfit')
const sortOrder = ref<'asc' | 'desc'>('desc')

const sortedProjects = computed(() => {
  const sorted = [...projects.value]
  sorted.sort((a, b) => {
    const aVal = a[sortBy.value] || 0
    const bVal = b[sortBy.value] || 0
    return sortOrder.value === 'desc' ? bVal - aVal : aVal - bVal
  })
  return sorted
})

// Top/Bottom performers
const topPerformers = computed(() => sortedProjects.value.slice(0, 5))
const bottomPerformers = computed(() => {
  const sorted = [...projects.value].sort((a, b) => (a.grossMargin || 0) - (b.grossMargin || 0))
  return sorted.slice(0, 5)
})
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Project Profitability">
        <template #right>
          <div class="flex items-center gap-4">
            <USelectMenu
              v-model="statusFilter"
              :items="statusOptions"
              placeholder="Status"
              value-key="value"
              class="w-40"
            />
            <USelectMenu
              v-model="clientFilter"
              :items="[{ label: 'All Clients', value: null }, ...clients.map(c => ({ label: c.name, value: c.id }))]"
              placeholder="Client"
              value-key="value"
              class="w-48"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <template v-else>
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Total Revenue</p>
                <p class="text-2xl font-bold text-blue-500">{{ formatCurrency(summary.totalBudget) }}</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Total Cost</p>
                <p class="text-2xl font-bold text-red-500">{{ formatCurrency(summary.totalCost) }}</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Total Profit</p>
                <p class="text-2xl font-bold" :class="summary.totalProfit >= 0 ? 'text-emerald-500' : 'text-red-500'">
                  {{ formatCurrency(summary.totalProfit) }}
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Avg Margin</p>
                <p class="text-2xl font-bold" :class="getMarginColor(summary.avgMargin)">
                  {{ formatPercent(summary.avgMargin) }}
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Avg Hourly Rate</p>
                <p class="text-2xl font-bold text-violet-500">{{ formatCurrency(summary.avgHourlyRate) }}/hr</p>
              </div>
            </UCard>
          </div>

          <!-- Project Stats Row -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <UCard>
              <div class="flex items-center gap-4">
                <div class="p-3 rounded-lg bg-blue-500/10">
                  <UIcon name="i-lucide-folder" class="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p class="text-sm text-gray-500">Total Projects</p>
                  <p class="text-xl font-bold">{{ summary.totalProjects }}</p>
                </div>
              </div>
            </UCard>

            <UCard>
              <div class="flex items-center gap-4">
                <div class="p-3 rounded-lg bg-emerald-500/10">
                  <UIcon name="i-lucide-play-circle" class="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <p class="text-sm text-gray-500">Active Projects</p>
                  <p class="text-xl font-bold">{{ summary.activeProjects }}</p>
                </div>
              </div>
            </UCard>

            <UCard>
              <div class="flex items-center gap-4">
                <div class="p-3 rounded-lg bg-violet-500/10">
                  <UIcon name="i-lucide-clock" class="w-6 h-6 text-violet-500" />
                </div>
                <div>
                  <p class="text-sm text-gray-500">Total Hours</p>
                  <p class="text-xl font-bold">{{ summary.totalHours.toFixed(0) }}h</p>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Margin Distribution & Top/Bottom Performers -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <!-- Margin Distribution -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Margin Distribution</h3>
              </template>
              <div class="space-y-3">
                <div
                  v-for="item in marginDistribution"
                  :key="item.range"
                  class="flex items-center gap-3"
                >
                  <div :class="[getDistributionColor(item.range), 'w-3 h-3 rounded-full']" />
                  <span class="text-sm flex-1">{{ getDistributionLabel(item.range) }}</span>
                  <span class="font-semibold">{{ item.count }}</span>
                </div>
                <div v-if="marginDistribution.length === 0" class="text-center text-gray-500 py-4">
                  No data available
                </div>
              </div>
            </UCard>

            <!-- Top Performers -->
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-trending-up" class="w-5 h-5 text-emerald-500" />
                  <h3 class="font-semibold">Top Performers</h3>
                </div>
              </template>
              <div class="space-y-3">
                <div
                  v-for="(project, idx) in topPerformers"
                  :key="project.id"
                  class="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-gray-400">#{{ idx + 1 }}</span>
                    <div>
                      <p class="text-sm font-medium truncate max-w-[150px]">{{ project.name }}</p>
                      <p class="text-xs text-gray-500">{{ project.clientName }}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-bold text-emerald-500">{{ formatPercent(project.grossMargin) }}</p>
                    <p class="text-xs text-gray-500">{{ formatCurrency(project.grossProfit) }}</p>
                  </div>
                </div>
                <div v-if="topPerformers.length === 0" class="text-center text-gray-500 py-4">
                  No projects found
                </div>
              </div>
            </UCard>

            <!-- Bottom Performers -->
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-trending-down" class="w-5 h-5 text-red-500" />
                  <h3 class="font-semibold">Needs Attention</h3>
                </div>
              </template>
              <div class="space-y-3">
                <div
                  v-for="(project, idx) in bottomPerformers"
                  :key="project.id"
                  class="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-gray-400">#{{ idx + 1 }}</span>
                    <div>
                      <p class="text-sm font-medium truncate max-w-[150px]">{{ project.name }}</p>
                      <p class="text-xs text-gray-500">{{ project.clientName }}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-bold" :class="getMarginColor(project.grossMargin)">
                      {{ formatPercent(project.grossMargin) }}
                    </p>
                    <p class="text-xs text-gray-500">{{ formatCurrency(project.grossProfit) }}</p>
                  </div>
                </div>
                <div v-if="bottomPerformers.length === 0" class="text-center text-gray-500 py-4">
                  No projects found
                </div>
              </div>
            </UCard>
          </div>

          <!-- Profitability by Client -->
          <UCard class="mb-8">
            <template #header>
              <h3 class="font-semibold">Profitability by Client</h3>
            </template>

            <UTable :data="byClient" :columns="clientColumns">
              <template #name-cell="{ row: r }">
                <span class="font-medium">{{ (r as any).name }}</span>
              </template>

              <template #projectCount-cell="{ row: r }">
                {{ (r as any).projectCount }}
              </template>

              <template #totalRevenue-cell="{ row: r }">
                {{ formatCurrency((r as any).totalRevenue) }}
              </template>

              <template #totalCost-cell="{ row: r }">
                {{ formatCurrency((r as any).totalCost) }}
              </template>

              <template #totalProfit-cell="{ row: r }">
                <span :class="(r as any).totalProfit >= 0 ? 'text-emerald-500' : 'text-red-500'">
                  {{ formatCurrency((r as any).totalProfit) }}
                </span>
              </template>

              <template #avgMargin-cell="{ row: r }">
                <UBadge :color="getMarginBadgeColor((r as any).avgMargin)" variant="subtle">
                  {{ formatPercent((r as any).avgMargin) }}
                </UBadge>
              </template>

              <template #totalHours-cell="{ row: r }">
                {{ (r as any).totalHours.toFixed(0) }}h
              </template>
            </UTable>

            <div v-if="byClient.length === 0" class="text-center text-gray-500 py-8">
              No client data available
            </div>
          </UCard>

          <!-- All Projects Table -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">All Projects</h3>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-500">Sort by:</span>
                  <USelectMenu
                    v-model="sortBy"
                    :items="[
                      { label: 'Profit', value: 'grossProfit' },
                      { label: 'Margin', value: 'grossMargin' },
                      { label: 'Budget', value: 'budgetAmount' }
                    ]"
                    value-key="value"
                    class="w-32"
                  />
                  <UButton
                    variant="ghost"
                    :icon="sortOrder === 'desc' ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up'"
                    @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
                  />
                </div>
              </div>
            </template>

            <UTable :data="sortedProjects" :columns="projectColumns">
              <template #name-cell="{ row: r }">
                <NuxtLink :to="`/agency/projects/${(r as any).id}`" class="font-medium hover:text-primary-500">
                  {{ (r as any).name }}
                </NuxtLink>
              </template>

              <template #clientName-cell="{ row: r }">
                <span class="text-gray-500">{{ (r as any).clientName }}</span>
              </template>

              <template #budgetAmount-cell="{ row: r }">
                {{ formatCurrency((r as any).budgetAmount) }}
              </template>

              <template #totalCost-cell="{ row: r }">
                {{ formatCurrency((r as any).totalCost) }}
              </template>

              <template #grossProfit-cell="{ row: r }">
                <span :class="(r as any).grossProfit >= 0 ? 'text-emerald-500' : 'text-red-500'">
                  {{ formatCurrency((r as any).grossProfit) }}
                </span>
              </template>

              <template #grossMargin-cell="{ row: r }">
                <UBadge :color="getMarginBadgeColor((r as any).grossMargin)" variant="subtle">
                  {{ formatPercent((r as any).grossMargin) }}
                </UBadge>
              </template>

              <template #hoursWorked-cell="{ row: r }">
                {{ (r as any).hoursWorked.toFixed(1) }}h
              </template>

              <template #effectiveRate-cell="{ row: r }">
                {{ formatCurrency((r as any).effectiveRate) }}/hr
              </template>

              <template #status-cell="{ row: r }">
                <UBadge :color="getStatusColor((r as any).status)" variant="subtle">
                  {{ (r as any).status }}
                </UBadge>
              </template>
            </UTable>

            <div v-if="sortedProjects.length === 0" class="text-center text-gray-500 py-8">
              No projects found
            </div>
          </UCard>

          <!-- Navigation -->
          <div class="flex gap-4 mt-6">
            <UButton
              variant="outline"
              label="Projects"
              icon="i-lucide-folder"
              @click="navigateTo('/agency/projects')"
            />
            <UButton
              variant="outline"
              label="Time Reports"
              icon="i-lucide-clock"
              @click="navigateTo('/agency/time/reports')"
            />
          </div>
        </template>
      </div>
    </UDashboardPanel>
  </div>
</template>
