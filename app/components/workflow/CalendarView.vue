<script setup lang="ts">
import type { Task, KanbanFilters, TaskPriority } from '~/types'

const props = defineProps<{
  departmentId?: string
  projectId?: string
  filters?: KanbanFilters
}>()

const emit = defineEmits<{
  taskClick: [task: Task]
  createTask: [date: string]
  taskReschedule: [taskId: string, newDate: string]
}>()

const toast = useToast()

// Current month/year
const today = new Date()
const currentDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))

// View mode
type ViewMode = 'month' | 'week'
const viewMode = ref<ViewMode>('month')

// Drag state for rescheduling
const draggedTask = ref<Task | null>(null)
const dragOverDate = ref<string | null>(null)

// Fetch tasks with reactive query
const { data: tasksData, pending: tasksPending, refresh: refreshTasks } = await useFetch('/api/agency/tasks', {
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

// Get tasks for a specific date
function getTasksForDate(date: Date): Task[] {
  const dateStr = date.toISOString().split('T')[0]
  return tasks.value.filter(task => {
    if (!task.dueDate) return false
    return task.dueDate.split('T')[0] === dateStr
  })
}

// Week view: get current week days
const weekDays = computed(() => {
  if (viewMode.value === 'month') {
    return calendarDays.value
  }

  // For week view, get the week containing current date
  const startOfWeek = new Date(currentDate.value)
  const dayOfWeek = startOfWeek.getDay()
  startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek)

  const days: { date: Date; isCurrentMonth: boolean; isToday: boolean; tasks: Task[] }[] = []
  const todayStr = today.toDateString()

  for (let i = 0; i < 7; i++) {
    const current = new Date(startOfWeek)
    current.setDate(startOfWeek.getDate() + i)
    days.push({
      date: new Date(current),
      isCurrentMonth: current.getMonth() === currentDate.value.getMonth(),
      isToday: current.toDateString() === todayStr,
      tasks: getTasksForDate(current)
    })
  }

  return days
})

// Generate calendar days for month view
const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()

  // First day of month
  const firstDay = new Date(year, month, 1)
  // Last day of month
  const lastDay = new Date(year, month + 1, 0)

  // Start from Sunday of the week containing the first day
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - startDate.getDay())

  // End on Saturday of the week containing the last day
  const endDate = new Date(lastDay)
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()))

  const days: { date: Date; isCurrentMonth: boolean; isToday: boolean; tasks: Task[] }[] = []
  const current = new Date(startDate)
  const todayStr = today.toDateString()

  while (current <= endDate) {
    days.push({
      date: new Date(current),
      isCurrentMonth: current.getMonth() === month,
      isToday: current.toDateString() === todayStr,
      tasks: getTasksForDate(current)
    })
    current.setDate(current.getDate() + 1)
  }

  return days
})

// Generate weeks for grid display
const weeks = computed(() => {
  const result: typeof calendarDays.value[] = []
  for (let i = 0; i < calendarDays.value.length; i += 7) {
    result.push(calendarDays.value.slice(i, i + 7))
  }
  return result
})

const priorityColors: Record<TaskPriority, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e'
}

function navigatePrevious() {
  const newDate = new Date(currentDate.value)
  if (viewMode.value === 'week') {
    newDate.setDate(newDate.getDate() - 7)
  } else {
    newDate.setMonth(newDate.getMonth() - 1)
  }
  currentDate.value = newDate
}

function navigateNext() {
  const newDate = new Date(currentDate.value)
  if (viewMode.value === 'week') {
    newDate.setDate(newDate.getDate() + 7)
  } else {
    newDate.setMonth(newDate.getMonth() + 1)
  }
  currentDate.value = newDate
}

function goToToday() {
  currentDate.value = new Date(today.getFullYear(), today.getMonth(), today.getDate())
}

const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Drag and drop handlers for rescheduling
function handleDragStart(event: DragEvent, task: Task) {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', task.id)
  }
  draggedTask.value = task
}

function handleDragEnd() {
  draggedTask.value = null
  dragOverDate.value = null
}

function handleDragOver(event: DragEvent, dateStr: string) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverDate.value = dateStr
}

function handleDragLeave() {
  dragOverDate.value = null
}

async function handleDrop(event: DragEvent, dateStr: string) {
  event.preventDefault()

  if (!draggedTask.value) return

  const task = draggedTask.value
  const currentDueDate = task.dueDate?.split('T')[0]

  // Don't do anything if dropping on the same date
  if (currentDueDate === dateStr) {
    handleDragEnd()
    return
  }

  try {
    await $fetch(`/api/agency/tasks/${task.id}`, {
      method: 'PATCH',
      body: { dueDate: dateStr }
    })

    toast.add({
      title: 'Task rescheduled',
      description: `"${task.title}" moved to ${new Date(dateStr).toLocaleDateString()}`,
      color: 'success'
    })

    emit('taskReschedule', task.id, dateStr)
    refreshTasks()
  } catch (error) {
    toast.add({
      title: 'Failed to reschedule task',
      color: 'error'
    })
  }

  handleDragEnd()
}

// Get header text based on view mode
const headerText = computed(() => {
  if (viewMode.value === 'week') {
    const start = weekDays.value[0]?.date
    const end = weekDays.value[6]?.date
    if (start && end) {
      return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
  }
  return currentDate.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
})

// Expose refresh method
defineExpose({ refreshTasks })
</script>

<template>
  <div class="h-full flex flex-col" role="application" aria-label="Calendar view">
    <!-- Calendar controls -->
    <div class="flex items-center justify-between p-4 border-b border-default">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          variant="ghost"
          size="sm"
          :aria-label="viewMode === 'week' ? 'Previous week' : 'Previous month'"
          @click="navigatePrevious"
        />
        <UButton
          variant="outline"
          size="sm"
          aria-label="Go to today"
          @click="goToToday"
        >
          Today
        </UButton>
        <UButton
          icon="i-lucide-chevron-right"
          variant="ghost"
          size="sm"
          :aria-label="viewMode === 'week' ? 'Next week' : 'Next month'"
          @click="navigateNext"
        />
      </div>

      <h2 class="text-lg font-semibold" aria-live="polite">
        {{ headerText }}
      </h2>

      <UButtonGroup aria-label="Calendar view mode">
        <UButton
          size="sm"
          :variant="viewMode === 'month' ? 'solid' : 'ghost'"
          aria-pressed="viewMode === 'month'"
          @click="viewMode = 'month'"
        >
          Month
        </UButton>
        <UButton
          size="sm"
          :variant="viewMode === 'week' ? 'solid' : 'ghost'"
          aria-pressed="viewMode === 'week'"
          @click="viewMode = 'week'"
        >
          Week
        </UButton>
      </UButtonGroup>
    </div>

    <!-- Loading state -->
    <template v-if="tasksPending">
      <div class="p-4" aria-busy="true" aria-label="Loading calendar">
        <div class="grid grid-cols-7 gap-1">
          <USkeleton v-for="i in 35" :key="i" class="h-24" />
        </div>
      </div>
    </template>

    <!-- Calendar grid -->
    <template v-else>
      <div class="flex-1 overflow-auto p-4">
        <!-- Week day headers -->
        <div class="grid grid-cols-7 gap-1 mb-1" role="row">
          <div
            v-for="day in weekDayNames"
            :key="day"
            class="text-center text-sm font-medium text-muted py-2"
            role="columnheader"
          >
            {{ day }}
          </div>
        </div>

        <!-- Week View -->
        <div v-if="viewMode === 'week'" class="grid grid-cols-7 gap-1" role="grid" aria-label="Week view">
          <div
            v-for="day in weekDays"
            :key="day.date.toISOString()"
            class="min-h-[300px] border border-default rounded-lg p-2 transition-colors"
            :class="{
              'bg-primary/5 border-primary': day.isToday,
              'bg-blue-50 dark:bg-blue-900/20 border-blue-400': dragOverDate === day.date.toISOString().split('T')[0],
              'hover:bg-muted/30 cursor-pointer': true
            }"
            role="gridcell"
            :aria-label="`${day.date.toLocaleDateString()}, ${day.tasks.length} tasks`"
            @click="emit('createTask', day.date.toISOString().split('T')[0] || '')"
            @dragover="handleDragOver($event, day.date.toISOString().split('T')[0] || '')"
            @dragleave="handleDragLeave"
            @drop="handleDrop($event, day.date.toISOString().split('T')[0] || '')"
          >
            <!-- Day header -->
            <div class="flex items-center justify-between mb-2">
              <div
                class="text-sm font-medium"
                :class="{
                  'text-primary': day.isToday
                }"
              >
                {{ day.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) }}
              </div>
              <span v-if="day.tasks.length > 0" class="text-xs text-muted">
                {{ day.tasks.length }} task{{ day.tasks.length !== 1 ? 's' : '' }}
              </span>
            </div>

            <!-- Tasks for this day (scrollable in week view) -->
            <div class="space-y-1 max-h-[250px] overflow-y-auto">
              <div
                v-for="task in day.tasks"
                :key="task.id"
                class="text-xs px-2 py-1.5 rounded cursor-grab hover:brightness-110 transition-all"
                :class="{
                  'opacity-50 cursor-grabbing': draggedTask?.id === task.id
                }"
                :style="{
                  backgroundColor: task.status?.color || '#6B7280',
                  color: 'white'
                }"
                draggable="true"
                role="button"
                :aria-label="`Task: ${task.title}, priority: ${task.priority}`"
                @click.stop="emit('taskClick', task)"
                @dragstart="handleDragStart($event, task)"
                @dragend="handleDragEnd"
              >
                <div class="flex items-center gap-1">
                  <UIcon
                    v-if="task.priority === 'urgent'"
                    name="i-lucide-alert-circle"
                    class="w-3 h-3 flex-shrink-0"
                  />
                  <span class="truncate">{{ task.title }}</span>
                </div>
                <div v-if="task.assignee" class="text-xs opacity-75 truncate mt-0.5">
                  {{ task.assignee.name }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Month View -->
        <div v-else class="grid gap-1" role="grid" aria-label="Month view">
          <div
            v-for="(week, weekIndex) in weeks"
            :key="weekIndex"
            class="grid grid-cols-7 gap-1"
            role="row"
          >
            <div
              v-for="day in week"
              :key="day.date.toISOString()"
              class="min-h-[100px] border border-default rounded-lg p-1 transition-colors"
              :class="{
                'bg-primary/5 border-primary': day.isToday,
                'opacity-50': !day.isCurrentMonth,
                'bg-blue-50 dark:bg-blue-900/20 border-blue-400': dragOverDate === day.date.toISOString().split('T')[0],
                'hover:bg-muted/30 cursor-pointer': day.isCurrentMonth
              }"
              role="gridcell"
              :aria-label="`${day.date.toLocaleDateString()}, ${day.tasks.length} tasks`"
              @click="emit('createTask', day.date.toISOString().split('T')[0] || '')"
              @dragover="handleDragOver($event, day.date.toISOString().split('T')[0] || '')"
              @dragleave="handleDragLeave"
              @drop="handleDrop($event, day.date.toISOString().split('T')[0] || '')"
            >
              <!-- Day number -->
              <div
                class="text-sm font-medium mb-1"
                :class="{
                  'text-primary': day.isToday,
                  'text-muted': !day.isCurrentMonth
                }"
              >
                {{ day.date.getDate() }}
              </div>

              <!-- Tasks for this day -->
              <div class="space-y-0.5">
                <div
                  v-for="task in day.tasks.slice(0, 3)"
                  :key="task.id"
                  class="text-xs px-1.5 py-0.5 rounded truncate cursor-grab hover:brightness-110"
                  :class="{
                    'opacity-50 cursor-grabbing': draggedTask?.id === task.id
                  }"
                  :style="{
                    backgroundColor: task.status?.color || '#6B7280',
                    color: 'white'
                  }"
                  draggable="true"
                  role="button"
                  :aria-label="`Task: ${task.title}`"
                  @click.stop="emit('taskClick', task)"
                  @dragstart="handleDragStart($event, task)"
                  @dragend="handleDragEnd"
                >
                  {{ task.title }}
                </div>
                <div
                  v-if="day.tasks.length > 3"
                  class="text-xs text-muted px-1"
                >
                  +{{ day.tasks.length - 3 }} more
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Task count summary -->
        <div class="mt-4 p-4 bg-muted/30 rounded-lg" role="status" aria-live="polite">
          <div class="flex items-center gap-6 text-sm">
            <div>
              <span class="font-medium">{{ tasks.length }}</span>
              <span class="text-muted ml-1">total tasks</span>
            </div>
            <div>
              <span class="font-medium">{{ tasks.filter(t => t.dueDate && new Date(t.dueDate) < today && !t.completedAt).length }}</span>
              <span class="text-red-500 ml-1">overdue</span>
            </div>
            <div>
              <span class="font-medium">{{ tasks.filter(t => t.dueDate && t.dueDate.split('T')[0] === today.toISOString().split('T')[0]).length }}</span>
              <span class="text-muted ml-1">due today</span>
            </div>
          </div>
        </div>

        <!-- Drag hint -->
        <p class="text-xs text-muted text-center mt-2">
          <UIcon name="i-lucide-grip-vertical" class="w-3 h-3 inline-block mr-1" />
          Drag tasks to reschedule them
        </p>
      </div>
    </template>
  </div>
</template>
