<script setup lang="ts">
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

definePageMeta({
  title: 'Utilization Reports',
  middleware: ['auth']
})

// Date range
const dateRange = ref<'month' | 'quarter' | 'year'>('month')
const selectedMonth = ref(new Date())

const startDate = computed(() => {
  if (dateRange.value === 'month') {
    return format(startOfMonth(selectedMonth.value), 'yyyy-MM-dd')
  } else if (dateRange.value === 'quarter') {
    const quarter = Math.floor(selectedMonth.value.getMonth() / 3)
    return format(new Date(selectedMonth.value.getFullYear(), quarter * 3, 1), 'yyyy-MM-dd')
  } else {
    return format(new Date(selectedMonth.value.getFullYear(), 0, 1), 'yyyy-MM-dd')
  }
})

const endDate = computed(() => {
  if (dateRange.value === 'month') {
    return format(endOfMonth(selectedMonth.value), 'yyyy-MM-dd')
  } else if (dateRange.value === 'quarter') {
    const quarter = Math.floor(selectedMonth.value.getMonth() / 3)
    return format(endOfMonth(new Date(selectedMonth.value.getFullYear(), quarter * 3 + 2, 1)), 'yyyy-MM-dd')
  } else {
    return format(new Date(selectedMonth.value.getFullYear(), 11, 31), 'yyyy-MM-dd')
  }
})

// Fetch utilization data
const { data: utilizationData, pending, refresh } = await useFetch('/api/agency/time/utilization', {
  query: {
    startDate,
    endDate
  }
})

const summary = computed(() => utilizationData.value?.summary || {
  totalHours: 0,
  billableHours: 0,
  nonBillableHours: 0,
  overallUtilization: 0,
  totalValue: 0,
  billableValue: 0,
  activeUsers: 0,
  projectsWorked: 0,
  targetUtilization: 75,
  utilizationVsTarget: 0
})

const byUser = computed(() => (utilizationData.value?.byUser || []) as any[])
const topProjects = computed(() => (utilizationData.value?.topProjects || []) as any[])
const dailyBreakdown = computed(() => (utilizationData.value?.dailyBreakdown || []) as any[])

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(value)
}

const getUtilizationColor = (rate: number, target: number): 'success' | 'warning' | 'error' | 'neutral' => {
  const diff = rate - target
  if (diff >= 0) return 'success'
  if (diff >= -10) return 'warning'
  return 'error'
}

const getUtilizationBarWidth = (rate: number) => {
  return `${Math.min(rate, 100)}%`
}

// Table columns
const userColumns: any[] = [
  { key: 'userName', label: 'Team Member' },
  { key: 'totalHours', label: 'Total Hours' },
  { key: 'billableHours', label: 'Billable' },
  { key: 'utilizationRate', label: 'Utilization' },
  { key: 'billableValue', label: 'Value' },
  { key: 'projectsWorked', label: 'Projects' }
]

const projectColumns: any[] = [
  { key: 'projectName', label: 'Project' },
  { key: 'clientName', label: 'Client' },
  { key: 'totalHours', label: 'Hours' },
  { key: 'totalValue', label: 'Value' },
  { key: 'teamMembers', label: 'Team' }
]

// Navigation
const prevPeriod = () => {
  selectedMonth.value = subMonths(selectedMonth.value, dateRange.value === 'month' ? 1 : dateRange.value === 'quarter' ? 3 : 12)
}

const nextPeriod = () => {
  const months = dateRange.value === 'month' ? 1 : dateRange.value === 'quarter' ? 3 : 12
  selectedMonth.value = new Date(selectedMonth.value.getFullYear(), selectedMonth.value.getMonth() + months, 1)
}

const periodLabel = computed(() => {
  if (dateRange.value === 'month') {
    return format(selectedMonth.value, 'MMMM yyyy')
  } else if (dateRange.value === 'quarter') {
    const quarter = Math.floor(selectedMonth.value.getMonth() / 3) + 1
    return `Q${quarter} ${selectedMonth.value.getFullYear()}`
  } else {
    return selectedMonth.value.getFullYear().toString()
  }
})
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0">
    <UDashboardPanel :ui="{ root: 'max-h-svh' }">
      <UDashboardNavbar title="Utilization Reports">
        <template #right>
          <div class="inline-flex rounded-md shadow-xs">
            <UButton
              :variant="dateRange === 'month' ? 'solid' : 'outline'"
              label="Month"
              class="rounded-r-none"
              @click="dateRange = 'month'"
            />
            <UButton
              :variant="dateRange === 'quarter' ? 'solid' : 'outline'"
              label="Quarter"
              class="rounded-none -ml-px"
              @click="dateRange = 'quarter'"
            />
            <UButton
              :variant="dateRange === 'year' ? 'solid' : 'outline'"
              label="Year"
              class="rounded-l-none -ml-px"
              @click="dateRange = 'year'"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        <!-- Period Navigation -->
        <div class="flex items-center justify-center gap-4 mb-6">
          <UButton variant="ghost" icon="i-lucide-chevron-left" @click="prevPeriod" />
          <h2 class="text-xl font-semibold min-w-[200px] text-center">{{ periodLabel }}</h2>
          <UButton variant="ghost" icon="i-lucide-chevron-right" @click="nextPeriod" />
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <template v-else>
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Overall Utilization</p>
                <p class="text-3xl font-bold" :class="{
                  'text-emerald-500': summary.overallUtilization >= summary.targetUtilization,
                  'text-amber-500': summary.overallUtilization >= summary.targetUtilization - 10,
                  'text-red-500': summary.overallUtilization < summary.targetUtilization - 10
                }">
                  {{ summary.overallUtilization.toFixed(0) }}%
                </p>
                <p class="text-xs text-gray-400 mt-1">Target: {{ summary.targetUtilization }}%</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Total Hours</p>
                <p class="text-3xl font-bold">{{ summary.totalHours.toFixed(0) }}</p>
                <p class="text-xs text-gray-400 mt-1">{{ summary.billableHours.toFixed(0) }} billable</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Billable Value</p>
                <p class="text-3xl font-bold text-emerald-500">{{ formatCurrency(summary.billableValue) }}</p>
                <p class="text-xs text-gray-400 mt-1">{{ formatCurrency(summary.totalValue) }} total</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Active Team</p>
                <p class="text-3xl font-bold">{{ summary.activeUsers }}</p>
                <p class="text-xs text-gray-400 mt-1">{{ summary.projectsWorked }} projects</p>
              </div>
            </UCard>
          </div>

          <!-- Team Utilization -->
          <UCard class="mb-8">
            <template #header>
              <h3 class="font-semibold">Team Utilization</h3>
            </template>

            <div class="space-y-4">
              <div
                v-for="user in byUser"
                :key="user.userId"
                class="p-4 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div class="flex items-center justify-between mb-2">
                  <div>
                    <p class="font-medium">{{ user.userName }}</p>
                    <p class="text-sm text-gray-500">{{ user.departmentName || 'No department' }}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-semibold" :class="{
                      'text-emerald-500': user.utilizationRate >= user.targetUtilization,
                      'text-amber-500': user.utilizationRate >= user.targetUtilization - 10 && user.utilizationRate < user.targetUtilization,
                      'text-red-500': user.utilizationRate < user.targetUtilization - 10
                    }">
                      {{ user.utilizationRate.toFixed(0) }}%
                    </p>
                    <p class="text-xs text-gray-500">{{ user.billableHours.toFixed(1) }}h / {{ user.totalHours.toFixed(1) }}h</p>
                  </div>
                </div>
                <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="{
                      'bg-emerald-500': user.utilizationRate >= user.targetUtilization,
                      'bg-amber-500': user.utilizationRate >= user.targetUtilization - 10 && user.utilizationRate < user.targetUtilization,
                      'bg-red-500': user.utilizationRate < user.targetUtilization - 10
                    }"
                    :style="{ width: getUtilizationBarWidth(user.utilizationRate) }"
                  />
                </div>
                <div class="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{{ user.projectsWorked }} projects</span>
                  <span>{{ user.daysWorked }} days worked</span>
                  <span>{{ formatCurrency(user.billableValue) }}</span>
                </div>
              </div>

              <p v-if="byUser.length === 0" class="text-center text-gray-500 py-8">
                No time entries for this period
              </p>
            </div>
          </UCard>

          <!-- Top Projects -->
          <UCard v-if="topProjects.length > 0">
            <template #header>
              <h3 class="font-semibold">Top Projects by Hours</h3>
            </template>

            <UTable :data="topProjects" :columns="projectColumns">
              <template #projectName-cell="{ row: r }">
                <span class="font-medium">{{ (r as any).projectName }}</span>
              </template>

              <template #clientName-cell="{ row: r }">
                <span class="text-gray-500">{{ (r as any).clientName }}</span>
              </template>

              <template #totalHours-cell="{ row: r }">
                {{ (r as any).totalHours.toFixed(1) }}h
              </template>

              <template #totalValue-cell="{ row: r }">
                {{ formatCurrency((r as any).totalValue) }}
              </template>

              <template #teamMembers-cell="{ row: r }">
                {{ (r as any).teamMembers }} members
              </template>
            </UTable>
          </UCard>
        </template>

        <!-- Navigation -->
        <div class="flex gap-4 mt-6">
          <UButton
            variant="outline"
            label="Back to Timesheet"
            icon="i-lucide-arrow-left"
            @click="navigateTo('/agency/time')"
          />
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
