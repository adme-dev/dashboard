<script setup lang="ts">
const props = defineProps<{
  departmentId: string
}>()

// Fetch department dashboard data
const { data: dashboardData, pending: loading } = await useFetch(
  () => `/api/agency/dashboard/department/${props.departmentId}`
)

const dashboard = computed(() => dashboardData.value || { stats: {} as Record<string, any>, statusBreakdown: [] as any[] })

// Calculate percentages for status breakdown
const statusTotal = computed(() => {
  return dashboard.value.statusBreakdown?.reduce((sum: number, s: any) => sum + s.count, 0) || 0
})

const getStatusPercentage = (count: number) => {
  if (statusTotal.value === 0) return 0
  return Math.round((count / statusTotal.value) * 100)
}

// Format large numbers
const formatNumber = (num: number) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

// Stats configuration
const statsConfig = [
  {
    key: 'totalTasks',
    label: 'Total Tasks',
    icon: 'i-lucide-list-checks',
    color: 'text-blue-500',
    bg: 'bg-blue-100 dark:bg-blue-900/20'
  },
  {
    key: 'activeTasks',
    label: 'Active',
    icon: 'i-lucide-play-circle',
    color: 'text-emerald-500',
    bg: 'bg-emerald-100 dark:bg-emerald-900/20'
  },
  {
    key: 'completedThisWeek',
    label: 'Done This Week',
    icon: 'i-lucide-check-circle-2',
    color: 'text-purple-500',
    bg: 'bg-purple-100 dark:bg-purple-900/20'
  },
  {
    key: 'overdueTasks',
    label: 'Overdue',
    icon: 'i-lucide-alert-triangle',
    color: 'text-red-500',
    bg: 'bg-red-100 dark:bg-red-900/20'
  }
]
</script>

<template>
  <div class="space-y-6">
    <!-- Stats Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <template v-if="loading">
        <UCard v-for="i in 4" :key="i">
          <div class="space-y-2">
            <USkeleton class="h-4 w-20" />
            <USkeleton class="h-8 w-16" />
          </div>
        </UCard>
      </template>

      <template v-else>
        <UCard v-for="stat in statsConfig" :key="stat.key">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-muted uppercase mb-1">{{ stat.label }}</p>
              <p class="text-2xl font-bold text-highlighted">
                {{ formatNumber((dashboard.stats as any)?.[stat.key] || 0) }}
              </p>
            </div>
            <div :class="[stat.bg, 'p-2 rounded-lg']">
              <UIcon :name="stat.icon" :class="stat.color" class="h-5 w-5" />
            </div>
          </div>
        </UCard>
      </template>
    </div>

    <!-- Status Breakdown -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-pie-chart" class="h-5 w-5 text-muted" />
          <h3 class="font-semibold">Status Distribution</h3>
        </div>
      </template>

      <template v-if="loading">
        <div class="space-y-3">
          <USkeleton v-for="i in 5" :key="i" class="h-8 w-full" />
        </div>
      </template>

      <template v-else>
        <div class="space-y-3">
          <div
            v-for="status in dashboard.statusBreakdown"
            :key="status.statusId"
            class="group"
          >
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-2">
                <div
                  class="w-3 h-3 rounded-full"
                  :style="{ backgroundColor: status.statusColor }"
                />
                <span class="text-sm font-medium">{{ status.statusName }}</span>
              </div>
              <span class="text-sm text-muted">
                {{ status.count }} ({{ getStatusPercentage(status.count) }}%)
              </span>
            </div>
            <div class="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :style="{
                  width: `${getStatusPercentage(status.count)}%`,
                  backgroundColor: status.statusColor
                }"
              />
            </div>
          </div>

          <div v-if="!dashboard.statusBreakdown?.length" class="text-center py-4">
            <p class="text-sm text-muted">No tasks in this department</p>
          </div>
        </div>
      </template>
    </UCard>

    <!-- Additional Metrics -->
    <div class="grid grid-cols-2 gap-4">
      <!-- Completion Rate -->
      <UCard>
        <div class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/20 mb-3">
            <span class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {{ dashboard.stats?.totalTasks ? Math.round((dashboard.stats.completedThisWeek / dashboard.stats.totalTasks) * 100) : 0 }}%
            </span>
          </div>
          <p class="text-sm font-medium text-highlighted">Completion Rate</p>
          <p class="text-xs text-muted">Last 30 days</p>
        </div>
      </UCard>

      <!-- Average Days to Complete -->
      <UCard>
        <div class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 mb-3">
            <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {{ dashboard.stats?.avgCompletionHours ? Math.round(dashboard.stats.avgCompletionHours / 24) : '-' }}
            </span>
          </div>
          <p class="text-sm font-medium text-highlighted">Avg. Days to Complete</p>
          <p class="text-xs text-muted">Per task</p>
        </div>
      </UCard>
    </div>
  </div>
</template>
