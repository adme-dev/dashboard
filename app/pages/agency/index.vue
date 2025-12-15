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
const kpiCards = computed(() => {
  const kpisData = kpis.value as any
  const grossMargin = kpisData?.grossMargin ?? 0
  const avgUtilizationRate = kpisData?.avgUtilizationRate ?? 0
  const outstandingAR = kpisData?.outstandingAR ?? 0

  return [
    {
      title: 'Monthly Revenue',
      value: formatCurrency(kpisData?.totalRevenue || 0),
      icon: 'i-lucide-dollar-sign',
      change: kpisData?.revenueChange || 0,
      color: 'text-emerald-500'
    },
    {
      title: 'Gross Margin',
      value: formatPercent(grossMargin),
      icon: 'i-lucide-trending-up',
      change: kpisData?.marginChange || 0,
      color: grossMargin >= 30 ? 'text-emerald-500' : 'text-amber-500'
    },
    {
      title: 'Utilization Rate',
      value: formatPercent(avgUtilizationRate),
      icon: 'i-lucide-clock',
      change: kpisData?.utilizationChange || 0,
      color: avgUtilizationRate >= 70 ? 'text-emerald-500' : 'text-amber-500'
    },
    {
      title: 'Active Projects',
      value: kpisData?.activeProjects || 0,
      icon: 'i-lucide-folder-kanban',
      change: 0,
      color: 'text-blue-500'
    },
    {
      title: 'MRR (Retainers)',
      value: formatCurrency(kpisData?.mrr || 0),
      icon: 'i-lucide-repeat',
      change: kpisData?.mrrChange || 0,
      color: 'text-violet-500'
    },
    {
      title: 'Outstanding AR',
      value: formatCurrency(outstandingAR),
      icon: 'i-lucide-receipt',
      change: 0,
      color: outstandingAR > 50000 ? 'text-red-500' : 'text-gray-500'
    }
  ]
})

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
                { accessorKey: 'name', header: 'Project' },
                { accessorKey: 'client', header: 'Client' },
                { accessorKey: 'budget', header: 'Budget' },
                { accessorKey: 'spent', header: 'Spent' },
                { accessorKey: 'margin', header: 'Margin' },
                { accessorKey: 'status', header: 'Status' }
              ] as any"
              :data="(projectsSummary as any)?.topProjects || []"
            >
              <template #budget-cell="{ row }">
                {{ formatCurrency((row.original as any).budget) }}
              </template>
              <template #spent-cell="{ row }">
                <span :class="(row.original as any).spent > (row.original as any).budget ? 'text-red-500' : ''">
                  {{ formatCurrency((row.original as any).spent) }}
                </span>
              </template>
              <template #margin-cell="{ row }">
                <UBadge
                  :color="(row.original as any).margin >= 30 ? 'success' : (row.original as any).margin >= 15 ? 'warning' : 'error'"
                >
                  {{ formatPercent((row.original as any).margin) }}
                </UBadge>
              </template>
              <template #status-cell="{ row }">
                <UBadge
                  :color="(row.original as any).status === 'active' ? 'success' : (row.original as any).status === 'on_hold' ? 'warning' : 'neutral'"
                  variant="subtle"
                >
                  {{ (row.original as any).status }}
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
                v-for="member in ((kpis as any)?.teamUtilization || [])"
                :key="(member as any).name"
                class="space-y-1"
              >
                <div class="flex justify-between text-sm">
                  <span>{{ (member as any).name }}</span>
                  <span
                    :class="(member as any).rate >= (member as any).target ? 'text-emerald-500' : 'text-amber-500'"
                  >
                    {{ formatPercent((member as any).rate) }}
                  </span>
                </div>
                <UProgress
                  :value="(member as any).rate"
                  :max="100"
                  :color="(member as any).rate >= (member as any).target ? 'success' : 'warning'"
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
                v-for="entry in ((recentTime as any)?.entries || [])"
                :key="(entry as any).id"
                class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div>
                  <p class="font-medium">{{ (entry as any).project }}</p>
                  <p class="text-sm text-gray-500">
                    {{ (entry as any).user }} - {{ (entry as any).description }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="font-semibold">{{ (entry as any).hours }}h</p>
                  <p class="text-sm text-gray-500">
                    {{ format(new Date((entry as any).date), 'MMM d') }}
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
                v-for="alert in ((kpis as any)?.budgetAlerts || [])"
                :key="(alert as any).project"
                class="p-3 rounded-lg border-l-4"
                :class="{
                  'border-red-500 bg-red-50 dark:bg-red-900/20': (alert as any).severity === 'critical',
                  'border-amber-500 bg-amber-50 dark:bg-amber-900/20': (alert as any).severity === 'warning'
                }"
              >
                <div class="flex justify-between">
                  <p class="font-medium">{{ (alert as any).project }}</p>
                  <UBadge
                    :color="(alert as any).severity === 'critical' ? 'error' : 'warning'"
                    size="xs"
                  >
                    {{ (alert as any).percentUsed }}% used
                  </UBadge>
                </div>
                <p class="text-sm mt-1">{{ (alert as any).message }}</p>
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
