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
}>()

// Current month/year
const today = new Date()
const currentDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))

// View mode
type ViewMode = 'month' | 'week'
const viewMode = ref<ViewMode>('month')

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

// Get tasks for a specific date
function getTasksForDate(date: Date): Task[] {
  const dateStr = date.toISOString().split('T')[0]
  return tasks.value.filter(task => {
    if (!task.dueDate) return false
    return task.dueDate.split('T')[0] === dateStr
  })
}

// Generate calendar days
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
  newDate.setMonth(newDate.getMonth() - 1)
  currentDate.value = newDate
}

function navigateNext() {
  const newDate = new Date(currentDate.value)
  newDate.setMonth(newDate.getMonth() + 1)
  currentDate.value = newDate
}

function goToToday() {
  currentDate.value = new Date(today.getFullYear(), today.getMonth(), 1)
}

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Calendar controls -->
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

      <h2 class="text-lg font-semibold">
        {{ currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}
      </h2>

      <UButtonGroup>
        <UButton
          size="sm"
          :variant="viewMode === 'month' ? 'solid' : 'ghost'"
          @click="viewMode = 'month'"
        >
          Month
        </UButton>
        <UButton
          size="sm"
          :variant="viewMode === 'week' ? 'solid' : 'ghost'"
          @click="viewMode = 'week'"
        >
          Week
        </UButton>
      </UButtonGroup>
    </div>

    <!-- Loading state -->
    <template v-if="tasksPending">
      <div class="p-4">
        <div class="grid grid-cols-7 gap-1">
          <USkeleton v-for="i in 35" :key="i" class="h-24" />
        </div>
      </div>
    </template>

    <!-- Calendar grid -->
    <template v-else>
      <div class="flex-1 overflow-auto p-4">
        <!-- Week day headers -->
        <div class="grid grid-cols-7 gap-1 mb-1">
          <div
            v-for="day in weekDays"
            :key="day"
            class="text-center text-sm font-medium text-muted py-2"
          >
            {{ day }}
          </div>
        </div>

        <!-- Calendar weeks -->
        <div class="grid gap-1">
          <div
            v-for="(week, weekIndex) in weeks"
            :key="weekIndex"
            class="grid grid-cols-7 gap-1"
          >
            <div
              v-for="day in week"
              :key="day.date.toISOString()"
              class="min-h-[100px] border border-default rounded-lg p-1 transition-colors"
              :class="{
                'bg-primary/5 border-primary': day.isToday,
                'opacity-50': !day.isCurrentMonth,
                'hover:bg-muted/30 cursor-pointer': day.isCurrentMonth
              }"
              @click="emit('createTask', day.date.toISOString().split('T')[0] || '')"
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
                  class="text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:brightness-110"
                  :style="{
                    backgroundColor: task.status?.color || '#6B7280',
                    color: 'white'
                  }"
                  @click.stop="emit('taskClick', task)"
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
        <div class="mt-4 p-4 bg-muted/30 rounded-lg">
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
      </div>
    </template>
  </div>
</template>
