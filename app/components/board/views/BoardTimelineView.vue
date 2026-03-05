<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Controls -->
    <div class="flex items-center justify-between p-3 border-b dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-chevron-left" variant="ghost" size="sm" @click="navigatePrev" />
        <UButton variant="outline" size="sm" @click="goToToday">Today</UButton>
        <UButton icon="i-lucide-chevron-right" variant="ghost" size="sm" @click="navigateNext" />
        <span class="text-sm font-medium ml-2">
          {{ rangeStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}
          &ndash;
          {{ rangeEnd.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}
        </span>
      </div>
      <div class="flex items-center gap-3">
        <!-- Color-by dropdown -->
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-gray-500 dark:text-neutral-400">Color by</span>
          <select
            v-model="colorBy"
            class="text-xs border rounded px-1.5 py-1 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="status">Status</option>
            <option value="priority">Priority</option>
            <option value="project">Project</option>
            <option value="assignee">Assignee</option>
          </select>
        </div>

        <!-- Weekend toggle (day view only) -->
        <label v-if="zoom === 'day'" class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400 cursor-pointer">
          <input type="checkbox" v-model="showWeekends" class="rounded border-gray-300 dark:border-neutral-600 text-primary focus:ring-primary w-3.5 h-3.5" />
          Weekends
        </label>

        <!-- Zoom buttons -->
        <div class="flex items-center gap-1">
          <button
            v-for="z in zoomLevels"
            :key="z.value"
            class="px-2.5 py-1 text-xs font-medium rounded transition-colors"
            :class="zoom === z.value ? 'bg-gray-200 dark:bg-neutral-700 text-gray-900 dark:text-neutral-100' : 'text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200'"
            @click="zoom = z.value"
          >
            {{ z.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Timeline Grid -->
    <div ref="scrollContainer" class="flex-1 overflow-auto relative" @scroll="onScroll">
      <!-- min-width: fit-content forces all rows to stretch to match the widest child (header with min-w columns) -->
      <div style="min-width: fit-content;">
      <!-- SVG dependency arrows overlay -->
      <svg
        v-if="arrowPaths.length > 0"
        class="absolute top-0 left-0 z-15 pointer-events-none"
        style="width: 100%; height: 100%;"
        :style="{ minHeight: svgHeight + 'px' }"
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#666" />
          </marker>
        </defs>
        <path
          v-for="arrow in arrowPaths"
          :key="`${arrow.fromTaskId}-${arrow.toTaskId}`"
          :d="arrow.path"
          fill="none"
          stroke="#666"
          stroke-width="1.5"
          marker-end="url(#arrowhead)"
        />
      </svg>

      <!-- Date header -->
      <div class="sticky top-0 z-10 flex border-b dark:border-neutral-700 bg-white dark:bg-neutral-900">
        <div class="w-[200px] flex-shrink-0 p-2 border-r dark:border-neutral-700 text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase">
          Item
        </div>
        <div class="flex-1 flex">
          <div
            v-for="col in visibleDateColumns"
            :key="col.label"
            class="flex-1 min-w-[50px] p-2 text-center text-xs border-r dark:border-neutral-700 last:border-r-0"
            :class="{
              'bg-blue-50 dark:bg-blue-950 font-semibold text-blue-700 dark:text-blue-400': col.isToday,
              'bg-gray-100/50 dark:bg-neutral-800/50': col.isWeekend && !col.isToday,
            }"
          >
            {{ col.label }}
          </div>
        </div>
      </div>

      <!-- Today indicator (in-flow row so flex-1 matches scrollable content width) -->
      <div
        v-if="todayLeft !== null"
        class="flex pointer-events-none relative z-20"
        style="height: 0;"
      >
        <div class="w-[200px] flex-shrink-0" />
        <div class="flex-1 relative" style="overflow: visible;">
          <div
            class="absolute"
            :style="{ left: `${todayLeft}%`, top: '-37px', height: `${svgHeight}px` }"
          >
            <!-- Subtle background stripe in day view -->
            <div
              v-if="zoom === 'day'"
              class="absolute top-0 bottom-0 bg-red-50/30 dark:bg-red-950/20"
              :style="{ left: '-15px', width: '30px' }"
            />
            <div class="absolute top-0 bottom-0 w-0.5 bg-red-500 left-0" />
            <div class="absolute -top-0.5 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
            <span class="absolute top-3 left-2 text-[10px] font-semibold text-red-500 whitespace-nowrap">Today</span>
          </div>
        </div>
      </div>

      <!-- Task rows -->
      <div v-for="group in groups" :key="group.id">
        <!-- Group header if multiple -->
        <div v-if="groups.length > 1" class="flex border-b dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 sticky top-[37px] z-[5]">
          <div class="w-[200px] flex-shrink-0 p-2 border-r dark:border-neutral-700 text-sm font-semibold flex items-center gap-2">
            <span class="w-2 h-2 rounded-sm" :style="{ backgroundColor: group.color }" />
            {{ group.name }}
            <span class="text-xs text-gray-400 dark:text-neutral-500 font-normal">({{ group.totalCount ?? group.items.length }})</span>
          </div>
          <div class="flex-1" />
        </div>

        <div
          v-for="item in group.items"
          :key="item.id"
          :ref="el => setItemRowRef(item.id, el)"
          class="flex border-b dark:border-neutral-700 hover:bg-gray-50/50 dark:hover:bg-neutral-800/50 min-h-[40px] relative"
        >
          <!-- Item name -->
          <div
            class="w-[200px] flex-shrink-0 p-2 border-r dark:border-neutral-700 text-sm truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5"
            @click="$emit('openTask', item.id)"
          >
            <!-- Milestone icon -->
            <UIcon v-if="isMilestone(item)" name="i-lucide-diamond" class="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            {{ item.title }}
          </div>
          <!-- Bar area -->
          <div class="flex-1 relative py-1.5">
            <!-- Weekend column backgrounds -->
            <template v-if="zoom === 'day' && showWeekends">
              <div
                v-for="wCol in weekendColumnPositions"
                :key="'wknd-' + wCol.index"
                class="absolute top-0 bottom-0 bg-gray-100/50 dark:bg-neutral-800/50"
                :style="{ left: wCol.left, width: wCol.width }"
              />
            </template>

            <!-- Milestone diamond -->
            <div
              v-if="isMilestone(item) && getMilestonePos(item) !== null"
              class="absolute z-10 cursor-pointer"
              :style="{
                left: getMilestonePos(item)!.left,
                top: '50%',
                transform: 'translate(-50%, -50%) rotate(45deg)',
              }"
              @click="$emit('openTask', item.id)"
            >
              <div
                class="w-3 h-3 rounded-[1px]"
                :style="{ backgroundColor: getItemColor(item) }"
              />
            </div>

            <!-- Regular task bar -->
            <div
              v-else-if="getBar(item)"
              class="absolute h-6 rounded cursor-pointer hover:brightness-110 transition-all group/bar"
              :style="{
                left: getBar(item)!.left,
                width: getBar(item)!.width,
                backgroundColor: getBar(item)!.color,
                top: '50%',
                transform: 'translateY(-50%)',
              }"
              :data-task-id="item.id"
              @click="$emit('openTask', item.id)"
            >
              <!-- Progress fill -->
              <div
                v-if="(item.progressPercentage || 0) > 0"
                class="absolute inset-0 bg-white/25 rounded-l"
                :style="{ width: `${Math.min(100, item.progressPercentage || 0)}%` }"
                :title="`${item.progressPercentage}% complete`"
              />
              <!-- Bar label -->
              <span class="relative px-2 text-xs text-white truncate leading-6 block z-[1]">{{ item.title }}</span>

              <!-- Drag handle: start -->
              <div
                v-if="handleCellUpdate"
                class="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 bg-black/10 rounded-l transition-opacity"
                @mousedown.stop="startDrag(item, 'start', $event)"
              />
              <!-- Drag handle: end -->
              <div
                v-if="handleCellUpdate"
                class="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100 bg-black/10 rounded-r transition-opacity"
                @mousedown.stop="startDrag(item, 'end', $event)"
              />
            </div>

            <!-- Ghost bar during drag -->
            <div
              v-if="dragState && dragState.itemId === item.id"
              class="absolute h-6 rounded border-2 border-dashed pointer-events-none"
              :style="{
                left: dragGhostStyle.left,
                width: dragGhostStyle.width,
                borderColor: getItemColor(item),
                top: '50%',
                transform: 'translateY(-50%)',
              }"
            />

            <!-- No date -->
            <div
              v-if="!isMilestone(item) && !getBar(item)"
              class="absolute top-1/2 -translate-y-1/2 left-2 text-xs text-gray-400 dark:text-neutral-500 italic"
            >
              No date set
            </div>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-if="allItems.length === 0" class="flex items-center justify-center p-12">
        <div class="text-center">
          <UIcon name="i-lucide-gantt-chart" class="w-12 h-12 text-gray-300 dark:text-neutral-600 mx-auto mb-3" />
          <p class="text-gray-500 dark:text-neutral-400">No items to display on timeline</p>
        </div>
      </div>
      </div><!-- end min-width: fit-content wrapper -->
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskColumnValue } from '~/types'
import type { BoardColumn, BoardItem, BoardGroup } from '~/composables/useBoardData'

const props = defineProps<{
  groups: BoardGroup[]
  columns: BoardColumn[]
  getCellValue: (item: BoardItem, col: BoardColumn) => TaskColumnValue | null
  handleCellUpdate?: (taskId: string, columnId: string, payload: any) => Promise<void>
}>()

const emit = defineEmits<{
  openTask: [taskId: string]
}>()

// --- State ---
type ZoomLevel = 'day' | 'week' | 'month'
type ColorByOption = 'status' | 'priority' | 'project' | 'assignee'

const zoom = ref<ZoomLevel>('week')
const colorBy = ref<ColorByOption>('status')
const showWeekends = ref(true)
const scrollContainer = ref<HTMLElement | null>(null)

const zoomLevels = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
]

const today = new Date()
const rangeStart = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const rangeEnd = ref(new Date(today.getFullYear(), today.getMonth() + 2, 0))

// --- Computed ---
const allItems = computed<BoardItem[]>(() => {
  const items: BoardItem[] = []
  for (const g of props.groups) items.push(...g.items)
  return items
})

// Find date/timeline columns
const dateColumn = computed(() =>
  props.columns.find(c => {
    const t = c.columnType || c.type
    return t === 'timeline' || t === 'date'
  })
)

// --- Navigation ---
function navigatePrev() {
  const ms = zoom.value === 'day' ? 7 : zoom.value === 'week' ? 30 : 90
  rangeStart.value = new Date(rangeStart.value.getTime() - ms * 86400000)
  rangeEnd.value = new Date(rangeEnd.value.getTime() - ms * 86400000)
}

function navigateNext() {
  const ms = zoom.value === 'day' ? 7 : zoom.value === 'week' ? 30 : 90
  rangeStart.value = new Date(rangeStart.value.getTime() + ms * 86400000)
  rangeEnd.value = new Date(rangeEnd.value.getTime() + ms * 86400000)
}

function goToToday() {
  rangeStart.value = new Date(today.getFullYear(), today.getMonth(), 1)
  rangeEnd.value = new Date(today.getFullYear(), today.getMonth() + 2, 0)
}

// --- Date columns ---
const dateColumns = computed(() => {
  const cols: { label: string; isToday: boolean; isWeekend: boolean; date: Date }[] = []
  const cur = new Date(rangeStart.value)
  const end = new Date(rangeEnd.value)
  const todayStr = today.toDateString()

  while (cur <= end) {
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6
    const d = new Date(cur)
    let label: string
    switch (zoom.value) {
      case 'day':
        label = cur.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
        cols.push({ label, isToday: cur.toDateString() === todayStr, isWeekend, date: d })
        cur.setDate(cur.getDate() + 1)
        break
      case 'week':
        label = cur.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        cols.push({ label, isToday: cur.toDateString() === todayStr, isWeekend: false, date: d })
        cur.setDate(cur.getDate() + 7)
        break
      case 'month':
        label = cur.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
        cols.push({ label, isToday: cur.getMonth() === today.getMonth() && cur.getFullYear() === today.getFullYear(), isWeekend: false, date: d })
        cur.setMonth(cur.getMonth() + 1)
        break
    }
  }
  return cols
})

const visibleDateColumns = computed(() => {
  if (zoom.value === 'day' && !showWeekends.value) {
    return dateColumns.value.filter(c => !c.isWeekend)
  }
  return dateColumns.value
})

// Weekend column positions for background shading
const weekendColumnPositions = computed(() => {
  if (zoom.value !== 'day') return []
  const total = visibleDateColumns.value.length
  if (total === 0) return []
  const positions: { index: number; left: string; width: string }[] = []
  const colWidth = 100 / total
  visibleDateColumns.value.forEach((col, i) => {
    if (col.isWeekend) {
      positions.push({
        index: i,
        left: `${i * colWidth}%`,
        width: `${colWidth}%`,
      })
    }
  })
  return positions
})

const todayLeft = computed(() => {
  const s = rangeStart.value.getTime()
  const e = rangeEnd.value.getTime()
  const t = today.getTime()
  if (t < s || t > e) return null
  return ((t - s) / (e - s)) * 100
})

// --- Milestone detection ---
function isMilestone(item: BoardItem): boolean {
  return item.taskType === 'milestone'
}

// --- Color logic ---
const priorityColors: Record<string, string> = {
  urgent: '#E2445C',
  critical: '#E2445C',
  high: '#FDAB3D',
  medium: '#579BFC',
  low: '#C4C4C4',
  none: '#C4C4C4',
}

function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const palette = ['#579BFC', '#00C875', '#FDAB3D', '#A25DDC', '#FF5AC4', '#FF642E', '#037F4C', '#225091', '#BB3354', '#7F5347']
  return palette[Math.abs(hash) % palette.length]
}

function getItemColor(item: BoardItem): string {
  switch (colorBy.value) {
    case 'priority':
      return priorityColors[(item.priority || 'none').toLowerCase()] || '#C4C4C4'
    case 'project': {
      const projectName = item.columnValues?.project?.textValue || item.clients?.[0] || ''
      return projectName ? hashColor(projectName) : '#C4C4C4'
    }
    case 'assignee': {
      const name = item.assignees?.[0]?.name || ''
      return name ? hashColor(name) : '#C4C4C4'
    }
    default:
      return item.statusColor || '#579BFC'
  }
}

// --- Bar computation ---
function getItemDates(item: BoardItem): { startMs: number; endMs: number } | null {
  let startMs: number | null = null
  let endMs: number | null = null

  // Try timeline/date column value first
  if (dateColumn.value) {
    const cv = props.getCellValue(item, dateColumn.value)
    if (cv?.dateValue) startMs = new Date(cv.dateValue).getTime()
    if (cv?.dateEndValue) endMs = new Date(cv.dateEndValue).getTime()
  }

  // Try item.startDate
  if (!startMs && item.startDate) {
    startMs = new Date(item.startDate).getTime()
  }

  // Fallback to item.dueDate
  if (!startMs && item.dueDate) {
    startMs = new Date(item.dueDate).getTime()
  }

  if (!startMs) return null
  if (!endMs) endMs = startMs + 7 * 86400000

  return { startMs, endMs }
}

function getBar(item: BoardItem): { left: string; width: string; color: string } | null {
  if (isMilestone(item)) return null

  const dates = getItemDates(item)
  if (!dates) return null

  const { startMs, endMs } = dates
  const s = rangeStart.value.getTime()
  const e = rangeEnd.value.getTime()
  const range = e - s

  const left = Math.max(0, ((startMs - s) / range) * 100)
  const right = Math.min(100, ((endMs - s) / range) * 100)
  const width = Math.max(2, right - left)

  return { left: `${left}%`, width: `${width}%`, color: getItemColor(item) }
}

function getMilestonePos(item: BoardItem): { left: string } | null {
  const dates = getItemDates(item)
  if (!dates) return null

  const s = rangeStart.value.getTime()
  const e = rangeEnd.value.getTime()
  const pos = ((dates.startMs - s) / (e - s)) * 100
  if (pos < 0 || pos > 100) return null
  return { left: `${pos}%` }
}

// --- Row refs for arrow positioning ---
const itemRowRefs = new Map<string, Element>()

function setItemRowRef(itemId: string, el: any) {
  if (el) {
    itemRowRefs.set(itemId, el)
  }
}

const scrollOffset = ref({ x: 0, y: 0 })
function onScroll() {
  if (scrollContainer.value) {
    scrollOffset.value = {
      x: scrollContainer.value.scrollLeft,
      y: scrollContainer.value.scrollTop,
    }
  }
}

// SVG height for arrow overlay
const svgHeight = computed(() => {
  const headerHeight = 37
  const groupHeaderHeight = 33
  const rowHeight = 40
  let height = headerHeight
  for (const g of props.groups) {
    if (props.groups.length > 1) height += groupHeaderHeight
    height += g.items.length * rowHeight
  }
  return Math.max(height, 400)
})

// --- Dependency arrows ---
interface ArrowPath {
  fromTaskId: string
  toTaskId: string
  path: string
}

const arrowPaths = computed<ArrowPath[]>(() => {
  const arrows: ArrowPath[] = []
  const s = rangeStart.value.getTime()
  const e = rangeEnd.value.getTime()
  const range = e - s
  if (range <= 0) return arrows

  // Build row index map: taskId -> row index (global, across groups)
  const rowIndexMap = new Map<string, number>()
  let rowIdx = 0
  for (const group of props.groups) {
    if (props.groups.length > 1) rowIdx++ // group header row
    for (const item of group.items) {
      rowIndexMap.set(item.id, rowIdx)
      rowIdx++
    }
  }

  // Build date map
  const itemDateMap = new Map<string, { startMs: number; endMs: number }>()
  for (const item of allItems.value) {
    const dates = getItemDates(item)
    if (dates) itemDateMap.set(item.id, dates)
  }

  const headerHeight = 37
  const rowHeight = 40
  const leftPanelWidth = 200 // px - but we use % for horizontal, so compute relative

  for (const item of allItems.value) {
    if (!item.dependencies?.length) continue
    for (const dep of item.dependencies) {
      const fromDates = itemDateMap.get(dep.dependsOnTaskId)
      const toDates = itemDateMap.get(item.id)
      const fromRow = rowIndexMap.get(dep.dependsOnTaskId)
      const toRow = rowIndexMap.get(item.id)

      if (!fromDates || !toDates || fromRow == null || toRow == null) continue

      // From: right edge of dependency bar (the blocker)
      // To: left edge of dependent bar (this item)
      const fromXPct = Math.min(100, ((fromDates.endMs - s) / range) * 100)
      const toXPct = Math.max(0, ((toDates.startMs - s) / range) * 100)

      // Check if both are at least partially visible
      if (fromXPct < -10 || toXPct > 110) continue

      // Y positions: center of row
      const fromY = headerHeight + fromRow * rowHeight + rowHeight / 2
      const toY = headerHeight + toRow * rowHeight + rowHeight / 2

      // Convert % to a large viewBox-relative X (use 1000 as reference width for the timeline area)
      // Actually, we'll use a 'calc' approach - but SVG doesn't support calc.
      // Instead, we'll use the scrollContainer width if available
      const containerWidth = scrollContainer.value?.scrollWidth || scrollContainer.value?.clientWidth || 1000
      const timelineWidth = containerWidth - leftPanelWidth

      const fromX = leftPanelWidth + (fromXPct / 100) * timelineWidth
      const toX = leftPanelWidth + (toXPct / 100) * timelineWidth

      // Create elbow path: right → down/up → right into target
      const midX = (fromX + toX) / 2
      const elbowRadius = Math.min(8, Math.abs(toY - fromY) / 2, Math.abs(toX - fromX) / 4)

      let path: string
      if (Math.abs(fromY - toY) < 2) {
        // Same row: straight line
        path = `M ${fromX} ${fromY} L ${toX - 8} ${toY}`
      } else {
        // Elbow path
        const dir = toY > fromY ? 1 : -1
        path = `M ${fromX} ${fromY} L ${midX - elbowRadius} ${fromY} Q ${midX} ${fromY} ${midX} ${fromY + dir * elbowRadius} L ${midX} ${toY - dir * elbowRadius} Q ${midX} ${toY} ${midX + elbowRadius} ${toY} L ${toX - 8} ${toY}`
      }

      arrows.push({ fromTaskId: dep.dependsOnTaskId, toTaskId: item.id, path })
    }
  }

  return arrows
})

// --- Drag to resize ---
interface DragState {
  itemId: string
  edge: 'start' | 'end'
  initialMouseX: number
  initialStartMs: number
  initialEndMs: number
  currentStartMs: number
  currentEndMs: number
}

const dragState = ref<DragState | null>(null)

const dragGhostStyle = computed(() => {
  if (!dragState.value) return { left: '0%', width: '0%' }
  const s = rangeStart.value.getTime()
  const e = rangeEnd.value.getTime()
  const range = e - s

  const left = Math.max(0, ((dragState.value.currentStartMs - s) / range) * 100)
  const right = Math.min(100, ((dragState.value.currentEndMs - s) / range) * 100)
  const width = Math.max(1, right - left)

  return { left: `${left}%`, width: `${width}%` }
})

function startDrag(item: BoardItem, edge: 'start' | 'end', event: MouseEvent) {
  const dates = getItemDates(item)
  if (!dates) return

  dragState.value = {
    itemId: item.id,
    edge,
    initialMouseX: event.clientX,
    initialStartMs: dates.startMs,
    initialEndMs: dates.endMs,
    currentStartMs: dates.startMs,
    currentEndMs: dates.endMs,
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!dragState.value) return
    const containerEl = scrollContainer.value
    if (!containerEl) return

    const timelineWidth = (containerEl.scrollWidth || containerEl.clientWidth) - 200
    const range = rangeEnd.value.getTime() - rangeStart.value.getTime()
    const pxToMs = range / timelineWidth
    const deltaX = e.clientX - dragState.value.initialMouseX
    const deltaMs = deltaX * pxToMs

    if (dragState.value.edge === 'start') {
      const newStart = dragState.value.initialStartMs + deltaMs
      dragState.value.currentStartMs = Math.min(newStart, dragState.value.currentEndMs - 86400000)
    } else {
      const newEnd = dragState.value.initialEndMs + deltaMs
      dragState.value.currentEndMs = Math.max(newEnd, dragState.value.currentStartMs + 86400000)
    }
  }

  const onMouseUp = async () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)

    if (!dragState.value || !props.handleCellUpdate) return

    const { itemId, currentStartMs, currentEndMs, initialStartMs, initialEndMs } = dragState.value

    // Only update if changed
    if (currentStartMs !== initialStartMs || currentEndMs !== initialEndMs) {
      const newStart = new Date(currentStartMs).toISOString().split('T')[0]
      const newEnd = new Date(currentEndMs).toISOString().split('T')[0]

      if (dateColumn.value) {
        await props.handleCellUpdate(itemId, dateColumn.value.id, {
          dateValue: newStart,
          dateEndValue: newEnd,
        })
      }
    }

    dragState.value = null
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>
