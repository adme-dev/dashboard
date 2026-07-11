<script setup lang="ts">
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks, isToday, parseISO, isBefore, startOfDay } from 'date-fns'

definePageMeta({
  title: 'Time Tracking',
  middleware: ['auth']
})

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
}) => Promise<T>

// Current week state
const currentWeekStart = ref(startOfWeek(new Date(), { weekStartsOn: 1 }))

const weekDates = computed(() => {
  const dates = []
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(currentWeekStart.value, i))
  }
  return dates
})

const weekLabel = computed(() => {
  const end = endOfWeek(currentWeekStart.value, { weekStartsOn: 1 })
  return `${format(currentWeekStart.value, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
})

const weekStartStr = computed(() => format(currentWeekStart.value, 'yyyy-MM-dd'))
const weekEndStr = computed(() => format(endOfWeek(currentWeekStart.value, { weekStartsOn: 1 }), 'yyyy-MM-dd'))

// Fetch time entries for the week
const { data: entriesData, pending, refresh } = await useFetch('/api/agency/time/entries', {
  query: {
    startDate: weekStartStr,
    endDate: weekEndStr
  }
})

// Fetch active timer
const { data: timerData, refresh: refreshTimer } = await useFetch('/api/agency/time/timer')

// Fetch projects for dropdown
const { data: projectsData } = await useFetch('/api/agency/projects', {
  query: { limit: 100, status: 'active' }
})

const entries = computed(() => (entriesData.value?.entries || []) as any[])
const summary = computed(() => (entriesData.value?.summary || {
  totalHours: 0,
  billableHours: 0,
  nonBillableHours: 0,
  totalValue: 0,
  billableValue: 0
}) as any)
const activeTimer = computed(() => timerData.value?.timer as any)
const projects = computed(() => ((projectsData.value as any)?.projects || []) as any[])

// --- Task fetching for selectors ---
const modalTasks = ref<any[]>([])
const timerTasks = ref<any[]>([])

async function fetchTasksForProject(projectId: string | null, target: 'modal' | 'timer') {
  if (!projectId) {
    if (target === 'modal') modalTasks.value = []
    else timerTasks.value = []
    return
  }
  try {
    const data = await apiFetch<any>('/api/agency/tasks', {
      query: { projectId, limit: 50 }
    })
    const tasks = (data?.tasks || data || []) as any[]
    if (target === 'modal') modalTasks.value = tasks
    else timerTasks.value = tasks
  } catch {
    if (target === 'modal') modalTasks.value = []
    else timerTasks.value = []
  }
}

// --- Timesheet status ---
const timesheetStatus = ref<any>(null)
const loadingTimesheet = ref(false)

async function fetchTimesheetStatus() {
  loadingTimesheet.value = true
  try {
    const data = await apiFetch<any>('/api/agency/time/timesheets', {
      query: { periodStart: weekStartStr.value, periodEnd: weekEndStr.value, limit: 1 }
    })
    timesheetStatus.value = data?.timesheets?.[0] || null
  } catch {
    timesheetStatus.value = null
  } finally {
    loadingTimesheet.value = false
  }
}

// Reload timesheet status when week changes
watch([weekStartStr], () => fetchTimesheetStatus(), { immediate: true })

const weekStatus = computed(() => timesheetStatus.value?.status || 'draft')
const isWeekLocked = computed(() => ['submitted', 'approved'].includes(weekStatus.value))
const isCurrentOrPastWeek = computed(() => {
  const now = startOfDay(new Date())
  const weekEnd = endOfWeek(currentWeekStart.value, { weekStartsOn: 1 })
  return !isBefore(now, startOfDay(currentWeekStart.value))
})
const hasDraftEntries = computed(() => entries.value.some(e => e.status === 'draft'))
const canSubmit = computed(() => isCurrentOrPastWeek.value && hasDraftEntries.value && weekStatus.value === 'draft')

// Submit timesheet
const showSubmitModal = ref(false)
const submittingTimesheet = ref(false)

async function submitTimesheet() {
  submittingTimesheet.value = true
  try {
    await apiFetch('/api/agency/time/timesheets', {
      method: 'POST',
      body: {
        periodStart: weekStartStr.value,
        periodEnd: weekEndStr.value
      }
    })
    toast.add({ title: 'Timesheet submitted for approval', color: 'success' })
    showSubmitModal.value = false
    await fetchTimesheetStatus()
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to submit', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    submittingTimesheet.value = false
  }
}

// Group entries by date
const entriesByDate = computed(() => {
  const grouped: Record<string, any[]> = {}
  for (const date of weekDates.value) {
    const dateStr = format(date, 'yyyy-MM-dd')
    grouped[dateStr] = entries.value.filter(e => e.date === dateStr)
  }
  return grouped
})

// Hours per day
const hoursByDate = computed(() => {
  const hours: Record<string, number> = {}
  for (const date of weekDates.value) {
    const dateStr = format(date, 'yyyy-MM-dd')
    hours[dateStr] = entriesByDate.value[dateStr]?.reduce((sum, e) => sum + e.hours, 0) || 0
  }
  return hours
})

// Navigation
const prevWeek = () => {
  currentWeekStart.value = subWeeks(currentWeekStart.value, 1)
}

const nextWeek = () => {
  currentWeekStart.value = addWeeks(currentWeekStart.value, 1)
}

const goToToday = () => {
  currentWeekStart.value = startOfWeek(new Date(), { weekStartsOn: 1 })
}

// New entry modal
const showNewEntryModal = ref(false)
const selectedDate = ref(format(new Date(), 'yyyy-MM-dd'))
const newEntry = ref({
  projectId: null as string | null,
  taskId: null as string | null,
  hours: 1,
  description: '',
  billable: true
})

// Watch modal project changes to fetch tasks
watch(() => newEntry.value.projectId, (pid) => {
  newEntry.value.taskId = null
  fetchTasksForProject(pid, 'modal')
})

const openNewEntry = (date?: Date) => {
  if (isWeekLocked.value) return
  selectedDate.value = format(date || new Date(), 'yyyy-MM-dd')
  newEntry.value = {
    projectId: null,
    taskId: null,
    hours: 1,
    description: '',
    billable: true
  }
  modalTasks.value = []
  showNewEntryModal.value = true
}

const creatingEntry = ref(false)
const createEntry = async () => {
  if (!newEntry.value.hours || newEntry.value.hours <= 0) {
    toast.add({ title: 'Hours must be greater than 0', color: 'error' })
    return
  }

  creatingEntry.value = true
  try {
    await apiFetch('/api/agency/time/entries', {
      method: 'POST',
      body: {
        date: selectedDate.value,
        projectId: newEntry.value.projectId,
        taskId: newEntry.value.taskId,
        hours: newEntry.value.hours,
        description: newEntry.value.description,
        billable: newEntry.value.billable
      }
    })
    toast.add({ title: 'Time entry added', color: 'success' })
    showNewEntryModal.value = false
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to add entry', description: err.message, color: 'error' })
  } finally {
    creatingEntry.value = false
  }
}

// Delete entry
const deletingEntryId = ref<string | null>(null)
const deleteEntry = async (id: string) => {
  deletingEntryId.value = id
  try {
    await apiFetch(`/api/agency/time/entries/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Entry deleted', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to delete entry', description: err.message, color: 'error' })
  } finally {
    deletingEntryId.value = null
  }
}

// Timer controls
const startingTimer = ref(false)
const stoppingTimer = ref(false)
const timerProjectId = ref<string | null>(null)
const timerTaskId = ref<string | null>(null)
const timerDescription = ref('')

// Watch timer project changes to fetch tasks
watch(timerProjectId, (pid) => {
  timerTaskId.value = null
  fetchTasksForProject(pid, 'timer')
})

const startTimer = async () => {
  startingTimer.value = true
  try {
    await apiFetch('/api/agency/time/timer/start', {
      method: 'POST',
      body: {
        projectId: timerProjectId.value,
        taskId: timerTaskId.value,
        description: timerDescription.value,
        billable: true
      }
    })
    toast.add({ title: 'Timer started', color: 'success' })
    timerProjectId.value = null
    timerTaskId.value = null
    timerDescription.value = ''
    timerTasks.value = []
    refreshTimer()
  } catch (err: any) {
    toast.add({ title: 'Failed to start timer', description: err.message, color: 'error' })
  } finally {
    startingTimer.value = false
  }
}

const stopTimer = async () => {
  stoppingTimer.value = true
  try {
    await apiFetch('/api/agency/time/timer/stop', { method: 'POST' })
    toast.add({ title: 'Timer stopped and entry created', color: 'success' })
    refreshTimer()
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to stop timer', description: err.message, color: 'error' })
  } finally {
    stoppingTimer.value = false
  }
}

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(value)
}

// Timer elapsed time (update every second)
const timerElapsed = ref(0)
let timerInterval: NodeJS.Timeout | null = null

const updateTimerElapsed = () => {
  if (activeTimer.value?.startedAt) {
    const start = new Date(activeTimer.value.startedAt).getTime()
    timerElapsed.value = Math.floor((Date.now() - start) / 1000)
  }
}

const formatElapsed = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function statusBadgeColor(status: string): 'neutral' | 'warning' | 'success' | 'error' {
  const map: Record<string, any> = { draft: 'neutral', submitted: 'warning', approved: 'success', rejected: 'error' }
  return map[status] || 'neutral'
}

onMounted(() => {
  timerInterval = setInterval(updateTimerElapsed, 1000)
  updateTimerElapsed()
})

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
})
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Time Tracking">
        <template #right>
          <UButton
            v-if="!isWeekLocked"
            label="Log Time"
            icon="i-lucide-plus"
            color="primary"
            @click="openNewEntry()"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Rejection Banner -->
        <div v-if="weekStatus === 'rejected'" class="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-alert-circle" class="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium text-red-700 dark:text-red-400">Timesheet Rejected</p>
              <p v-if="timesheetStatus?.rejectionReason" class="text-sm text-red-600 dark:text-red-300 mt-1">
                {{ timesheetStatus.rejectionReason }}
              </p>
              <p class="text-xs text-red-500 mt-2">Please edit your entries and resubmit.</p>
            </div>
          </div>
        </div>

        <!-- Active Timer Banner -->
        <UCard v-if="activeTimer" class="mb-6 border-primary-500 bg-primary-50 dark:bg-primary-900/20">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="p-3 rounded-full bg-primary-500/20 animate-pulse">
                <UIcon name="i-lucide-timer" class="w-6 h-6 text-primary-500" />
              </div>
              <div>
                <p class="font-semibold text-lg font-mono">{{ formatElapsed(timerElapsed) }}</p>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ activeTimer.project?.name || 'No project' }}
                  <span v-if="activeTimer.task?.title"> / {{ activeTimer.task.title }}</span>
                  <span v-if="activeTimer.description"> - {{ activeTimer.description }}</span>
                </p>
              </div>
            </div>
            <UButton
              color="error"
              label="Stop Timer"
              icon="i-lucide-square"
              :loading="stoppingTimer"
              @click="stopTimer"
            />
          </div>
        </UCard>

        <!-- Start Timer (when no active timer) -->
        <UCard v-else class="mb-6">
          <div class="flex items-center gap-4 flex-wrap">
            <UIcon name="i-lucide-timer" class="w-6 h-6 text-gray-400" />
            <div class="flex-1 flex gap-3 flex-wrap">
              <USelectMenu
                v-model="timerProjectId"
                :items="[{ label: 'No project', value: null }, ...projects.map(p => ({ label: p.name, value: p.id }))]"
                placeholder="Select project"
                value-key="value"
                class="w-44"
              />
              <USelectMenu
                v-if="timerTasks.length > 0"
                v-model="timerTaskId"
                :items="[{ label: 'No task', value: null }, ...timerTasks.map(t => ({ label: t.title, value: t.id }))]"
                placeholder="Select task"
                value-key="value"
                class="w-44"
              />
              <UInput
                v-model="timerDescription"
                placeholder="What are you working on?"
                class="flex-1 min-w-[150px]"
              />
            </div>
            <UButton
              color="primary"
              label="Start Timer"
              icon="i-lucide-play"
              :loading="startingTimer"
              @click="startTimer"
            />
          </div>
        </UCard>

        <!-- Week Summary -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-blue-500/10">
                <UIcon name="i-lucide-clock" class="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Total Hours</p>
                <p class="text-xl font-bold">{{ summary.totalHours.toFixed(1) }}h</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Billable Hours</p>
                <p class="text-xl font-bold">{{ summary.billableHours.toFixed(1) }}h</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-percent" class="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Utilization</p>
                <p class="text-xl font-bold">
                  {{ summary.totalHours > 0 ? ((summary.billableHours / summary.totalHours) * 100).toFixed(0) : 0 }}%
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-violet-500/10">
                <UIcon name="i-lucide-dollar-sign" class="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Billable Value</p>
                <p class="text-xl font-bold">{{ formatCurrency(summary.billableValue || 0) }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Week Navigation -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <UButton variant="ghost" icon="i-lucide-chevron-left" @click="prevWeek" />
            <h2 class="text-lg font-semibold min-w-[200px] text-center">{{ weekLabel }}</h2>
            <UButton variant="ghost" icon="i-lucide-chevron-right" @click="nextWeek" />
            <UBadge :color="statusBadgeColor(weekStatus)" variant="soft" class="ml-2 capitalize">
              {{ weekStatus }}
            </UBadge>
          </div>
          <div class="flex items-center gap-2">
            <UButton variant="outline" size="sm" label="Today" @click="goToToday" />
            <UButton
              v-if="canSubmit"
              color="primary"
              size="sm"
              icon="i-lucide-send"
              label="Submit Timesheet"
              @click="showSubmitModal = true"
            />
          </div>
        </div>

        <!-- Weekly Timesheet Grid -->
        <UCard>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700">
                  <th
                    v-for="date in weekDates"
                    :key="date.toISOString()"
                    class="p-3 text-center min-w-[120px]"
                    :class="{ 'bg-primary-50 dark:bg-primary-900/20': isToday(date) }"
                  >
                    <div class="text-xs text-gray-500 uppercase">{{ format(date, 'EEE') }}</div>
                    <div class="text-lg font-semibold" :class="{ 'text-primary-500': isToday(date) }">
                      {{ format(date, 'd') }}
                    </div>
                    <div class="text-xs text-gray-400">{{ hoursByDate[format(date, 'yyyy-MM-dd')]?.toFixed(1) || '0' }}h</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    v-for="date in weekDates"
                    :key="date.toISOString()"
                    class="p-2 align-top border-r border-gray-100 dark:border-gray-800 min-h-[200px]"
                    :class="{ 'bg-primary-50/50 dark:bg-primary-900/10': isToday(date) }"
                  >
                    <div class="space-y-2">
                      <!-- Entries for this day -->
                      <div
                        v-for="entry in entriesByDate[format(date, 'yyyy-MM-dd')]"
                        :key="entry.id"
                        class="p-2 rounded-lg text-xs"
                        :class="entry.billable ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'"
                      >
                        <div class="flex items-center justify-between mb-1">
                          <div class="flex items-center gap-1">
                            <span class="font-semibold">{{ entry.hours }}h</span>
                            <UIcon v-if="isWeekLocked" name="i-lucide-lock" class="w-3 h-3 text-gray-400" />
                          </div>
                          <UButton
                            v-if="!isWeekLocked"
                            variant="ghost"
                            color="error"
                            icon="i-lucide-x"
                            size="xs"
                            :loading="deletingEntryId === entry.id"
                            @click="deleteEntry(entry.id)"
                          />
                        </div>
                        <p class="text-gray-600 dark:text-gray-400 truncate">
                          {{ entry.project?.name || 'No project' }}
                        </p>
                        <p v-if="entry.task?.title" class="text-blue-600 dark:text-blue-400 truncate">
                          {{ entry.task.title }}
                        </p>
                        <p v-if="entry.description" class="text-gray-500 truncate">
                          {{ entry.description }}
                        </p>
                      </div>

                      <!-- Add entry button -->
                      <button
                        v-if="!isWeekLocked"
                        class="w-full p-2 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:border-primary-500 hover:text-primary-500 transition"
                        @click="openNewEntry(date)"
                      >
                        <UIcon name="i-lucide-plus" class="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>

        <!-- Quick Links -->
        <div class="flex gap-4 mt-6">
          <UButton
            variant="outline"
            label="View Reports"
            icon="i-lucide-bar-chart-2"
            @click="navigateTo('/agency/time/reports')"
          />
          <UButton
            variant="outline"
            label="All Entries"
            icon="i-lucide-list"
            @click="navigateTo('/agency/time/entries')"
          />
          <UButton
            variant="outline"
            label="Approvals"
            icon="i-lucide-check-check"
            @click="navigateTo('/agency/time/approvals')"
          />
        </div>
      </div>
    </UDashboardPanel>

    <!-- New Entry Modal -->
    <UModal v-model:open="showNewEntryModal">
      <template #header>
        <h3 class="font-semibold">Log Time - {{ format(parseISO(selectedDate), 'MMM d, yyyy') }}</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Project">
            <USelectMenu
              v-model="newEntry.projectId"
              :items="[{ label: 'No project', value: null }, ...projects.map(p => ({ label: `${p.name} (${p.client?.name || 'No client'})`, value: p.id }))]"
              placeholder="Select project"
              value-key="value"
            />
          </UFormField>

          <UFormField v-if="modalTasks.length > 0" label="Task">
            <USelectMenu
              v-model="newEntry.taskId"
              :items="[{ label: 'No task', value: null }, ...modalTasks.map(t => ({ label: t.title, value: t.id }))]"
              placeholder="Select task"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Hours" required>
            <UInput
              v-model.number="newEntry.hours"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
            />
          </UFormField>

          <UFormField label="Description">
            <UInput
              v-model="newEntry.description"
              placeholder="What did you work on?"
            />
          </UFormField>

          <UCheckbox v-model="newEntry.billable" label="Billable" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showNewEntryModal = false" />
          <UButton
            color="primary"
            label="Add Entry"
            :loading="creatingEntry"
            @click="createEntry"
          />
        </div>
      </template>
    </UModal>

    <!-- Submit Timesheet Confirmation Modal -->
    <UModal v-model:open="showSubmitModal">
      <template #header>
        <h3 class="font-semibold">Submit Timesheet</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-gray-600">
            Submit your timesheet for <strong>{{ weekLabel }}</strong> for manager approval?
          </p>
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Total Hours</span>
              <span class="font-semibold">{{ summary.totalHours.toFixed(1) }}h</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Billable Hours</span>
              <span class="font-semibold">{{ summary.billableHours.toFixed(1) }}h</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Entries</span>
              <span class="font-semibold">{{ entries.length }}</span>
            </div>
          </div>
          <p class="text-xs text-gray-400">
            Once submitted, you won't be able to edit entries until the timesheet is approved or returned.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showSubmitModal = false" />
          <UButton
            color="primary"
            label="Submit for Approval"
            icon="i-lucide-send"
            :loading="submittingTimesheet"
            @click="submitTimesheet"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
