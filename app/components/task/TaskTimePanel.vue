<template>
  <div class="space-y-6">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-gray-400 dark:text-neutral-500" />
      <span class="ml-2 text-sm text-gray-500 dark:text-neutral-400">Loading time data...</span>
    </div>

    <template v-else>
      <!-- Summary Cards -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-500 dark:text-neutral-400 mb-1">Logged</p>
          <p class="text-sm font-semibold">{{ totalHours.toFixed(1) }}h</p>
        </div>
        <div class="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-500 dark:text-neutral-400 mb-1">Billable</p>
          <p class="text-sm font-semibold">{{ billableHours.toFixed(1) }}h</p>
        </div>
        <div class="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-500 dark:text-neutral-400 mb-1">Estimated</p>
          <p class="text-sm font-semibold">{{ estimatedHours > 0 ? `${estimatedHours}h` : '—' }}</p>
        </div>
      </div>

      <!-- Progress Bar (estimated vs actual) -->
      <div v-if="estimatedHours > 0" class="space-y-1">
        <div class="flex items-center justify-between text-xs text-gray-500 dark:text-neutral-400">
          <span>Progress</span>
          <span :class="progressColor">{{ progressPercent }}%</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-2">
          <div
            class="h-2 rounded-full transition-all"
            :class="progressBarColor"
            :style="{ width: Math.min(progressPercent, 100) + '%' }"
          />
        </div>
        <p v-if="progressPercent > 100" class="text-xs text-red-500">
          {{ (totalHours - estimatedHours).toFixed(1) }}h over estimate
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-2">
        <UButton
          size="sm"
          icon="i-lucide-plus"
          variant="soft"
          @click="showLogForm = !showLogForm"
        >
          Log Time
        </UButton>
        <UButton
          size="sm"
          icon="i-lucide-play"
          variant="outline"
          @click="startTaskTimer"
          :loading="startingTimer"
        >
          Start Timer
        </UButton>
      </div>

      <!-- Inline Log Time Form -->
      <div v-if="showLogForm" class="border rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-neutral-800">
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Hours" required>
            <UInput
              v-model.number="logForm.hours"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              placeholder="1.0"
            />
          </UFormField>
          <UFormField label="Date">
            <UInput
              v-model="logForm.date"
              type="date"
            />
          </UFormField>
        </div>
        <UFormField label="Description">
          <UInput
            v-model="logForm.description"
            placeholder="What did you work on?"
          />
        </UFormField>
        <UCheckbox v-model="logForm.billable" label="Billable" />
        <div class="flex gap-2">
          <UButton
            size="sm"
            color="primary"
            :loading="submittingLog"
            :disabled="!logForm.hours || logForm.hours <= 0"
            @click="submitLogTime"
          >
            Add Entry
          </UButton>
          <UButton size="sm" variant="ghost" @click="showLogForm = false">Cancel</UButton>
        </div>
      </div>

      <!-- Entries List -->
      <div v-if="timeEntries.length > 0">
        <h4 class="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-3">
          Time Entries ({{ timeEntries.length }})
        </h4>
        <div class="space-y-2">
          <div
            v-for="entry in timeEntries"
            :key="entry.id"
            class="border rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold">{{ entry.hours }}h</span>
                <UBadge v-if="entry.billable" color="success" variant="soft" size="xs">Billable</UBadge>
              </div>
              <span class="text-xs text-gray-400 dark:text-neutral-500">{{ formatEntryDate(entry.date) }}</span>
            </div>
            <p v-if="entry.user?.name" class="text-xs text-gray-500 dark:text-neutral-400">{{ entry.user.name }}</p>
            <p v-if="entry.description" class="text-xs text-gray-500 dark:text-neutral-400 mt-1">{{ entry.description }}</p>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="!showLogForm" class="text-center py-8">
        <UIcon name="i-lucide-clock" class="w-8 h-8 text-gray-300 dark:text-neutral-600 mx-auto mb-3" />
        <p class="text-sm text-gray-500 dark:text-neutral-400">No time logged yet.</p>
        <p class="text-xs text-gray-400 dark:text-neutral-500 mt-1">Use "Log Time" or "Start Timer" above.</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { format } from 'date-fns'

const props = defineProps<{
  taskId: string
}>()

const toast = useToast()

const loading = ref(true)
const timeEntries = ref<any[]>([])
const estimatedHours = ref(0)
const showLogForm = ref(false)
const submittingLog = ref(false)
const startingTimer = ref(false)

const logForm = ref({
  hours: 1,
  date: format(new Date(), 'yyyy-MM-dd'),
  description: '',
  billable: true
})

// Computed
const totalHours = computed(() => timeEntries.value.reduce((sum, e) => sum + e.hours, 0))
const billableHours = computed(() => timeEntries.value.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0))

const progressPercent = computed(() => {
  if (estimatedHours.value <= 0) return 0
  return Math.round((totalHours.value / estimatedHours.value) * 100)
})

const progressColor = computed(() => {
  if (progressPercent.value > 100) return 'text-red-500 font-semibold'
  if (progressPercent.value > 80) return 'text-amber-500'
  return 'text-emerald-500'
})

const progressBarColor = computed(() => {
  if (progressPercent.value > 100) return 'bg-red-500'
  if (progressPercent.value > 80) return 'bg-amber-500'
  return 'bg-emerald-500'
})

// Fetch
async function fetchTimeEntries() {
  loading.value = true
  try {
    const data = await $fetch<any>('/api/agency/time/entries', {
      query: { taskId: props.taskId, limit: 100 }
    })
    timeEntries.value = data.entries || []
  } catch {
    timeEntries.value = []
  }

  // Fetch task details for estimated hours
  try {
    const task = await $fetch<any>(`/api/agency/tasks/${props.taskId}`)
    estimatedHours.value = Number(task.estimatedHours || task.estimated_hours || 0)
  } catch {
    // Non-critical
  }

  loading.value = false
}

async function submitLogTime() {
  if (!logForm.value.hours || logForm.value.hours <= 0) return
  submittingLog.value = true
  try {
    await $fetch('/api/agency/time/entries', {
      method: 'POST',
      body: {
        taskId: props.taskId,
        date: logForm.value.date,
        hours: logForm.value.hours,
        description: logForm.value.description,
        billable: logForm.value.billable
      }
    })
    toast.add({ title: 'Time logged', color: 'success' })
    showLogForm.value = false
    logForm.value = {
      hours: 1,
      date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      billable: true
    }
    await fetchTimeEntries()
  } catch (err: any) {
    toast.add({ title: 'Failed to log time', description: err.message, color: 'error' })
  } finally {
    submittingLog.value = false
  }
}

async function startTaskTimer() {
  startingTimer.value = true
  try {
    await $fetch('/api/agency/time/timer/start', {
      method: 'POST',
      body: {
        taskId: props.taskId,
        billable: true
      }
    })
    toast.add({ title: 'Timer started for this task', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to start timer', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    startingTimer.value = false
  }
}

function formatEntryDate(date: string) {
  try {
    return format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')
  } catch {
    return date
  }
}

watch(() => props.taskId, () => fetchTimeEntries(), { immediate: true })
</script>
