<script setup lang="ts">
/**
 * Timeline/Gantt View — Monday.com-style
 * Single scroll container with sticky left panel, pixel-based bars,
 * grouped by department, SVG dependency arrows, hover tooltips.
 */
import { addDays, differenceInDays, format, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval } from 'date-fns'

definePageMeta({
  layout: 'agency',
  title: 'Timeline'
})

// --- Filters ---
const departmentId = ref<string>('all')
const projectId = ref<string>('all')
const zoomLevel = ref<'day' | 'week' | 'month'>('week')
const showCompleted = ref(true)
const groupBy = ref<'department' | 'project' | 'none'>('department')

// Date range — current month + 2 months ahead
const dateRange = ref({
  start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  end: format(endOfMonth(addDays(new Date(), 60)), 'yyyy-MM-dd')
})

// --- Data fetching ---
const { data: departmentsData } = useLazyFetch('/api/agency/departments')
const departments = computed(() => (departmentsData.value as any[]) || [])

const { data: projectsData } = useLazyFetch('/api/agency/projects')
const projects = computed(() => (projectsData.value as any[]) || [])

const { data: timelineData, pending, refresh } = useLazyFetch('/api/agency/tasks/timeline', {
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

// --- Grouping ---
interface TaskGroup {
  id: string
  name: string
  color: string
  collapsed: boolean
  tasks: any[]
}

const collapsedGroups = ref<Set<string>>(new Set())

const groups = computed<TaskGroup[]>(() => {
  const items = tasks.value
  if (groupBy.value === 'none') {
    return [{ id: 'all', name: 'All Tasks', color: '#579BFC', collapsed: false, tasks: items }]
  }

  const map = new Map<string, TaskGroup>()

  for (const task of items) {
    let key: string, name: string, color: string

    if (groupBy.value === 'department') {
      key = task.department?.id || 'unknown'
      name = task.department?.name || 'No Department'
      color = task.department?.color || '#C4C4C4'
    } else {
      key = task.project?.id || 'unknown'
      name = task.project?.name || 'No Project'
      color = '#579BFC'
    }

    if (!map.has(key)) {
      map.set(key, { id: key, name, color, collapsed: collapsedGroups.value.has(key), tasks: [] })
    }
    map.get(key)!.tasks.push(task)
  }

  return Array.from(map.values())
})

function toggleGroup(groupId: string) {
  if (collapsedGroups.value.has(groupId)) {
    collapsedGroups.value.delete(groupId)
  } else {
    collapsedGroups.value.add(groupId)
  }
}

// --- Visible rows (tasks from non-collapsed groups) ---
const visibleRows = computed(() => {
  const rows: { type: 'group'; group: TaskGroup }[] | { type: 'task'; task: any; groupId: string }[] = []
  const result: ({ type: 'group'; group: TaskGroup } | { type: 'task'; task: any; groupId: string })[] = []

  for (const group of groups.value) {
    if (groups.value.length > 1 || groupBy.value !== 'none') {
      result.push({ type: 'group', group })
    }
    if (!group.collapsed) {
      for (const task of group.tasks) {
        result.push({ type: 'task', task, groupId: group.id })
      }
    }
  }
  return result
})

// --- Date columns ---
const COL_WIDTHS = { day: 50, week: 140, month: 220 } as const

const dateColumns = computed(() => {
  const start = new Date(dateRange.value.start)
  const end = new Date(dateRange.value.end)
  const colWidth = COL_WIDTHS[zoomLevel.value]

  if (zoomLevel.value === 'day') {
    return eachDayOfInterval({ start, end }).map(date => ({
      date,
      label: format(date, 'EEE d'),
      width: colWidth
    }))
  } else if (zoomLevel.value === 'week') {
    return eachWeekOfInterval({ start, end }).map(weekStart => ({
      date: weekStart,
      label: format(weekStart, 'MMM d'),
      width: colWidth
    }))
  } else {
    const months: { date: Date; label: string; width: number }[] = []
    let current = startOfMonth(start)
    while (current <= end) {
      months.push({ date: current, label: format(current, 'MMM yyyy'), width: colWidth })
      current = startOfMonth(addDays(endOfMonth(current), 1))
    }
    return months
  }
})

const timelineWidth = computed(() => dateColumns.value.reduce((sum, col) => sum + col.width, 0))

// --- Pixel-based bar positioning ---
const LEFT_PANEL_W = 260

function getTaskDates(task: any): { startMs: number; endMs: number } | null {
  const startStr = task.startDate || task.endDate
  if (!startStr) return null

  const startMs = new Date(startStr).getTime()
  const endStr = task.endDate
  const endMs = endStr ? new Date(endStr).getTime() : startMs + 7 * 86400000 // default +7 days
  return { startMs, endMs: Math.max(endMs, startMs + 86400000) }
}

const BAR_LABEL_THRESHOLD = 120 // px — bars narrower than this show label outside

function getBarStyle(task: any): { left: string; width: string; widthPx: number } | null {
  const dates = getTaskDates(task)
  if (!dates) return null

  const timelineStart = new Date(dateRange.value.start).getTime()
  const timelineEnd = new Date(dateRange.value.end).getTime()
  const totalDays = (timelineEnd - timelineStart) / 86400000 || 1
  const pxPerDay = timelineWidth.value / totalDays

  const startOffset = (dates.startMs - timelineStart) / 86400000
  const duration = (dates.endMs - dates.startMs) / 86400000

  const leftPx = startOffset * pxPerDay
  const widthPx = Math.max(20, duration * pxPerDay)

  return { left: `${leftPx}px`, width: `${widthPx}px`, widthPx }
}

function getBarColor(task: any): string {
  if (task.isCompleted) return '#00C875'
  if (task.isBlocked) return '#E2445C'
  return task.status?.color || '#579BFC'
}

// --- Today indicator ---
const todayPx = computed(() => {
  const today = new Date()
  const timelineStart = new Date(dateRange.value.start).getTime()
  const timelineEnd = new Date(dateRange.value.end).getTime()
  const todayMs = today.getTime()

  if (todayMs < timelineStart || todayMs > timelineEnd) return null

  const totalDays = (timelineEnd - timelineStart) / 86400000 || 1
  const pxPerDay = timelineWidth.value / totalDays
  const offset = (todayMs - timelineStart) / 86400000
  return offset * pxPerDay
})

// --- SVG dependency arrows ---
interface ArrowPath { fromId: string; toId: string; path: string }

const ROW_HEIGHT = 40
const GROUP_ROW_HEIGHT = 36

const arrowPaths = computed<ArrowPath[]>(() => {
  const arrows: ArrowPath[] = []
  const timelineStart = new Date(dateRange.value.start).getTime()
  const timelineEnd = new Date(dateRange.value.end).getTime()
  const totalDays = (timelineEnd - timelineStart) / 86400000 || 1
  const pxPerDay = timelineWidth.value / totalDays

  // Build task date map and row index map
  const taskDateMap = new Map<string, { startMs: number; endMs: number }>()
  const taskRowMap = new Map<string, number>()

  let rowY = 0
  for (const row of visibleRows.value) {
    if (row.type === 'group') {
      rowY += GROUP_ROW_HEIGHT
    } else {
      const dates = getTaskDates(row.task)
      if (dates) taskDateMap.set(row.task.id, dates)
      taskRowMap.set(row.task.id, rowY)
      rowY += ROW_HEIGHT
    }
  }

  for (const row of visibleRows.value) {
    if (row.type !== 'task') continue
    const task = row.task
    if (!task.dependencies?.length) continue

    for (const dep of task.dependencies) {
      const fromDates = taskDateMap.get(dep.taskId)
      const toDates = taskDateMap.get(task.id)
      const fromRowY = taskRowMap.get(dep.taskId)
      const toRowY = taskRowMap.get(task.id)

      if (!fromDates || !toDates || fromRowY == null || toRowY == null) continue

      // From: right edge of blocker bar
      const fromXPx = LEFT_PANEL_W + ((fromDates.endMs - timelineStart) / 86400000) * pxPerDay
      // To: left edge of dependent bar
      const toXPx = LEFT_PANEL_W + ((toDates.startMs - timelineStart) / 86400000) * pxPerDay

      const fromY = fromRowY + ROW_HEIGHT / 2
      const toY = toRowY + ROW_HEIGHT / 2

      // Elbow path
      const midX = (fromXPx + toXPx) / 2
      const r = Math.min(8, Math.abs(toY - fromY) / 2, Math.abs(toXPx - fromXPx) / 4)

      let path: string
      if (Math.abs(fromY - toY) < 2) {
        path = `M ${fromXPx} ${fromY} L ${toXPx - 8} ${toY}`
      } else {
        const dir = toY > fromY ? 1 : -1
        path = `M ${fromXPx} ${fromY} L ${midX - r} ${fromY} Q ${midX} ${fromY} ${midX} ${fromY + dir * r} L ${midX} ${toY - dir * r} Q ${midX} ${toY} ${midX + r} ${toY} L ${toXPx - 8} ${toY}`
      }

      arrows.push({ fromId: dep.taskId, toId: task.id, path })
    }
  }

  return arrows
})

const svgHeight = computed(() => {
  let h = 0
  for (const row of visibleRows.value) {
    h += row.type === 'group' ? GROUP_ROW_HEIGHT : ROW_HEIGHT
  }
  return Math.max(h, 200)
})

// --- Tooltip ---
const tooltip = ref<{ task: any; x: number; y: number } | null>(null)

function showTooltip(task: any, event: MouseEvent) {
  tooltip.value = { task, x: event.clientX, y: event.clientY }
}

function hideTooltip() {
  tooltip.value = null
}

// --- Scroll to today ---
const scrollContainer = ref<HTMLElement | null>(null)

function scrollToToday() {
  if (!scrollContainer.value || todayPx.value === null) return
  scrollContainer.value.scrollLeft = Math.max(0, todayPx.value - scrollContainer.value.clientWidth / 2 + LEFT_PANEL_W)
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
        <h1 class="text-xl font-semibold text-highlighted">Timeline</h1>
        <p class="text-sm text-muted">Gantt-style view of tasks and milestones</p>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-4 mr-4 text-sm">
          <span class="text-muted">
            <span class="font-medium text-highlighted">{{ summary.totalTasks || 0 }}</span> tasks
          </span>
          <span class="text-muted">
            <span class="font-medium text-success-600">{{ summary.completedTasks || 0 }}</span> done
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
    <div class="flex items-center gap-4 p-3 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700">
      <UFormField label="Department" class="w-44">
        <USelect
          v-model="departmentId"
          :items="[{ value: 'all', label: 'All Departments' }, ...departments.map((d: any) => ({ value: d.id, label: d.name }))]"
          value-key="value"
        />
      </UFormField>

      <UFormField label="Project" class="w-44">
        <USelect
          v-model="projectId"
          :items="[{ value: 'all', label: 'All Projects' }, ...projects.map((p: any) => ({ value: p.id, label: p.name }))]"
          value-key="value"
        />
      </UFormField>

      <UFormField label="Zoom" class="w-28">
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

      <UFormField label="Group" class="w-36">
        <USelect
          v-model="groupBy"
          :items="[
            { value: 'department', label: 'Department' },
            { value: 'project', label: 'Project' },
            { value: 'none', label: 'No Grouping' }
          ]"
          value-key="value"
        />
      </UFormField>

      <UCheckbox v-model="showCompleted" label="Show completed" class="ml-2 mt-4" />

      <div class="flex-1" />

      <UButton
        icon="i-lucide-refresh-cw"
        size="sm"
        color="neutral"
        variant="ghost"
        :loading="pending"
        class="mt-4"
        @click="refresh()"
      />
    </div>

    <!-- Loading -->
    <div v-if="pending && !tasks.length" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <!-- Empty state -->
    <div v-else-if="tasks.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <UIcon name="i-lucide-gantt-chart" class="w-12 h-12 text-muted mx-auto mb-3" />
        <p class="text-muted">No tasks with dates found</p>
        <p class="text-xs text-muted mt-1">Try adjusting your filters or date range</p>
      </div>
    </div>

    <!-- Timeline — single scroll container -->
    <div
      v-else
      ref="scrollContainer"
      class="flex-1 overflow-auto relative"
    >
      <div :style="{ minWidth: `${LEFT_PANEL_W + timelineWidth}px` }">
        <!-- SVG overlay for dependency arrows -->
        <svg
          v-if="arrowPaths.length > 0"
          class="absolute top-0 left-0 pointer-events-none"
          style="z-index: 15;"
          :style="{ width: `${LEFT_PANEL_W + timelineWidth}px`, height: `${svgHeight + 48}px` }"
        >
          <defs>
            <marker id="timeline-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#999" />
            </marker>
          </defs>
          <!-- offset arrows by header height (48px) -->
          <g transform="translate(0, 48)">
            <path
              v-for="arrow in arrowPaths"
              :key="`${arrow.fromId}-${arrow.toId}`"
              :d="arrow.path"
              fill="none"
              stroke="#999"
              stroke-width="1.5"
              marker-end="url(#timeline-arrowhead)"
            />
          </g>
        </svg>

        <!-- Today indicator line -->
        <div
          v-if="todayPx !== null"
          class="absolute top-0 pointer-events-none"
          style="z-index: 20;"
          :style="{ left: `${LEFT_PANEL_W + todayPx}px`, height: `${svgHeight + 48}px` }"
        >
          <div class="w-0.5 h-full bg-red-500" />
          <div class="absolute -top-0 -left-1.5 w-3.5 h-3.5 bg-red-500 rounded-full" />
        </div>

        <!-- Header row -->
        <div class="flex sticky top-0 z-10 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50" style="height: 48px;">
          <!-- Left panel header (sticky) -->
          <div
            class="flex-shrink-0 px-3 flex items-center border-r border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 sticky left-0 z-20"
            :style="{ width: `${LEFT_PANEL_W}px` }"
          >
            <span class="text-xs font-semibold text-muted uppercase tracking-wide">Task Name</span>
          </div>
          <!-- Date columns -->
          <div class="flex">
            <div
              v-for="col in dateColumns"
              :key="col.label"
              class="flex items-center justify-center border-r border-neutral-200 dark:border-neutral-700 text-xs text-muted"
              :style="{ width: `${col.width}px` }"
            >
              {{ col.label }}
            </div>
          </div>
        </div>

        <!-- Body rows -->
        <template v-for="row in visibleRows" :key="row.type === 'group' ? `g-${row.group.id}` : `t-${row.task.id}`">
          <!-- Group header -->
          <div
            v-if="row.type === 'group'"
            class="flex border-b border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
            :style="{ height: `${GROUP_ROW_HEIGHT}px` }"
            @click="toggleGroup(row.group.id)"
          >
            <div
              class="flex-shrink-0 px-3 flex items-center gap-2 border-r border-neutral-200 dark:border-neutral-700 sticky left-0 z-5 bg-neutral-100 dark:bg-neutral-800/70"
              :style="{ width: `${LEFT_PANEL_W}px` }"
            >
              <UIcon
                :name="row.group.collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                class="w-4 h-4 text-muted flex-shrink-0"
              />
              <div class="w-2.5 h-2.5 rounded-sm flex-shrink-0" :style="{ backgroundColor: row.group.color }" />
              <span class="text-sm font-semibold truncate">{{ row.group.name }}</span>
              <span class="text-xs text-muted font-normal">({{ row.group.tasks.length }})</span>
            </div>
            <div class="flex-1 bg-neutral-100 dark:bg-neutral-800/70" />
          </div>

          <!-- Task row -->
          <div
            v-else
            class="flex border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/80 dark:hover:bg-neutral-800/30"
            :style="{ height: `${ROW_HEIGHT}px` }"
          >
            <!-- Left panel (sticky) -->
            <div
              class="flex-shrink-0 px-3 flex items-center gap-2 border-r border-neutral-200 dark:border-neutral-700 sticky left-0 z-5 bg-white dark:bg-neutral-900"
              :style="{ width: `${LEFT_PANEL_W}px` }"
            >
              <div
                class="w-2 h-2 rounded-full flex-shrink-0"
                :style="{ backgroundColor: getBarColor(row.task) }"
              />
              <span class="text-sm truncate flex-1" :class="{ 'line-through text-muted': row.task.isCompleted }">
                {{ row.task.title }}
              </span>
              <UIcon
                v-if="row.task.isBlocked"
                name="i-lucide-ban"
                class="w-3.5 h-3.5 text-error-500 flex-shrink-0"
              />
            </div>

            <!-- Bar area -->
            <div class="flex-1 relative">
              <!-- Grid lines -->
              <div class="absolute inset-0 flex pointer-events-none">
                <div
                  v-for="col in dateColumns"
                  :key="col.label"
                  class="border-r border-neutral-100 dark:border-neutral-800"
                  :style="{ width: `${col.width}px` }"
                />
              </div>

              <!-- Task bar + label -->
              <template v-if="getBarStyle(row.task)">
                <div
                  class="absolute top-1.5 h-7 rounded cursor-pointer transition-all hover:brightness-110 hover:shadow-md"
                  :style="{
                    left: getBarStyle(row.task)!.left,
                    width: getBarStyle(row.task)!.width,
                    backgroundColor: getBarColor(row.task),
                  }"
                  @mouseenter="showTooltip(row.task, $event)"
                  @mouseleave="hideTooltip"
                >
                  <!-- Progress fill -->
                  <div
                    v-if="!row.task.isCompleted && (row.task.progressPercentage || 0) > 0"
                    class="absolute inset-y-0 left-0 bg-white/20 rounded-l"
                    :style="{ width: `${Math.min(100, row.task.progressPercentage)}%` }"
                  />
                  <!-- Label inside bar (wide bars only) -->
                  <span
                    v-if="getBarStyle(row.task)!.widthPx >= BAR_LABEL_THRESHOLD"
                    class="relative z-[1] px-2 text-xs text-white truncate leading-7 block"
                  >
                    {{ row.task.title }}
                  </span>
                </div>
                <!-- Label outside bar (narrow bars) -->
                <span
                  v-if="getBarStyle(row.task)!.widthPx < BAR_LABEL_THRESHOLD"
                  class="absolute top-1.5 text-xs text-default truncate leading-7 pointer-events-none"
                  :style="{
                    left: `calc(${getBarStyle(row.task)!.left} + ${getBarStyle(row.task)!.width} + 6px)`,
                    maxWidth: '200px',
                  }"
                >
                  {{ row.task.title }}
                </span>
              </template>

              <!-- No date fallback -->
              <div v-else class="absolute top-1/2 -translate-y-1/2 left-2 text-xs text-muted italic">
                No date set
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex items-center gap-6 p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 text-xs text-muted">
      <span class="font-medium">Status:</span>
      <div class="flex items-center gap-1.5">
        <div class="w-3 h-3 rounded-full" style="background-color: #00C875;" />
        <span>Completed</span>
      </div>
      <div class="flex items-center gap-1.5">
        <div class="w-3 h-3 rounded-full" style="background-color: #E2445C;" />
        <span>Blocked</span>
      </div>
      <div class="flex items-center gap-1.5">
        <div class="w-3 h-3 rounded-full" style="background-color: #579BFC;" />
        <span>In Progress</span>
      </div>
      <span class="mx-2">|</span>
      <div class="flex items-center gap-1">
        <div class="w-4 h-0.5 bg-red-500" />
        <span>Today</span>
      </div>
      <div class="flex items-center gap-1">
        <svg width="16" height="10"><path d="M 0 5 L 12 5" stroke="#999" stroke-width="1.5" fill="none" /><polygon points="12 2, 16 5, 12 8" fill="#999" /></svg>
        <span>Dependency</span>
      </div>
    </div>

    <!-- Hover tooltip -->
    <Teleport to="body">
      <div
        v-if="tooltip"
        class="fixed z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-3 pointer-events-none"
        :style="{
          left: `${tooltip.x + 12}px`,
          top: `${tooltip.y - 10}px`,
          maxWidth: '280px',
        }"
      >
        <div class="text-sm font-semibold text-highlighted mb-1.5">{{ tooltip.task.title }}</div>
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <span class="text-muted">Status</span>
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full" :style="{ backgroundColor: tooltip.task.status?.color || '#579BFC' }" />
            <span>{{ tooltip.task.status?.name || 'Unknown' }}</span>
          </div>

          <template v-if="tooltip.task.startDate || tooltip.task.endDate">
            <span class="text-muted">Dates</span>
            <span>
              {{ tooltip.task.startDate ? format(new Date(tooltip.task.startDate), 'MMM d') : '?' }}
              →
              {{ tooltip.task.endDate ? format(new Date(tooltip.task.endDate), 'MMM d, yyyy') : '?' }}
            </span>
          </template>

          <template v-if="tooltip.task.assignee">
            <span class="text-muted">Assignee</span>
            <span>{{ tooltip.task.assignee.name }}</span>
          </template>

          <template v-if="tooltip.task.department">
            <span class="text-muted">Dept</span>
            <span>{{ tooltip.task.department.name }}</span>
          </template>

          <template v-if="tooltip.task.progressPercentage > 0">
            <span class="text-muted">Progress</span>
            <div class="flex items-center gap-2">
              <div class="flex-1 h-1.5 bg-neutral-200 dark:bg-neutral-600 rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full" :style="{ width: `${tooltip.task.progressPercentage}%` }" />
              </div>
              <span>{{ tooltip.task.progressPercentage }}%</span>
            </div>
          </template>

          <template v-if="tooltip.task.isBlocked">
            <span class="text-muted">Blocked</span>
            <span class="text-error-500">{{ tooltip.task.blockedReason || 'Yes' }}</span>
          </template>

          <template v-if="tooltip.task.dependencies?.length">
            <span class="text-muted">Deps</span>
            <span>{{ tooltip.task.dependencies.length }} blocker{{ tooltip.task.dependencies.length > 1 ? 's' : '' }}</span>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>
