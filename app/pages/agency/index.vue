<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Agency Dashboard'
})

// Agency KPIs
const { data: kpis, pending: kpisLoading } = await useFetch('/api/agency/kpis')

// Active projects summary
const { data: projectsSummary } = await useFetch('/api/agency/projects/summary')

// Recent time entries
const { data: recentTime } = await useFetch('/api/agency/time/recent')

// Format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

// Format percentage
const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`
}

// KPI cards configuration
const kpiCards = computed(() => [
  {
    title: 'Monthly Revenue',
    value: formatCurrency(kpis.value?.totalRevenue || 0),
    icon: 'i-lucide-dollar-sign',
    change: kpis.value?.revenueChange || 0,
    color: 'text-emerald-500'
  },
  {
    title: 'Gross Margin',
    value: formatPercent(kpis.value?.grossMargin || 0),
    icon: 'i-lucide-trending-up',
    change: kpis.value?.marginChange || 0,
    color: kpis.value?.grossMargin >= 30 ? 'text-emerald-500' : 'text-amber-500'
  },
  {
    title: 'Utilization Rate',
    value: formatPercent(kpis.value?.avgUtilizationRate || 0),
    icon: 'i-lucide-clock',
    change: kpis.value?.utilizationChange || 0,
    color: kpis.value?.avgUtilizationRate >= 70 ? 'text-emerald-500' : 'text-amber-500'
  },
  {
    title: 'Active Projects',
    value: kpis.value?.activeProjects || 0,
    icon: 'i-lucide-folder-kanban',
    change: 0,
    color: 'text-blue-500'
  },
  {
    title: 'MRR (Retainers)',
    value: formatCurrency(kpis.value?.mrr || 0),
    icon: 'i-lucide-repeat',
    change: kpis.value?.mrrChange || 0,
    color: 'text-violet-500'
  },
  {
    title: 'Outstanding AR',
    value: formatCurrency(kpis.value?.outstandingAR || 0),
    icon: 'i-lucide-receipt',
    change: 0,
    color: kpis.value?.outstandingAR > 50000 ? 'text-red-500' : 'text-gray-500'
  }
])

// Project status distribution
const projectStatusData = computed(() => {
  if (!projectsSummary.value) return []
  return [
    { name: 'Active', value: projectsSummary.value.active || 0, color: '#10b981' },
    { name: 'On Hold', value: projectsSummary.value.onHold || 0, color: '#f59e0b' },
    { name: 'Completed', value: projectsSummary.value.completed || 0, color: '#6366f1' },
    { name: 'Draft', value: projectsSummary.value.draft || 0, color: '#9ca3af' }
  ]
})
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Agency Dashboard">
        <template #right>
          <UButton
            label="New Project"
            icon="i-lucide-plus"
            color="primary"
            to="/agency/projects/new"
          />
          <UButton
            label="Log Time"
            icon="i-lucide-clock"
            color="neutral"
            variant="outline"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- KPI Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <UCard
            v-for="kpi in kpiCards"
            :key="kpi.title"
            class="hover:shadow-lg transition-shadow"
          >
            <div class="flex items-start justify-between">
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ kpi.title }}
                </p>
                <p class="text-2xl font-bold mt-1" :class="kpi.color">
                  {{ kpi.value }}
                </p>
              </div>
              <div
                class="p-2 rounded-lg bg-gray-100 dark:bg-gray-800"
                :class="kpi.color"
              >
                <UIcon :name="kpi.icon" class="w-5 h-5" />
              </div>
            </div>
            <div
              v-if="kpi.change !== 0"
              class="mt-2 text-sm"
              :class="kpi.change > 0 ? 'text-emerald-500' : 'text-red-500'"
            >
              <UIcon
                :name="kpi.change > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
                class="w-4 h-4 inline mr-1"
              />
              {{ Math.abs(kpi.change).toFixed(1) }}% vs last month
            </div>
          </UCard>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Project Profitability -->
          <UCard class="lg:col-span-2">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold">Project Profitability</h3>
                <UButton
                  label="View All"
                  variant="link"
                  to="/agency/projects"
                />
              </div>
            </template>

            <UTable
              :columns="[
                { key: 'name', label: 'Project' },
                { key: 'client', label: 'Client' },
                { key: 'budget', label: 'Budget' },
                { key: 'spent', label: 'Spent' },
                { key: 'margin', label: 'Margin' },
                { key: 'status', label: 'Status' }
              ]"
              :rows="projectsSummary?.topProjects || []"
            >
              <template #budget-data="{ row }">
                {{ formatCurrency(row.budget) }}
              </template>
              <template #spent-data="{ row }">
                <span :class="row.spent > row.budget ? 'text-red-500' : ''">
                  {{ formatCurrency(row.spent) }}
                </span>
              </template>
              <template #margin-data="{ row }">
                <UBadge
                  :color="row.margin >= 30 ? 'success' : row.margin >= 15 ? 'warning' : 'error'"
                >
                  {{ formatPercent(row.margin) }}
                </UBadge>
              </template>
              <template #status-data="{ row }">
                <UBadge
                  :color="row.status === 'active' ? 'success' : row.status === 'on_hold' ? 'warning' : 'neutral'"
                  variant="subtle"
                >
                  {{ row.status }}
                </UBadge>
              </template>
            </UTable>
          </UCard>

          <!-- Team Utilization -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold">Team Utilization</h3>
                <UBadge color="neutral" variant="subtle">
                  This Month
                </UBadge>
              </div>
            </template>

            <div class="space-y-4">
              <div
                v-for="member in kpis?.teamUtilization || []"
                :key="member.name"
                class="space-y-1"
              >
                <div class="flex justify-between text-sm">
                  <span>{{ member.name }}</span>
                  <span
                    :class="member.rate >= member.target ? 'text-emerald-500' : 'text-amber-500'"
                  >
                    {{ formatPercent(member.rate) }}
                  </span>
                </div>
                <UProgress
                  :value="member.rate"
                  :max="100"
                  :color="member.rate >= member.target ? 'success' : 'warning'"
                  size="sm"
                />
              </div>
            </div>

            <template #footer>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Target: 75% billable utilization
              </div>
            </template>
          </UCard>
        </div>

        <!-- Recent Activity & Quick Actions -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <!-- Recent Time Entries -->
          <UCard>
            <template #header>
              <h3 class="text-lg font-semibold">Recent Time Entries</h3>
            </template>

            <div class="space-y-3">
              <div
                v-for="entry in recentTime?.entries || []"
                :key="entry.id"
                class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div>
                  <p class="font-medium">{{ entry.project }}</p>
                  <p class="text-sm text-gray-500">
                    {{ entry.user }} - {{ entry.description }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="font-semibold">{{ entry.hours }}h</p>
                  <p class="text-sm text-gray-500">
                    {{ format(new Date(entry.date), 'MMM d') }}
                  </p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Budget Alerts -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-alert-triangle" class="text-amber-500" />
                <h3 class="text-lg font-semibold">Budget Alerts</h3>
              </div>
            </template>

            <div class="space-y-3">
              <div
                v-for="alert in kpis?.budgetAlerts || []"
                :key="alert.project"
                class="p-3 rounded-lg border-l-4"
                :class="{
                  'border-red-500 bg-red-50 dark:bg-red-900/20': alert.severity === 'critical',
                  'border-amber-500 bg-amber-50 dark:bg-amber-900/20': alert.severity === 'warning'
                }"
              >
                <div class="flex justify-between">
                  <p class="font-medium">{{ alert.project }}</p>
                  <UBadge
                    :color="alert.severity === 'critical' ? 'error' : 'warning'"
                    size="xs"
                  >
                    {{ alert.percentUsed }}% used
                  </UBadge>
                </div>
                <p class="text-sm mt-1">{{ alert.message }}</p>
              </div>

              <div
                v-if="!kpis?.budgetAlerts?.length"
                class="text-center py-4 text-gray-500"
              >
                <UIcon name="i-lucide-check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                <p>All projects within budget</p>
              </div>
            </div>
          </UCard>
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>
