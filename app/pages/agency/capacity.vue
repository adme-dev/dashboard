<script setup lang="ts">
import { format, addWeeks, startOfWeek } from 'date-fns'

definePageMeta({
  title: 'Resource Planning',
  middleware: ['auth']
})

const toast = useToast()

// View mode
type ViewMode = 'list' | 'heatmap' | 'adjustments'
const viewMode = ref<ViewMode>('heatmap')

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

// Fetch capacity data (list view)
const { data: capacityData, pending, refresh } = await useFetch('/api/agency/capacity', {
  query: { startDate, endDate }
})

// Fetch heatmap data
const { data: heatmapData, pending: heatmapPending, refresh: refreshHeatmap } = await useFetch('/api/agency/capacity/heatmap', {
  query: computed(() => ({ weeks: weeksAhead.value }))
})

// Fetch adjustments
const { data: adjustmentsData, refresh: refreshAdjustments } = await useFetch('/api/agency/capacity/adjustments', {
  query: { includeExpired: 'false' }
})

// Fetch team members for adjustment creation
const { data: teamMembersRaw } = await useFetch('/api/agency/team-members')

const teamMemberOptions = computed(() => {
  const raw = teamMembersRaw.value as any
  const members = (raw?.members || raw || []) as any[]
  return [
    { label: 'Company-wide', value: 'none' },
    ...members.map((m: any) => ({ label: m.name, value: m.id }))
  ]
})

// Computed data
const heatmapRows = computed(() => (heatmapData.value?.rows || []) as any[])
const heatmapWeeks = computed(() => (heatmapData.value?.weeks || []) as any[])
const columnSummaries = computed(() => (heatmapData.value?.columnSummaries || []) as any[])
const heatmapLegend = computed(() => heatmapData.value?.legend || {
  available: { label: 'Available', color: '#22c55e', range: '< 60%' },
  balanced: { label: 'Balanced', color: '#3b82f6', range: '60-85%' },
  busy: { label: 'Busy', color: '#f59e0b', range: '85-100%' },
  overloaded: { label: 'Overloaded', color: '#ef4444', range: '> 100%' }
})

const summary = computed(() => (capacityData.value?.summary || {
  totalCapacity: 0, totalBooked: 0, totalLogged: 0, availableHours: 0,
  utilizationPercent: 0, teamSize: 0, overallocatedCount: 0, underutilizedCount: 0
}) as any)

const teamMembers = computed(() => (capacityData.value?.teamMembers || []) as any[])
const projectAllocations = computed(() => (capacityData.value?.projectAllocations || []) as any[])
const weeklyBreakdown = computed(() => (capacityData.value?.weeklyBreakdown || []) as any[])
const alerts = computed(() => (capacityData.value?.alerts || { overallocated: [], underutilized: [] }) as any)
const adjustments = computed(() => (adjustmentsData.value?.adjustments || []) as any[])

// Heatmap cell styling
const getCellColor = (status: string): string => {
  switch (status) {
    case 'available': return 'bg-emerald-500'
    case 'balanced': return 'bg-blue-500'
    case 'busy': return 'bg-amber-500'
    case 'overloaded': return 'bg-red-500'
    default: return 'bg-gray-200 dark:bg-gray-700'
  }
}

const getCellOpacity = (utilization: number | null): string => {
  if (utilization === null) return 'opacity-20'
  if (utilization < 30) return 'opacity-40'
  if (utilization < 60) return 'opacity-60'
  if (utilization < 80) return 'opacity-80'
  return 'opacity-100'
}

// Selected cell for detail modal
const selectedCell = ref<{ member: any; week: any; cell: any } | null>(null)
const showCellModal = computed({
  get: () => !!selectedCell.value,
  set: (value: boolean) => { if (!value) selectedCell.value = null }
})

// Format helpers
const formatHours = (hours: number | string | null | undefined) => `${Number(hours || 0).toFixed(0)}h`
const formatPercent = (value: number | string | null | undefined) => `${Number(value || 0).toFixed(0)}%`
const formatWeek = (date: string) => format(new Date(date), 'MMM d')

// Status helpers
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

// Allocation bar helpers
const getAllocationWidth = (percent: number) => `${Math.min(percent, 100)}%`
const getAllocationColor = (percent: number): string => {
  if (percent > 110) return 'bg-red-500'
  if (percent > 90) return 'bg-amber-500'
  if (percent > 50) return 'bg-emerald-500'
  return 'bg-gray-300 dark:bg-gray-600'
}

// Period options
const periodOptions = [
  { label: '2 Weeks', value: 2 },
  { label: '4 Weeks', value: 4 },
  { label: '6 Weeks', value: 6 },
  { label: '8 Weeks', value: 8 }
]

// Project table columns (Nuxt UI v4 format)
const projectColumns = [
  { accessorKey: 'projectName', header: 'Project' },
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'remainingHours', header: 'Hours Left' },
  { accessorKey: 'assignedMembers', header: 'Team' }
]

// Adjustments table columns
const adjustmentColumns = [
  { accessorKey: 'teamMemberName', header: 'Team Member' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'dates', header: 'Dates' },
  { accessorKey: 'hoursImpact', header: 'Hours Impact' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]

// Adjustment table data with flat fields for accessorKey
const adjustmentTableData = computed(() => adjustments.value.map((a: any) => ({
  ...a,
  teamMemberName: a.teamMember?.name || 'Company-wide',
  dates: `${format(new Date(a.startDate), 'MMM d')} - ${format(new Date(a.endDate), 'MMM d, yyyy')}`,
})))

// Adjustment type label
const getAdjustmentTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    pto: 'PTO', sick_leave: 'Sick Leave', holiday: 'Holiday',
    training: 'Training', conference: 'Conference',
    reduced_hours: 'Reduced Hours', increased_hours: 'Increased Hours',
    leave_of_absence: 'Leave', other: 'Other'
  }
  return labels[type] || type
}

const getAdjustmentTypeColor = (type: string) => {
  switch (type) {
    case 'pto': case 'sick_leave': case 'leave_of_absence': return 'warning'
    case 'holiday': return 'success'
    case 'training': case 'conference': return 'info'
    case 'reduced_hours': return 'neutral'
    case 'increased_hours': return 'success'
    default: return 'neutral'
  }
}

// Recalculate forecasts
const recalculating = ref(false)
async function recalculateForecasts() {
  recalculating.value = true
  try {
    const result = await $fetch('/api/agency/capacity/recalculate', {
      method: 'POST',
      body: { weeksAhead: weeksAhead.value }
    })
    toast.add({
      title: 'Forecasts Updated',
      description: `Generated ${(result as any).recalculated?.forecastsGenerated || 0} forecasts for ${(result as any).recalculated?.teamMembersProcessed || 0} team members`,
      color: 'success'
    })
    await Promise.all([refresh(), refreshHeatmap()])
  } catch {
    toast.add({ title: 'Error', description: 'Failed to recalculate forecasts', color: 'error' })
  } finally {
    recalculating.value = false
  }
}

// Add adjustment modal
const showAddAdjustment = ref(false)
const adjustmentForm = ref({
  teamMemberId: 'none',
  adjustmentType: 'pto',
  startDate: '',
  endDate: '',
  title: '',
  description: '',
  hoursPerDay: 8,
  adjustedHoursPerDay: 0
})

const adjustmentTypes = [
  { label: 'PTO', value: 'pto' },
  { label: 'Sick Leave', value: 'sick_leave' },
  { label: 'Holiday', value: 'holiday' },
  { label: 'Training', value: 'training' },
  { label: 'Conference', value: 'conference' },
  { label: 'Reduced Hours', value: 'reduced_hours' },
  { label: 'Increased Hours', value: 'increased_hours' },
  { label: 'Leave of Absence', value: 'leave_of_absence' },
  { label: 'Other', value: 'other' }
]

const savingAdjustment = ref(false)
async function createAdjustment() {
  if (!adjustmentForm.value.startDate || !adjustmentForm.value.endDate) {
    toast.add({ title: 'Error', description: 'Start and end dates are required', color: 'error' })
    return
  }
  savingAdjustment.value = true
  try {
    await $fetch('/api/agency/capacity/adjustments', {
      method: 'POST',
      body: {
        teamMemberId: adjustmentForm.value.teamMemberId === 'none' ? null : adjustmentForm.value.teamMemberId,
        adjustmentType: adjustmentForm.value.adjustmentType,
        startDate: adjustmentForm.value.startDate,
        endDate: adjustmentForm.value.endDate,
        title: adjustmentForm.value.title || null,
        description: adjustmentForm.value.description || null,
        hoursPerDay: adjustmentForm.value.hoursPerDay,
        adjustedHoursPerDay: adjustmentForm.value.adjustedHoursPerDay
      }
    })
    toast.add({ title: 'Adjustment Created', description: 'Capacity adjustment has been saved', color: 'success' })
    showAddAdjustment.value = false
    adjustmentForm.value = {
      teamMemberId: 'none', adjustmentType: 'pto',
      startDate: '', endDate: '', title: '', description: '',
      hoursPerDay: 8, adjustedHoursPerDay: 0
    }
    await refreshAdjustments()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to create adjustment', color: 'error' })
  } finally {
    savingAdjustment.value = false
  }
}

// Delete adjustment
async function deleteAdjustment(id: string) {
  try {
    await $fetch(`/api/agency/capacity/adjustments/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: 'Adjustment removed', color: 'success' })
    await refreshAdjustments()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete adjustment', color: 'error' })
  }
}

// Delete confirmation
const deletingId = ref<string | null>(null)
const showDeleteConfirm = ref(false)
function confirmDelete(id: string) {
  deletingId.value = id
  showDeleteConfirm.value = true
}
async function handleConfirmDelete() {
  if (deletingId.value) {
    await deleteAdjustment(deletingId.value)
  }
  showDeleteConfirm.value = false
  deletingId.value = null
}
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0 flex flex-col">
    <UDashboardPanel>
      <UDashboardNavbar title="Resource Planning">
        <template #right>
          <div class="flex items-center gap-3">
            <div class="inline-flex rounded-md shadow-sm">
              <UButton
                :variant="viewMode === 'heatmap' ? 'solid' : 'ghost'"
                icon="i-lucide-grid-3x3"
                size="sm"
                @click="viewMode = 'heatmap'"
              />
              <UButton
                :variant="viewMode === 'list' ? 'solid' : 'ghost'"
                icon="i-lucide-list"
                size="sm"
                @click="viewMode = 'list'"
              />
              <UButton
                :variant="viewMode === 'adjustments' ? 'solid' : 'ghost'"
                icon="i-lucide-calendar-off"
                size="sm"
                @click="viewMode = 'adjustments'"
              />
            </div>

            <USelectMenu
              v-model="weeksAhead"
              :items="periodOptions"
              placeholder="Period"
              value-key="value"
              class="w-32"
            />

            <UButton
              variant="outline"
              icon="i-lucide-refresh-cw"
              label="Recalculate"
              size="sm"
              :loading="recalculating"
              @click="recalculateForecasts"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="pending && viewMode !== 'adjustments'" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <template v-else>
          <!-- ==================== HEATMAP VIEW ==================== -->
          <template v-if="viewMode === 'heatmap'">
            <!-- Legend -->
            <div class="flex items-center gap-6 mb-6 p-4 bg-(--ui-bg-elevated) rounded-lg">
              <span class="text-sm font-medium text-(--ui-text-muted)">Utilization:</span>
              <div
                v-for="(item, key) in heatmapLegend"
                :key="key"
                class="flex items-center gap-2"
              >
                <div class="w-4 h-4 rounded" :style="{ backgroundColor: item.color }" />
                <span class="text-sm">{{ item.label }}</span>
                <span class="text-xs text-(--ui-text-dimmed)">({{ item.range }})</span>
              </div>
            </div>

            <!-- Heatmap Grid -->
            <UCard v-if="!heatmapPending && heatmapRows.length > 0">
              <div class="overflow-x-auto">
                <table class="w-full min-w-max">
                  <thead>
                    <tr>
                      <th class="text-left p-3 sticky left-0 bg-(--ui-bg) z-10 min-w-[200px]">
                        Team Member
                      </th>
                      <th
                        v-for="week in heatmapWeeks"
                        :key="week.weekStart"
                        class="p-2 text-center min-w-[80px]"
                      >
                        <div class="text-xs font-medium">{{ week.label }}</div>
                        <div class="text-xs text-(--ui-text-dimmed)">{{ formatWeek(week.weekStart) }}</div>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr
                      v-for="row in heatmapRows"
                      :key="row.teamMember.id"
                      class="border-t border-(--ui-border)"
                    >
                      <td class="p-3 sticky left-0 bg-(--ui-bg) z-10">
                        <div class="font-medium">{{ row.teamMember.name }}</div>
                        <div v-if="row.teamMember.department" class="text-xs text-(--ui-text-muted)">
                          {{ row.teamMember.department.name }}
                        </div>
                      </td>
                      <td
                        v-for="(cell, idx) in row.cells"
                        :key="idx"
                        class="p-1"
                      >
                        <button
                          class="w-full h-12 rounded-lg transition-all hover:scale-105 hover:shadow-lg relative group cursor-pointer"
                          :class="[getCellColor(cell.status), getCellOpacity(cell.utilization)]"
                          @click="selectedCell = { member: row.teamMember, week: heatmapWeeks[idx], cell }"
                        >
                          <span
                            v-if="cell.utilization !== null"
                            class="absolute inset-0 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {{ Math.round(cell.utilization) }}%
                          </span>
                        </button>
                      </td>
                    </tr>
                  </tbody>

                  <tfoot v-if="columnSummaries.length > 0">
                    <tr class="border-t-2 border-(--ui-border-accented) bg-(--ui-bg-elevated)">
                      <td class="p-3 sticky left-0 bg-(--ui-bg-elevated) z-10 font-semibold">
                        Weekly Summary
                      </td>
                      <td
                        v-for="colSummary in columnSummaries"
                        :key="colSummary.weekStart"
                        class="p-2 text-center"
                      >
                        <div class="text-xs">
                          <span class="font-semibold">{{ formatHours(colSummary.totalCommitted) }}</span>
                          <span class="text-(--ui-text-dimmed)"> / {{ formatHours(colSummary.totalAvailable) }}</span>
                        </div>
                        <div class="text-xs text-(--ui-text-muted)">
                          {{ colSummary.avgUtilization }}% avg
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </UCard>

            <!-- Empty state for heatmap -->
            <UCard v-else-if="!heatmapPending && heatmapRows.length === 0">
              <div class="text-center py-12">
                <UIcon name="i-lucide-grid-3x3" class="w-12 h-12 mx-auto text-(--ui-text-dimmed) mb-4" />
                <h3 class="text-lg font-semibold mb-2">No Forecast Data</h3>
                <p class="text-(--ui-text-muted) mb-4">
                  Resource forecasts need to be generated before the heatmap can display.
                </p>
                <UButton
                  label="Generate Forecasts"
                  icon="i-lucide-refresh-cw"
                  :loading="recalculating"
                  @click="recalculateForecasts"
                />
              </div>
            </UCard>

            <!-- Loading heatmap -->
            <div v-else class="flex items-center justify-center py-12">
              <XfLoader />
            </div>

            <!-- Quick Stats -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <UCard>
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <UIcon name="i-lucide-user-check" class="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p class="text-sm text-(--ui-text-muted)">Available</p>
                    <p class="text-xl font-bold">{{ heatmapRows.filter(r => r.cells.some((c: any) => c.status === 'available')).length }}</p>
                  </div>
                </div>
              </UCard>

              <UCard>
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <UIcon name="i-lucide-scale" class="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p class="text-sm text-(--ui-text-muted)">Balanced</p>
                    <p class="text-xl font-bold">{{ heatmapRows.filter(r => r.cells.some((c: any) => c.status === 'balanced')).length }}</p>
                  </div>
                </div>
              </UCard>

              <UCard>
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <UIcon name="i-lucide-flame" class="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p class="text-sm text-(--ui-text-muted)">Busy</p>
                    <p class="text-xl font-bold">{{ heatmapRows.filter(r => r.cells.some((c: any) => c.status === 'busy')).length }}</p>
                  </div>
                </div>
              </UCard>

              <UCard>
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                    <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p class="text-sm text-(--ui-text-muted)">Overloaded</p>
                    <p class="text-xl font-bold text-red-500">{{ heatmapRows.filter(r => r.cells.some((c: any) => c.status === 'overloaded')).length }}</p>
                  </div>
                </div>
              </UCard>
            </div>
          </template>

          <!-- ==================== LIST VIEW ==================== -->
          <template v-else-if="viewMode === 'list'">
            <!-- Summary Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <UCard>
                <div class="text-center">
                  <p class="text-sm text-(--ui-text-muted) mb-1">Team Capacity</p>
                  <p class="text-2xl font-bold">{{ formatHours(summary.totalCapacity) }}</p>
                  <p class="text-xs text-(--ui-text-dimmed)">{{ summary.teamSize }} members</p>
                </div>
              </UCard>

              <UCard>
                <div class="text-center">
                  <p class="text-sm text-(--ui-text-muted) mb-1">Booked Hours</p>
                  <p class="text-2xl font-bold text-blue-500">{{ formatHours(summary.totalBooked) }}</p>
                  <p class="text-xs text-(--ui-text-dimmed)">{{ formatPercent(summary.utilizationPercent) }} utilization</p>
                </div>
              </UCard>

              <UCard>
                <div class="text-center">
                  <p class="text-sm text-(--ui-text-muted) mb-1">Available Hours</p>
                  <p class="text-2xl font-bold text-emerald-500">{{ formatHours(summary.availableHours) }}</p>
                  <p class="text-xs text-(--ui-text-dimmed)">Ready to allocate</p>
                </div>
              </UCard>

              <UCard>
                <div class="text-center">
                  <p class="text-sm text-(--ui-text-muted) mb-1">Alerts</p>
                  <div class="flex justify-center gap-4 mt-1">
                    <div>
                      <p class="text-xl font-bold text-red-500">{{ summary.overallocatedCount }}</p>
                      <p class="text-xs text-(--ui-text-dimmed)">Over</p>
                    </div>
                    <div>
                      <p class="text-xl font-bold text-(--ui-text-dimmed)">{{ summary.underutilizedCount }}</p>
                      <p class="text-xs text-(--ui-text-dimmed)">Under</p>
                    </div>
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Alerts Section -->
            <div v-if="alerts.overallocated.length > 0" class="mb-6">
              <UAlert
                color="error"
                variant="subtle"
                icon="i-lucide-alert-triangle"
                title="Overallocated Team Members"
                :description="`${alerts.overallocated.map((a: any) => a.name).join(', ')} — Consider reassigning tasks or extending deadlines.`"
              />
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
                      class="p-3 rounded-lg bg-(--ui-bg-elevated)"
                    >
                      <div class="flex items-center justify-between mb-2">
                        <div>
                          <p class="font-medium">{{ member.name }}</p>
                          <p class="text-xs text-(--ui-text-muted)">{{ member.role || member.departmentName || 'Team Member' }}</p>
                        </div>
                        <div class="flex items-center gap-3">
                          <div class="text-right">
                            <p class="text-sm font-semibold">{{ formatHours(member.bookedHours) }} / {{ formatHours(member.periodCapacity) }}</p>
                            <p class="text-xs text-(--ui-text-muted)">{{ formatHours(member.availableHours) }} available</p>
                          </div>
                          <UBadge :color="getStatusColor(member.status)" variant="subtle">
                            {{ getStatusLabel(member.status) }}
                          </UBadge>
                        </div>
                      </div>
                      <div class="h-2 bg-(--ui-bg-accented) rounded-full overflow-hidden">
                        <div
                          :class="getAllocationColor(member.allocationPercent)"
                          class="h-full rounded-full transition-all"
                          :style="{ width: getAllocationWidth(member.allocationPercent) }"
                        />
                      </div>
                      <div class="flex justify-between mt-1 text-xs text-(--ui-text-dimmed)">
                        <span>0%</span>
                        <span>{{ formatPercent(member.allocationPercent) }}</span>
                        <span>100%</span>
                      </div>
                    </div>

                    <p v-if="teamMembers.length === 0" class="text-center text-(--ui-text-muted) py-4">
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
                    class="p-3 rounded-lg bg-(--ui-bg-elevated)"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <p class="font-medium text-sm">{{ formatWeek(week.weekStart) }}</p>
                      <span class="text-xs text-(--ui-text-muted)">{{ week.activeUsers }} active</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p class="text-(--ui-text-muted) text-xs">Booked</p>
                        <p class="font-semibold text-blue-500">{{ formatHours(week.bookedHours) }}</p>
                      </div>
                      <div>
                        <p class="text-(--ui-text-muted) text-xs">Logged</p>
                        <p class="font-semibold text-emerald-500">{{ formatHours(week.loggedHours) }}</p>
                      </div>
                    </div>
                  </div>

                  <p v-if="weeklyBreakdown.length === 0" class="text-center text-(--ui-text-muted) py-4">
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

              <UTable v-if="projectAllocations.length > 0" :data="projectAllocations" :columns="projectColumns">
                <template #projectName-cell="{ row }">
                  <NuxtLink :to="`/agency/projects/${(row.original as any).projectId}`" class="font-medium text-primary hover:underline">
                    {{ (row.original as any).projectName }}
                  </NuxtLink>
                </template>

                <template #clientName-cell="{ row }">
                  <span class="text-(--ui-text-muted)">{{ (row.original as any).clientName }}</span>
                </template>

                <template #remainingHours-cell="{ row }">
                  <span class="font-semibold">{{ formatHours((row.original as any).remainingHours) }}</span>
                </template>

                <template #assignedMembers-cell="{ row }">
                  <div class="flex items-center gap-1">
                    <UIcon name="i-lucide-users" class="w-4 h-4 text-(--ui-text-dimmed)" />
                    <span>{{ (row.original as any).assignedMembers }}</span>
                  </div>
                </template>
              </UTable>

              <div v-else class="text-center text-(--ui-text-muted) py-8">
                No active projects with scheduled work
              </div>
            </UCard>

            <!-- Navigation -->
            <div class="flex gap-4 mt-6">
              <UButton variant="outline" label="Time Tracking" icon="i-lucide-clock" to="/agency/time" />
              <UButton variant="outline" label="Projects" icon="i-lucide-folder" to="/agency/projects" />
            </div>
          </template>

          <!-- ==================== ADJUSTMENTS VIEW ==================== -->
          <template v-else-if="viewMode === 'adjustments'">
            <div class="flex items-center justify-between mb-6">
              <div>
                <h2 class="text-lg font-semibold">Time Off & Capacity Adjustments</h2>
                <p class="text-sm text-(--ui-text-muted)">Manage PTO, holidays, and schedule changes that affect team capacity</p>
              </div>
              <UButton
                label="Add Adjustment"
                icon="i-lucide-plus"
                @click="showAddAdjustment = true"
              />
            </div>

            <!-- Adjustment summary cards -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <UCard>
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <UIcon name="i-lucide-calendar-off" class="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p class="text-sm text-(--ui-text-muted)">Active Adjustments</p>
                    <p class="text-xl font-bold">{{ adjustments.length }}</p>
                  </div>
                </div>
              </UCard>

              <UCard>
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <UIcon name="i-lucide-clock" class="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p class="text-sm text-(--ui-text-muted)">Hours Impact</p>
                    <p class="text-xl font-bold">{{ formatHours(adjustmentsData?.summary?.totalHoursImpact || 0) }}</p>
                  </div>
                </div>
              </UCard>

              <UCard>
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p class="text-sm text-(--ui-text-muted)">Approved</p>
                    <p class="text-xl font-bold">{{ adjustments.filter((a: any) => a.isApproved).length }}</p>
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Adjustments table -->
            <UCard>
              <UTable v-if="adjustmentTableData.length > 0" :data="adjustmentTableData" :columns="adjustmentColumns">
                <template #teamMemberName-cell="{ row }">
                  <span class="font-medium">{{ (row.original as any).teamMemberName }}</span>
                </template>

                <template #type-cell="{ row }">
                  <UBadge :color="getAdjustmentTypeColor((row.original as any).type)" variant="subtle">
                    {{ getAdjustmentTypeLabel((row.original as any).type) }}
                  </UBadge>
                </template>

                <template #dates-cell="{ row }">
                  <span class="text-sm">{{ (row.original as any).dates }}</span>
                </template>

                <template #hoursImpact-cell="{ row }">
                  <span class="font-semibold text-amber-500">-{{ formatHours((row.original as any).hoursImpact) }}</span>
                </template>

                <template #status-cell="{ row }">
                  <UBadge :color="(row.original as any).isApproved ? 'success' : 'warning'" variant="subtle">
                    {{ (row.original as any).isApproved ? 'Approved' : 'Pending' }}
                  </UBadge>
                </template>

                <template #actions-cell="{ row }">
                  <UButton
                    variant="ghost"
                    color="error"
                    icon="i-lucide-trash-2"
                    size="xs"
                    @click="confirmDelete((row.original as any).id)"
                  />
                </template>
              </UTable>

              <div v-else class="text-center py-12">
                <UIcon name="i-lucide-calendar-check" class="w-12 h-12 mx-auto text-(--ui-text-dimmed) mb-4" />
                <h3 class="text-lg font-semibold mb-2">No Adjustments</h3>
                <p class="text-(--ui-text-muted) mb-4">
                  Add PTO, holidays, or schedule changes to adjust team capacity.
                </p>
                <UButton
                  label="Add Adjustment"
                  icon="i-lucide-plus"
                  @click="showAddAdjustment = true"
                />
              </div>
            </UCard>

          </template>
        </template>
      </div>
    </UDashboardPanel>

    <!-- Cell Detail Modal -->
    <UModal v-model:open="showCellModal">
      <template #content>
        <div v-if="selectedCell" class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-semibold">{{ selectedCell.member.name }}</h3>
            <UButton variant="ghost" icon="i-lucide-x" size="sm" @click="selectedCell = null" />
          </div>

          <div class="space-y-4">
            <div>
              <p class="text-sm text-(--ui-text-muted) mb-1">Week</p>
              <p class="font-medium">{{ formatWeek(selectedCell.week.weekStart) }} - {{ formatWeek(selectedCell.week.weekEnd) }}</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-sm text-(--ui-text-muted) mb-1">Utilization</p>
                <p class="text-2xl font-bold" :class="{
                  'text-emerald-500': selectedCell.cell.status === 'available',
                  'text-blue-500': selectedCell.cell.status === 'balanced',
                  'text-amber-500': selectedCell.cell.status === 'busy',
                  'text-red-500': selectedCell.cell.status === 'overloaded'
                }">
                  {{ selectedCell.cell.utilization !== null ? Math.round(selectedCell.cell.utilization) + '%' : 'N/A' }}
                </p>
              </div>
              <div>
                <p class="text-sm text-(--ui-text-muted) mb-1">Status</p>
                <UBadge
                  :color="selectedCell.cell.status === 'available' ? 'success' : selectedCell.cell.status === 'balanced' ? 'info' : selectedCell.cell.status === 'busy' ? 'warning' : 'error'"
                  variant="subtle"
                  class="capitalize"
                >
                  {{ selectedCell.cell.status }}
                </UBadge>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-sm text-(--ui-text-muted) mb-1">Committed</p>
                <p class="font-semibold">{{ selectedCell.cell.committed !== null ? formatHours(selectedCell.cell.committed) : 'N/A' }}</p>
              </div>
              <div>
                <p class="text-sm text-(--ui-text-muted) mb-1">Available</p>
                <p class="font-semibold text-emerald-500">{{ selectedCell.cell.available !== null ? formatHours(selectedCell.cell.available) : 'N/A' }}</p>
              </div>
            </div>

            <div v-if="selectedCell.member.department" class="pt-4 border-t border-(--ui-border)">
              <p class="text-sm text-(--ui-text-muted) mb-1">Department</p>
              <p class="font-medium">{{ selectedCell.member.department.name }}</p>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Add Adjustment Modal -->
    <UModal v-model:open="showAddAdjustment">
      <template #content>
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-semibold">Add Capacity Adjustment</h3>
            <UButton variant="ghost" icon="i-lucide-x" size="sm" @click="showAddAdjustment = false" />
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Team Member</label>
              <USelectMenu
                v-model="adjustmentForm.teamMemberId"
                :items="teamMemberOptions"
                value-key="value"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Type</label>
              <USelectMenu
                v-model="adjustmentForm.adjustmentType"
                :items="adjustmentTypes"
                value-key="value"
                class="w-full"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Start Date</label>
                <UInput v-model="adjustmentForm.startDate" type="date" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">End Date</label>
                <UInput v-model="adjustmentForm.endDate" type="date" />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Title</label>
              <UInput v-model="adjustmentForm.title" placeholder="e.g. Annual Leave" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Normal Hours/Day</label>
                <UInput v-model.number="adjustmentForm.hoursPerDay" type="number" :min="0" :max="24" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Adjusted Hours/Day</label>
                <UInput v-model.number="adjustmentForm.adjustedHoursPerDay" type="number" :min="0" :max="24" />
                <p class="text-xs text-(--ui-text-dimmed) mt-1">0 for full day off</p>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Notes</label>
              <UTextarea v-model="adjustmentForm.description" :rows="3" placeholder="Optional notes..." />
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-6">
            <UButton variant="outline" label="Cancel" @click="showAddAdjustment = false" />
            <UButton
              label="Create Adjustment"
              icon="i-lucide-plus"
              :loading="savingAdjustment"
              @click="createAdjustment"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteConfirm">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-2">Delete Adjustment</h3>
          <p class="text-(--ui-text-muted) mb-6">Are you sure you want to delete this capacity adjustment? This cannot be undone.</p>
          <div class="flex justify-end gap-2">
            <UButton variant="outline" label="Cancel" @click="showDeleteConfirm = false" />
            <UButton color="error" label="Delete" icon="i-lucide-trash-2" @click="handleConfirmDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
