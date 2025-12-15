<script setup lang="ts">
import { format, addWeeks, startOfWeek } from 'date-fns'

definePageMeta({
  title: 'Resource Planning',
  middleware: ['auth']
})

// Date range (default 4 weeks from current week)
const weeksAhead = ref(4)
const startDate = computed(() => {
  const now = new Date()
  return format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
})
const endDate = computed(() => {
  const now = new Date()
  return format(addWeeks(startOfWeek(now, { weekStartsOn: 1 }), weeksAhead.value), 'yyyy-MM-dd')
})

// Fetch capacity data
const { data: capacityData, pending, refresh } = await useFetch('/api/agency/capacity', {
  query: {
    startDate,
    endDate
  }
})

const summary = computed(() => (capacityData.value?.summary || {
  totalCapacity: 0,
  totalBooked: 0,
  totalLogged: 0,
  availableHours: 0,
  utilizationPercent: 0,
  teamSize: 0,
  overallocatedCount: 0,
  underutilizedCount: 0
}) as any)

const teamMembers = computed(() => (capacityData.value?.teamMembers || []) as any[])
const projectAllocations = computed(() => (capacityData.value?.projectAllocations || []) as any[])
const weeklyBreakdown = computed(() => (capacityData.value?.weeklyBreakdown || []) as any[])
const alerts = computed(() => (capacityData.value?.alerts || { overallocated: [], underutilized: [] }) as any)

// Format helpers
const formatHours = (hours: number) => {
  return `${hours.toFixed(0)}h`
}

const formatPercent = (value: number) => {
  return `${value.toFixed(0)}%`
}

const formatWeek = (date: string) => {
  return format(new Date(date), 'MMM d')
}

// Status colors
const getStatusColor = (status: string): 'error' | 'warning' | 'success' | 'neutral' => {
  switch (status) {
    case 'overallocated': return 'error'
    case 'fully_booked': return 'warning'
    case 'available': return 'success'
    case 'underutilized': return 'neutral'
    default: return 'neutral'
  }
}

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'overallocated': return 'Over'
    case 'fully_booked': return 'Full'
    case 'available': return 'Available'
    case 'underutilized': return 'Under'
    default: return status
  }
}

// Allocation bar width
const getAllocationWidth = (percent: number) => {
  return `${Math.min(percent, 100)}%`
}

const getAllocationColor = (percent: number): string => {
  if (percent > 110) return 'bg-red-500'
  if (percent > 90) return 'bg-amber-500'
  if (percent > 50) return 'bg-emerald-500'
  return 'bg-gray-300'
}

// Period options
const periodOptions = [
  { label: '2 Weeks', value: 2 },
  { label: '4 Weeks', value: 4 },
  { label: '6 Weeks', value: 6 },
  { label: '8 Weeks', value: 8 }
]

// Table columns
const teamColumns: any[] = [
  { key: 'name', label: 'Team Member' },
  { key: 'allocation', label: 'Allocation' },
  { key: 'bookedHours', label: 'Booked' },
  { key: 'availableHours', label: 'Available' },
  { key: 'status', label: 'Status' }
]

const projectColumns: any[] = [
  { key: 'projectName', label: 'Project' },
  { key: 'clientName', label: 'Client' },
  { key: 'remainingHours', label: 'Hours Left' },
  { key: 'assignedMembers', label: 'Team' }
]
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Resource Planning">
        <template #right>
          <USelectMenu
            v-model="weeksAhead"
            :items="periodOptions"
            placeholder="Period"
            value-key="value"
            class="w-32"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <template v-else>
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Team Capacity</p>
                <p class="text-2xl font-bold">{{ formatHours(summary.totalCapacity) }}</p>
                <p class="text-xs text-gray-400">{{ summary.teamSize }} members</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Booked Hours</p>
                <p class="text-2xl font-bold text-blue-500">{{ formatHours(summary.totalBooked) }}</p>
                <p class="text-xs text-gray-400">{{ formatPercent(summary.utilizationPercent) }} utilization</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Available Hours</p>
                <p class="text-2xl font-bold text-emerald-500">{{ formatHours(summary.availableHours) }}</p>
                <p class="text-xs text-gray-400">Ready to allocate</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500 mb-1">Alerts</p>
                <div class="flex justify-center gap-4 mt-1">
                  <div>
                    <p class="text-xl font-bold text-red-500">{{ summary.overallocatedCount }}</p>
                    <p class="text-xs text-gray-400">Over</p>
                  </div>
                  <div>
                    <p class="text-xl font-bold text-gray-400">{{ summary.underutilizedCount }}</p>
                    <p class="text-xs text-gray-400">Under</p>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Alerts Section -->
          <div v-if="alerts.overallocated.length > 0" class="mb-6">
            <UCard class="border-red-500/50 bg-red-50 dark:bg-red-900/20">
              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-red-500 mt-0.5" />
                <div>
                  <p class="font-semibold text-red-700 dark:text-red-400">Overallocated Team Members</p>
                  <p class="text-sm text-red-600 dark:text-red-300 mt-1">
                    {{ alerts.overallocated.map((a: any) => a.name).join(', ') }}
                    - Consider reassigning tasks or extending deadlines.
                  </p>
                </div>
              </div>
            </UCard>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <!-- Team Capacity -->
            <div class="lg:col-span-2">
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Team Allocation</h3>
                </template>

                <div class="space-y-4">
                  <div
                    v-for="member in teamMembers"
                    :key="member.id"
                    class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <div>
                        <p class="font-medium">{{ member.name }}</p>
                        <p class="text-xs text-gray-500">{{ member.role || member.departmentName || 'Team Member' }}</p>
                      </div>
                      <div class="flex items-center gap-3">
                        <div class="text-right">
                          <p class="text-sm font-semibold">{{ formatHours(member.bookedHours) }} / {{ formatHours(member.periodCapacity) }}</p>
                          <p class="text-xs text-gray-500">{{ formatHours(member.availableHours) }} available</p>
                        </div>
                        <UBadge :color="getStatusColor(member.status)" variant="subtle">
                          {{ getStatusLabel(member.status) }}
                        </UBadge>
                      </div>
                    </div>
                    <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        :class="getAllocationColor(member.allocationPercent)"
                        class="h-full rounded-full transition-all"
                        :style="{ width: getAllocationWidth(member.allocationPercent) }"
                      />
                    </div>
                    <div class="flex justify-between mt-1 text-xs text-gray-500">
                      <span>0%</span>
                      <span>{{ formatPercent(member.allocationPercent) }}</span>
                      <span>100%</span>
                    </div>
                  </div>

                  <p v-if="teamMembers.length === 0" class="text-center text-gray-500 py-4">
                    No team members found
                  </p>
                </div>
              </UCard>
            </div>

            <!-- Weekly Breakdown -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Weekly Overview</h3>
              </template>

              <div class="space-y-4">
                <div
                  v-for="week in weeklyBreakdown"
                  :key="week.weekStart"
                  class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div class="flex items-center justify-between mb-2">
                    <p class="font-medium text-sm">{{ formatWeek(week.weekStart) }}</p>
                    <span class="text-xs text-gray-500">{{ week.activeUsers }} active</span>
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p class="text-gray-500 text-xs">Booked</p>
                      <p class="font-semibold text-blue-500">{{ formatHours(week.bookedHours) }}</p>
                    </div>
                    <div>
                      <p class="text-gray-500 text-xs">Logged</p>
                      <p class="font-semibold text-emerald-500">{{ formatHours(week.loggedHours) }}</p>
                    </div>
                  </div>
                </div>

                <p v-if="weeklyBreakdown.length === 0" class="text-center text-gray-500 py-4">
                  No data for this period
                </p>
              </div>
            </UCard>
          </div>

          <!-- Project Allocations -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Active Project Workload</h3>
            </template>

            <UTable :data="projectAllocations" :columns="projectColumns">
              <template #projectName-cell="{ row: r }">
                <NuxtLink :to="`/agency/projects/${(r as any).projectId}`" class="font-medium text-primary-500 hover:underline">
                  {{ (r as any).projectName }}
                </NuxtLink>
              </template>

              <template #clientName-cell="{ row: r }">
                <span class="text-gray-500">{{ (r as any).clientName }}</span>
              </template>

              <template #remainingHours-cell="{ row: r }">
                <span class="font-semibold">{{ formatHours((r as any).remainingHours) }}</span>
              </template>

              <template #assignedMembers-cell="{ row: r }">
                <div class="flex items-center gap-1">
                  <UIcon name="i-lucide-users" class="w-4 h-4 text-gray-400" />
                  <span>{{ (r as any).assignedMembers }}</span>
                </div>
              </template>
            </UTable>

            <div v-if="projectAllocations.length === 0" class="text-center text-gray-500 py-8">
              No active projects with scheduled work
            </div>
          </UCard>

          <!-- Navigation -->
          <div class="flex gap-4 mt-6">
            <UButton
              variant="outline"
              label="Time Tracking"
              icon="i-lucide-clock"
              @click="navigateTo('/agency/time')"
            />
            <UButton
              variant="outline"
              label="Projects"
              icon="i-lucide-folder"
              @click="navigateTo('/agency/projects')"
            />
          </div>
        </template>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>
