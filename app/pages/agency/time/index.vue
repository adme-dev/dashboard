<script setup lang="ts">
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks, isToday, parseISO } from 'date-fns'

definePageMeta({
  title: 'Time Tracking',
  middleware: ['auth']
})

const toast = useToast()

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

// Fetch time entries for the week
const { data: entriesData, pending, refresh } = await useFetch('/api/agency/time/entries', {
  query: {
    startDate: computed(() => format(currentWeekStart.value, 'yyyy-MM-dd')),
    endDate: computed(() => format(endOfWeek(currentWeekStart.value, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
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

const openNewEntry = (date?: Date) => {
  selectedDate.value = format(date || new Date(), 'yyyy-MM-dd')
  newEntry.value = {
    projectId: null,
    taskId: null,
    hours: 1,
    description: '',
    billable: true
  }
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
    await $fetch('/api/agency/time/entries', {
      method: 'POST',
      body: {
        date: selectedDate.value,
        projectId: newEntry.value.projectId,
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
    await ($fetch as any)(`/api/agency/time/entries/${id}`, { method: 'DELETE' })
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
const timerDescription = ref('')

const startTimer = async () => {
  startingTimer.value = true
  try {
    await $fetch('/api/agency/time/timer/start', {
      method: 'POST',
      body: {
        projectId: timerProjectId.value,
        description: timerDescription.value,
        billable: true
      }
    })
    toast.add({ title: 'Timer started', color: 'success' })
    timerProjectId.value = null
    timerDescription.value = ''
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
    await $fetch('/api/agency/time/timer/stop', { method: 'POST' })
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
            label="Log Time"
            icon="i-lucide-plus"
            color="primary"
            @click="openNewEntry()"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
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
          <div class="flex items-center gap-4">
            <UIcon name="i-lucide-timer" class="w-6 h-6 text-gray-400" />
            <div class="flex-1 flex gap-4">
              <USelectMenu
                v-model="timerProjectId"
                :items="[{ label: 'No project', value: null }, ...projects.map(p => ({ label: p.name, value: p.id }))]"
                placeholder="Select project"
                value-key="value"
                class="w-48"
              />
              <UInput
                v-model="timerDescription"
                placeholder="What are you working on?"
                class="flex-1"
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
          </div>
          <UButton variant="outline" size="sm" label="Today" @click="goToToday" />
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
                          <span class="font-semibold">{{ entry.hours }}h</span>
                          <UButton
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
                        <p v-if="entry.description" class="text-gray-500 truncate">
                          {{ entry.description }}
                        </p>
                      </div>

                      <!-- Add entry button -->
                      <button
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
  </div>
</template>
