<script setup lang="ts">
import type { Task, KanbanFilters, TaskPriority } from '~/types'

const props = defineProps<{
  departmentId?: string
  workspaceId?: string
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

// Show dependencies toggle
const showDependencies = ref(true)

// Container ref for dependency line calculations
const timelineContainer = ref<HTMLElement | null>(null)

// Fetch tasks
const { data: tasksData, pending: tasksPending, refresh: refreshTasks } = useLazyFetch('/api/agency/tasks/timeline', {
  query: computed(() => ({
    departmentId: props.departmentId,
    workspaceId: !props.departmentId ? props.workspaceId : undefined,
    projectId: props.projectId,
    startDate: startDate.value.toISOString().split('T')[0],
    endDate: endDate.value.toISOString().split('T')[0],
    includeCompleted: props.filters?.showCompleted ? 'true' : 'false'
  }))
})

const tasks = computed(() => (tasksData.value?.tasks as Task[]) || [])

// Group tasks by project for better visualization
const groupBy = ref<'none' | 'project' | 'assignee'>('none')

const groupedTasks = computed(() => {
  if (groupBy.value === 'none') {
    return [{ name: 'All Tasks', tasks: tasks.value }]
  }

  const groups: Record<string, { name: string; tasks: Task[] }> = {}

  tasks.value.forEach(task => {
    let key: string
    let name: string

    if (groupBy.value === 'project') {
      key = task.projectId || 'no-project'
      name = task.project?.name || 'No Project'
    } else {
      key = task.assigneeId || 'unassigned'
      name = task.assignee?.name || 'Unassigned'
    }

    if (!groups[key]) {
      groups[key] = { name, tasks: [] }
    }
    groups[key].tasks.push(task)
  })

  return Object.values(groups)
})

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
    width: `${width}%`,
    leftPercent: left,
    rightPercent: left + width
  }
}

// Extended task type with optional blockedBy for dependency tracking
type TaskWithDependencies = Task & { blockedBy?: string[] }

// Calculate dependency lines between tasks
const dependencyLines = computed(() => {
  if (!showDependencies.value) return []

  const lines: {
    from: string
    to: string
    fromX: number
    fromY: number
    toX: number
    toY: number
    color: string
  }[] = []

  // Build task index map for row positions
  let rowIndex = 0
  const taskRowMap: Record<string, number> = {}
  groupedTasks.value.forEach(group => {
    group.tasks.forEach(task => {
      taskRowMap[task.id] = rowIndex++
    })
  })

  // Find dependencies (tasks that block other tasks)
  // Note: blockedBy is an extended property that may be provided by the API
  const tasksWithDeps = tasks.value as TaskWithDependencies[]
  tasksWithDeps.forEach(task => {
    if (task.blockedBy && task.blockedBy.length > 0) {
      task.blockedBy.forEach((blockingTaskId: string) => {
        const blockingTask = tasks.value.find(t => t.id === blockingTaskId)
        if (blockingTask) {
          const fromPos = getTaskPosition(blockingTask)
          const toPos = getTaskPosition(task)
          const fromRow = taskRowMap[blockingTask.id]
          const toRow = taskRowMap[task.id]

          if (fromRow !== undefined && toRow !== undefined) {
            lines.push({
              from: blockingTask.id,
              to: task.id,
              fromX: fromPos.rightPercent,
              fromY: fromRow,
              toX: toPos.leftPercent,
              toY: toRow,
              color: task.isBlocked ? '#ef4444' : '#6b7280'
            })
          }
        }
      })
    }
  })

  return lines
})

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

const groupOptions = [
  { value: 'none', label: 'No grouping' },
  { value: 'project', label: 'By Project' },
  { value: 'assignee', label: 'By Assignee' }
]

// Get progress percentage for task
function getTaskProgress(task: Task): number {
  if (task.completedAt) return 100
  if (!task.subtaskCount || task.subtaskCount === 0) return 0
  return Math.round(((task.completedSubtasks || 0) / task.subtaskCount) * 100)
}

// Today indicator position
const todayPosition = computed(() => {
  const timelineStart = startDate.value.getTime()
  const timelineEnd = endDate.value.getTime()
  const todayTime = today.getTime()

  if (todayTime < timelineStart || todayTime > timelineEnd) return null

  const position = ((todayTime - timelineStart) / (timelineEnd - timelineStart)) * 100
  return `${position}%`
})

// Expose refresh method
defineExpose({ refreshTasks })
</script>

<template>
  <div class="h-full flex flex-col" role="application" aria-label="Timeline view">
    <!-- Timeline controls -->
    <div class="flex items-center justify-between p-4 border-b border-default">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          variant="ghost"
          size="sm"
          aria-label="Navigate to previous period"
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
          aria-label="Navigate to next period"
          @click="navigateNext"
        />
      </div>

      <div class="text-sm font-medium" aria-live="polite">
        {{ startDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}
        -
        {{ endDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}
      </div>

      <div class="flex items-center gap-3">
        <!-- Dependencies toggle -->
        <UTooltip text="Show task dependencies">
          <UButton
            :icon="showDependencies ? 'i-lucide-git-branch' : 'i-lucide-git-branch'"
            :variant="showDependencies ? 'solid' : 'ghost'"
            size="sm"
            aria-label="Toggle dependency lines"
            @click="showDependencies = !showDependencies"
          />
        </UTooltip>

        <!-- Group by selector -->
        <USelectMenu
          v-model="groupBy"
          :items="groupOptions"
          value-key="value"
          class="w-32"
          size="sm"
          aria-label="Group tasks by"
        />

        <!-- Zoom selector -->
        <USelectMenu
          v-model="zoomLevel"
          :items="zoomOptions"
          value-key="value"
          class="w-28"
          size="sm"
          aria-label="Zoom level"
        />
      </div>
    </div>

    <!-- Loading state -->
    <template v-if="tasksPending">
      <div class="p-4" aria-busy="true" aria-label="Loading timeline">
        <USkeleton class="h-8 w-full mb-4" />
        <USkeleton v-for="i in 5" :key="i" class="h-12 w-full mb-2" />
      </div>
    </template>

    <!-- Timeline -->
    <template v-else>
      <div ref="timelineContainer" class="flex-1 overflow-auto relative">
        <!-- Today indicator line -->
        <div
          v-if="todayPosition"
          class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
          :style="{ left: `calc(256px + (100% - 256px) * ${parseFloat(todayPosition) / 100})` }"
        >
          <div class="absolute -top-1 -left-2 w-4 h-4 bg-red-500 rounded-full" />
        </div>

        <!-- Header with dates -->
        <div class="sticky top-0 bg-default z-10 flex border-b border-default">
          <div class="w-64 flex-shrink-0 p-2 border-r border-default font-medium text-sm" role="columnheader">
            Task
          </div>
          <div class="flex-1 flex" role="row">
            <div
              v-for="col in dateColumns"
              :key="col.date.toISOString()"
              class="flex-1 min-w-[60px] p-2 text-center text-xs border-r border-default last:border-r-0"
              :class="{
                'bg-primary/10': col.isToday,
                'bg-muted/30': col.isWeekend
              }"
              role="columnheader"
            >
              {{ col.label }}
            </div>
          </div>
        </div>

        <!-- Grouped task rows -->
        <div v-for="(group, groupIndex) in groupedTasks" :key="groupIndex" role="rowgroup">
          <!-- Group header -->
          <div
            v-if="groupBy !== 'none'"
            class="flex border-b border-default bg-muted/20 sticky top-[41px] z-[5]"
          >
            <div class="w-64 flex-shrink-0 p-2 border-r border-default font-semibold text-sm flex items-center gap-2">
              <UIcon
                :name="groupBy === 'project' ? 'i-lucide-folder' : 'i-lucide-user'"
                class="w-4 h-4 text-muted"
              />
              {{ group.name }}
              <span class="text-xs text-muted font-normal">({{ group.tasks.length }})</span>
            </div>
            <div class="flex-1" />
          </div>

          <!-- Task rows -->
          <div
            v-for="(task, taskIndex) in group.tasks"
            :key="task.id"
            class="flex border-b border-default hover:bg-muted/20 min-h-[48px] relative"
            role="row"
          >
            <!-- Task info -->
            <div
              class="w-64 flex-shrink-0 p-2 border-r border-default cursor-pointer"
              role="gridcell"
              @click="emit('taskClick', task)"
            >
              <div class="text-sm font-medium truncate flex items-center gap-1">
                <UIcon
                  v-if="task.isBlocked"
                  name="i-lucide-ban"
                  class="w-3.5 h-3.5 text-red-500 flex-shrink-0"
                />
                {{ task.title }}
              </div>
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
            <div class="flex-1 relative py-2 px-1" role="gridcell">
              <!-- Task bar -->
              <div
                class="absolute h-6 rounded cursor-pointer transition-all hover:brightness-110 group"
                :style="{
                  left: getTaskPosition(task).left,
                  width: getTaskPosition(task).width,
                  backgroundColor: task.status?.color || '#6B7280',
                  top: '50%',
                  transform: 'translateY(-50%)'
                }"
                :aria-label="`Task: ${task.title}, ${task.startDate ? 'starts ' + new Date(task.startDate).toLocaleDateString() : ''} ${task.dueDate ? 'due ' + new Date(task.dueDate).toLocaleDateString() : ''}`"
                @click="emit('taskClick', task)"
              >
                <!-- Progress indicator -->
                <div
                  v-if="getTaskProgress(task) > 0"
                  class="absolute inset-y-0 left-0 bg-white/30 rounded-l"
                  :style="{ width: `${getTaskProgress(task)}%` }"
                />

                <!-- Task title -->
                <div class="px-2 text-xs text-white truncate leading-6 relative">
                  {{ task.title }}
                </div>

                <!-- Resize handles (visual only for now) -->
                <div class="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/50 rounded-l" />
                <div class="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/50 rounded-r" />
              </div>
            </div>
          </div>
        </div>

        <!-- SVG layer for dependency lines -->
        <svg
          v-if="showDependencies && dependencyLines.length > 0"
          class="absolute top-0 left-64 right-0 bottom-0 pointer-events-none z-[1]"
          style="overflow: visible"
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
            <marker
              id="arrowhead-blocked"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
            </marker>
          </defs>

          <g v-for="(line, index) in dependencyLines" :key="index">
            <path
              :d="`M ${line.fromX}% ${(line.fromY + 1) * 48 + 24}
                   C ${line.fromX + 5}% ${(line.fromY + 1) * 48 + 24},
                     ${line.toX - 5}% ${(line.toY + 1) * 48 + 24},
                     ${line.toX}% ${(line.toY + 1) * 48 + 24}`"
              fill="none"
              :stroke="line.color"
              stroke-width="2"
              stroke-dasharray="4 2"
              :marker-end="line.color === '#ef4444' ? 'url(#arrowhead-blocked)' : 'url(#arrowhead)'"
            />
          </g>
        </svg>

        <!-- Empty state -->
        <div v-if="tasks.length === 0" class="flex items-center justify-center p-12">
          <div class="text-center">
            <UIcon name="i-lucide-gantt-chart" class="h-12 w-12 text-muted mx-auto mb-3" />
            <p class="text-muted">No tasks to display on timeline</p>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="border-t border-default p-3 bg-muted/20">
        <div class="flex items-center justify-between text-xs text-muted">
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1">
              <div class="w-3 h-3 rounded bg-red-500" />
              <span>Today</span>
            </div>
            <div v-if="showDependencies" class="flex items-center gap-1">
              <svg class="w-6 h-3">
                <line x1="0" y1="6" x2="24" y2="6" stroke="#6b7280" stroke-width="2" stroke-dasharray="4 2" />
              </svg>
              <span>Dependency</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="w-6 h-3 rounded bg-gray-400 relative overflow-hidden">
                <div class="absolute inset-y-0 left-0 w-1/2 bg-white/30" />
              </div>
              <span>Progress</span>
            </div>
          </div>
          <div>
            {{ tasks.length }} tasks
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
