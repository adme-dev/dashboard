<script setup lang="ts">
/**
 * Timeline/Gantt View for Tasks
 * Visual timeline representation of tasks with dependencies
 */
import { addDays, differenceInDays, format, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval, startOfMonth, endOfMonth } from 'date-fns'

definePageMeta({})

// Filters
const departmentId = ref<string>('all')
const projectId = ref<string>('all')
const zoomLevel = ref<'day' | 'week' | 'month'>('week')
const showCompleted = ref(true)

// Date range - default to current month
const dateRange = ref({
  start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  end: format(endOfMonth(addDays(new Date(), 60)), 'yyyy-MM-dd') // 2 months ahead
})

// Fetch departments for filter
const { data: departmentsData } = await useFetch('/api/agency/departments')
const departments = computed(() => (departmentsData.value as any[]) || [])

// Fetch projects for filter
const { data: projectsData } = await useFetch('/api/agency/projects/summary')
const projects = computed(() => ((projectsData.value as any)?.projects as any[]) || [])

// Fetch timeline data
const { data: timelineData, pending, refresh } = await useFetch('/api/agency/tasks/timeline', {
  query: computed(() => ({
    departmentId: departmentId.value !== 'all' ? departmentId.value : undefined,
    projectId: projectId.value !== 'all' ? projectId.value : undefined,
    startDate: dateRange.value.start,
    endDate: dateRange.value.end,
    includeCompleted: showCompleted.value
  }))
})

const tasks = computed(() => (timelineData.value as any)?.tasks || [])
const summary = computed(() => (timelineData.value as any)?.summary || {})

// Generate date columns based on zoom level
const dateColumns = computed(() => {
  const start = new Date(dateRange.value.start)
  const end = new Date(dateRange.value.end)

  if (zoomLevel.value === 'day') {
    return eachDayOfInterval({ start, end }).map(date => ({
      date,
      label: format(date, 'EEE d'),
      width: 40
    }))
  } else if (zoomLevel.value === 'week') {
    return eachWeekOfInterval({ start, end }).map(weekStart => ({
      date: weekStart,
      label: format(weekStart, 'MMM d'),
      width: 120
    }))
  } else {
    // Month view
    const months: { date: Date; label: string; width: number }[] = []
    let current = startOfMonth(start)
    while (current <= end) {
      months.push({
        date: current,
        label: format(current, 'MMM yyyy'),
        width: 200
      })
      current = startOfMonth(addDays(endOfMonth(current), 1))
    }
    return months
  }
})

// Calculate total timeline width
const timelineWidth = computed(() => {
  return dateColumns.value.reduce((sum, col) => sum + col.width, 0)
})

// Calculate task bar position and width
const getTaskBarStyle = (task: any) => {
  if (!task.startDate && !task.endDate) return null

  const timelineStart = new Date(dateRange.value.start)
  const timelineEnd = new Date(dateRange.value.end)

  const taskStart = task.startDate ? new Date(task.startDate) : new Date(task.endDate)
  const taskEnd = task.endDate ? new Date(task.endDate) : taskStart

  // Clamp to timeline range
  const visibleStart = taskStart < timelineStart ? timelineStart : taskStart
  const visibleEnd = taskEnd > timelineEnd ? timelineEnd : taskEnd

  // Calculate position
  const totalDays = differenceInDays(timelineEnd, timelineStart) || 1
  const startOffset = differenceInDays(visibleStart, timelineStart)
  const duration = Math.max(1, differenceInDays(visibleEnd, visibleStart) + 1)

  const leftPercent = (startOffset / totalDays) * 100
  const widthPercent = (duration / totalDays) * 100

  return {
    left: `${leftPercent}%`,
    width: `${Math.max(2, widthPercent)}%`
  }
}

// Priority colors
const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500'
}

// Navigate timeline
const scrollContainer = ref<HTMLElement | null>(null)

const scrollToToday = () => {
  if (!scrollContainer.value) return
  const today = new Date()
  const timelineStart = new Date(dateRange.value.start)
  const totalDays = differenceInDays(new Date(dateRange.value.end), timelineStart) || 1
  const todayOffset = differenceInDays(today, timelineStart)
  const scrollPosition = (todayOffset / totalDays) * timelineWidth.value - scrollContainer.value.clientWidth / 2
  scrollContainer.value.scrollLeft = Math.max(0, scrollPosition)
}

onMounted(() => {
  nextTick(() => scrollToToday())
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">Timeline View</h1>
        <p class="text-sm text-muted">Gantt-style view of tasks and milestones</p>
      </div>

      <div class="flex items-center gap-3">
        <!-- Stats -->
        <div class="flex items-center gap-4 mr-4 text-sm">
          <span class="text-muted">
            <span class="font-medium text-highlighted">{{ summary.totalTasks || 0 }}</span> tasks
          </span>
          <span class="text-muted">
            <span class="font-medium text-success-600">{{ summary.completedTasks || 0 }}</span> completed
          </span>
          <span v-if="summary.blockedTasks" class="text-muted">
            <span class="font-medium text-error-600">{{ summary.blockedTasks }}</span> blocked
          </span>
        </div>

        <UButton
          icon="i-lucide-calendar"
          label="Today"
          size="sm"
          color="neutral"
          variant="outline"
          @click="scrollToToday"
        />
      </div>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-4 p-4 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700">
      <UFormField label="Department" class="w-48">
        <USelect
          v-model="departmentId"
          :items="[{ value: 'all', label: 'All Departments' }, ...departments.map((d: any) => ({ value: d.id, label: d.name }))]"
          value-key="value"
          placeholder="All Departments"
        />
      </UFormField>

      <UFormField label="Project" class="w-48">
        <USelect
          v-model="projectId"
          :items="[{ value: 'all', label: 'All Projects' }, ...projects.map((p: any) => ({ value: p.id, label: p.name }))]"
          value-key="value"
          placeholder="All Projects"
        />
      </UFormField>

      <UFormField label="Zoom" class="w-32">
        <USelect
          v-model="zoomLevel"
          :items="[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' }
          ]"
          value-key="value"
        />
      </UFormField>

      <UCheckbox v-model="showCompleted" label="Show completed" class="ml-4" />

      <div class="flex-1" />

      <UButton
        icon="i-lucide-refresh-cw"
        size="sm"
        color="neutral"
        variant="ghost"
        :loading="pending"
        @click="refresh()"
      />
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <!-- Timeline -->
    <div v-else class="flex-1 overflow-hidden flex">
      <!-- Task names column (fixed) -->
      <div class="w-64 flex-shrink-0 border-r border-neutral-200 dark:border-neutral-700 overflow-y-auto">
        <!-- Header -->
        <div class="h-12 border-b border-neutral-200 dark:border-neutral-700 px-3 flex items-center bg-neutral-50 dark:bg-neutral-900/50 sticky top-0 z-10">
          <span class="text-sm font-medium text-muted">Task Name</span>
        </div>

        <!-- Task rows -->
        <div
          v-for="task in tasks"
          :key="task.id"
          class="h-10 border-b border-neutral-100 dark:border-neutral-800 px-3 flex items-center gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer"
        >
          <div
            class="w-2 h-2 rounded-full flex-shrink-0"
            :class="priorityColors[task.priority]"
          />
          <span class="text-sm truncate flex-1">{{ task.title }}</span>
          <UIcon
            v-if="task.isBlocked"
            name="i-lucide-ban"
            class="w-3.5 h-3.5 text-error-500 flex-shrink-0"
          />
          <UIcon
            v-if="task.isCompleted"
            name="i-lucide-check-circle"
            class="w-3.5 h-3.5 text-success-500 flex-shrink-0"
          />
        </div>

        <!-- Empty state -->
        <div v-if="tasks.length === 0" class="p-8 text-center">
          <UIcon name="i-lucide-calendar-x" class="w-12 h-12 text-muted mx-auto mb-3" />
          <p class="text-muted">No tasks with dates found</p>
        </div>
      </div>

      <!-- Timeline grid (scrollable) -->
      <div
        ref="scrollContainer"
        class="flex-1 overflow-x-auto overflow-y-auto"
      >
        <div :style="{ minWidth: `${timelineWidth}px` }">
          <!-- Date header -->
          <div class="h-12 border-b border-neutral-200 dark:border-neutral-700 flex sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900/50">
            <div
              v-for="col in dateColumns"
              :key="col.label"
              class="border-r border-neutral-200 dark:border-neutral-700 px-2 flex items-center justify-center"
              :style="{ width: `${col.width}px` }"
            >
              <span class="text-xs text-muted">{{ col.label }}</span>
            </div>
          </div>

          <!-- Task rows with bars -->
          <div
            v-for="task in tasks"
            :key="task.id"
            class="h-10 border-b border-neutral-100 dark:border-neutral-800 relative"
          >
            <!-- Grid lines -->
            <div class="absolute inset-0 flex">
              <div
                v-for="col in dateColumns"
                :key="col.label"
                class="border-r border-neutral-100 dark:border-neutral-800"
                :style="{ width: `${col.width}px` }"
              />
            </div>

            <!-- Task bar -->
            <div
              v-if="getTaskBarStyle(task)"
              class="absolute top-1.5 h-7 rounded-md flex items-center px-2 text-white text-xs truncate shadow-sm cursor-pointer transition-all hover:opacity-90"
              :style="getTaskBarStyle(task)"
              :class="[
                task.isCompleted ? 'bg-success-500' : task.isBlocked ? 'bg-error-500' : task.status?.color ? '' : priorityColors[task.priority],
              ]"
              :style-color="task.status?.color"
            >
              <!-- Progress bar inside -->
              <div
                v-if="!task.isCompleted && task.progressPercentage > 0"
                class="absolute inset-y-0 left-0 bg-white/20 rounded-l-md"
                :style="{ width: `${task.progressPercentage}%` }"
              />
              <span class="relative z-10 truncate">{{ task.title }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex items-center gap-6 p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 text-xs text-muted">
      <span class="font-medium">Priority:</span>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full bg-red-500" />
        <span>Urgent</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full bg-orange-500" />
        <span>High</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full bg-yellow-500" />
        <span>Medium</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full bg-blue-500" />
        <span>Low</span>
      </div>
      <span class="mx-4">|</span>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full bg-success-500" />
        <span>Completed</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full bg-error-500" />
        <span>Blocked</span>
      </div>
    </div>
  </div>
</template>
