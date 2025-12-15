<script setup lang="ts">
import type { Task, KanbanFilters, TaskPriority } from '~/types'

const props = defineProps<{
  departmentId?: string
  projectId?: string
  filters?: KanbanFilters
}>()

const emit = defineEmits<{
  taskClick: [task: Task]
}>()

// Date range for timeline
const today = new Date()
const startDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const endDate = ref(new Date(today.getFullYear(), today.getMonth() + 2, 0))

// Zoom level
type ZoomLevel = 'day' | 'week' | 'month'
const zoomLevel = ref<ZoomLevel>('week')

// Fetch tasks
const { data: tasksData, pending: tasksPending } = await useFetch('/api/agency/tasks', {
  query: computed(() => ({
    departmentId: props.departmentId,
    projectId: props.projectId,
    assigneeId: props.filters?.assigneeId,
    priority: props.filters?.priority,
    search: props.filters?.search,
    includeCompleted: props.filters?.showCompleted ?? false,
    limit: 200
  }))
})

const tasks = computed(() => (tasksData.value?.tasks as Task[]) || [])

// Generate date columns based on zoom level
const dateColumns = computed(() => {
  const columns: { date: Date; label: string; isToday: boolean; isWeekend: boolean }[] = []
  const current = new Date(startDate.value)
  const end = new Date(endDate.value)
  const todayStr = today.toDateString()

  while (current <= end) {
    const isWeekend = current.getDay() === 0 || current.getDay() === 6
    let label: string

    switch (zoomLevel.value) {
      case 'day':
        label = current.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
        columns.push({
          date: new Date(current),
          label,
          isToday: current.toDateString() === todayStr,
          isWeekend
        })
        current.setDate(current.getDate() + 1)
        break
      case 'week':
        label = current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        columns.push({
          date: new Date(current),
          label,
          isToday: current.toDateString() === todayStr,
          isWeekend: false
        })
        current.setDate(current.getDate() + 7)
        break
      case 'month':
        label = current.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
        columns.push({
          date: new Date(current),
          label,
          isToday: current.getMonth() === today.getMonth() && current.getFullYear() === today.getFullYear(),
          isWeekend: false
        })
        current.setMonth(current.getMonth() + 1)
        break
    }
  }

  return columns
})

// Calculate task position on timeline
function getTaskPosition(task: Task) {
  const taskStart = task.startDate ? new Date(task.startDate) : new Date(task.createdAt)
  const taskEnd = task.dueDate ? new Date(task.dueDate) : new Date(taskStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const timelineStart = startDate.value.getTime()
  const timelineEnd = endDate.value.getTime()
  const timelineRange = timelineEnd - timelineStart

  const left = Math.max(0, ((taskStart.getTime() - timelineStart) / timelineRange) * 100)
  const right = Math.min(100, ((taskEnd.getTime() - timelineStart) / timelineRange) * 100)
  const width = Math.max(2, right - left) // Minimum width of 2%

  return {
    left: `${left}%`,
    width: `${width}%`
  }
}

const priorityColors: Record<TaskPriority, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e'
}

function navigatePrevious() {
  switch (zoomLevel.value) {
    case 'day':
      startDate.value = new Date(startDate.value.getTime() - 7 * 24 * 60 * 60 * 1000)
      endDate.value = new Date(endDate.value.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'week':
      startDate.value = new Date(startDate.value.getFullYear(), startDate.value.getMonth() - 1, 1)
      endDate.value = new Date(endDate.value.getFullYear(), endDate.value.getMonth() - 1, 0)
      break
    case 'month':
      startDate.value = new Date(startDate.value.getFullYear(), startDate.value.getMonth() - 3, 1)
      endDate.value = new Date(endDate.value.getFullYear(), endDate.value.getMonth() - 3, 0)
      break
  }
}

function navigateNext() {
  switch (zoomLevel.value) {
    case 'day':
      startDate.value = new Date(startDate.value.getTime() + 7 * 24 * 60 * 60 * 1000)
      endDate.value = new Date(endDate.value.getTime() + 7 * 24 * 60 * 60 * 1000)
      break
    case 'week':
      startDate.value = new Date(startDate.value.getFullYear(), startDate.value.getMonth() + 1, 1)
      endDate.value = new Date(endDate.value.getFullYear(), endDate.value.getMonth() + 3, 0)
      break
    case 'month':
      startDate.value = new Date(startDate.value.getFullYear(), startDate.value.getMonth() + 3, 1)
      endDate.value = new Date(endDate.value.getFullYear(), endDate.value.getMonth() + 6, 0)
      break
  }
}

function goToToday() {
  const now = new Date()
  startDate.value = new Date(now.getFullYear(), now.getMonth(), 1)
  endDate.value = new Date(now.getFullYear(), now.getMonth() + 2, 0)
}

const zoomOptions = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' }
]
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Timeline controls -->
    <div class="flex items-center justify-between p-4 border-b border-default">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          variant="ghost"
          size="sm"
          @click="navigatePrevious"
        />
        <UButton
          variant="outline"
          size="sm"
          @click="goToToday"
        >
          Today
        </UButton>
        <UButton
          icon="i-lucide-chevron-right"
          variant="ghost"
          size="sm"
          @click="navigateNext"
        />
      </div>

      <div class="text-sm font-medium">
        {{ startDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}
        -
        {{ endDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}
      </div>

      <USelectMenu
        v-model="zoomLevel"
        :items="zoomOptions"
        value-key="value"
        class="w-28"
        size="sm"
      />
    </div>

    <!-- Loading state -->
    <template v-if="tasksPending">
      <div class="p-4">
        <USkeleton class="h-8 w-full mb-4" />
        <USkeleton v-for="i in 5" :key="i" class="h-12 w-full mb-2" />
      </div>
    </template>

    <!-- Timeline -->
    <template v-else>
      <div class="flex-1 overflow-auto">
        <!-- Header with dates -->
        <div class="sticky top-0 bg-default z-10 flex border-b border-default">
          <div class="w-64 flex-shrink-0 p-2 border-r border-default font-medium text-sm">
            Task
          </div>
          <div class="flex-1 flex">
            <div
              v-for="col in dateColumns"
              :key="col.date.toISOString()"
              class="flex-1 min-w-[60px] p-2 text-center text-xs border-r border-default last:border-r-0"
              :class="{
                'bg-primary/10': col.isToday,
                'bg-muted/30': col.isWeekend
              }"
            >
              {{ col.label }}
            </div>
          </div>
        </div>

        <!-- Task rows -->
        <div v-for="task in tasks" :key="task.id" class="flex border-b border-default hover:bg-muted/20 min-h-[48px]">
          <!-- Task info -->
          <div
            class="w-64 flex-shrink-0 p-2 border-r border-default cursor-pointer"
            @click="emit('taskClick', task)"
          >
            <div class="text-sm font-medium truncate">{{ task.title }}</div>
            <div class="text-xs text-muted flex items-center gap-2">
              <span v-if="task.assignee">{{ task.assignee.name }}</span>
              <UBadge
                :style="{ backgroundColor: priorityColors[task.priority] + '20', color: priorityColors[task.priority] }"
                variant="subtle"
                size="xs"
              >
                {{ task.priority }}
              </UBadge>
            </div>
          </div>

          <!-- Timeline bar -->
          <div class="flex-1 relative py-2 px-1">
            <div
              class="absolute h-6 rounded cursor-pointer transition-all hover:brightness-110"
              :style="{
                ...getTaskPosition(task),
                backgroundColor: task.status?.color || '#6B7280',
                top: '50%',
                transform: 'translateY(-50%)'
              }"
              @click="emit('taskClick', task)"
            >
              <div class="px-2 text-xs text-white truncate leading-6">
                {{ task.title }}
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="tasks.length === 0" class="flex items-center justify-center p-12">
          <div class="text-center">
            <UIcon name="i-lucide-gantt-chart" class="h-12 w-12 text-muted mx-auto mb-3" />
            <p class="text-muted">No tasks to display on timeline</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
