<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Controls -->
    <div class="flex items-center justify-between p-3 border-b bg-white">
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
      <div class="flex items-center gap-2">
        <button
          v-for="z in zoomLevels"
          :key="z.value"
          class="px-2.5 py-1 text-xs font-medium rounded transition-colors"
          :class="zoom === z.value ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          @click="zoom = z.value"
        >
          {{ z.label }}
        </button>
      </div>
    </div>

    <!-- Timeline Grid -->
    <div class="flex-1 overflow-auto relative">
      <!-- Today indicator -->
      <div
        v-if="todayLeft !== null"
        class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
        :style="{ left: `calc(200px + ${todayLeft}%)` }"
      >
        <div class="absolute -top-0.5 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
      </div>

      <!-- Date header -->
      <div class="sticky top-0 z-10 flex border-b bg-white">
        <div class="w-[200px] flex-shrink-0 p-2 border-r text-xs font-semibold text-gray-500 uppercase">
          Item
        </div>
        <div class="flex-1 flex">
          <div
            v-for="col in dateColumns"
            :key="col.label"
            class="flex-1 min-w-[50px] p-2 text-center text-xs border-r last:border-r-0"
            :class="{
              'bg-blue-50 font-semibold text-blue-700': col.isToday,
              'bg-gray-50/50': col.isWeekend,
            }"
          >
            {{ col.label }}
          </div>
        </div>
      </div>

      <!-- Task rows -->
      <div v-for="group in groups" :key="group.id">
        <!-- Group header if multiple -->
        <div v-if="groups.length > 1" class="flex border-b bg-gray-50 sticky top-[37px] z-[5]">
          <div class="w-[200px] flex-shrink-0 p-2 border-r text-sm font-semibold flex items-center gap-2">
            <span class="w-2 h-2 rounded-sm" :style="{ backgroundColor: group.color }" />
            {{ group.name }}
            <span class="text-xs text-gray-400 font-normal">({{ group.items.length }})</span>
          </div>
          <div class="flex-1" />
        </div>

        <div
          v-for="item in group.items"
          :key="item.id"
          class="flex border-b hover:bg-gray-50/50 min-h-[40px] relative"
        >
          <!-- Item name -->
          <div
            class="w-[200px] flex-shrink-0 p-2 border-r text-sm truncate cursor-pointer hover:text-blue-600"
            @click="$emit('openTask', item.id)"
          >
            {{ item.title }}
          </div>
          <!-- Bar -->
          <div class="flex-1 relative py-1.5">
            <div
              v-if="getBar(item)"
              class="absolute h-5 rounded cursor-pointer hover:brightness-110 transition-all"
              :style="{
                left: getBar(item)!.left,
                width: getBar(item)!.width,
                backgroundColor: getBar(item)!.color,
                top: '50%',
                transform: 'translateY(-50%)',
              }"
              @click="$emit('openTask', item.id)"
            >
              <span class="px-2 text-xs text-white truncate leading-5 block">{{ item.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-if="allItems.length === 0" class="flex items-center justify-center p-12">
        <div class="text-center">
          <UIcon name="i-lucide-gantt-chart" class="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p class="text-gray-500">No items to display on timeline</p>
        </div>
      </div>
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
}>()

defineEmits<{
  openTask: [taskId: string]
}>()

type ZoomLevel = 'day' | 'week' | 'month'
const zoom = ref<ZoomLevel>('week')
const zoomLevels = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
]

const today = new Date()
const rangeStart = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const rangeEnd = ref(new Date(today.getFullYear(), today.getMonth() + 2, 0))

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

const dateColumns = computed(() => {
  const cols: { label: string; isToday: boolean; isWeekend: boolean }[] = []
  const cur = new Date(rangeStart.value)
  const end = new Date(rangeEnd.value)
  const todayStr = today.toDateString()

  while (cur <= end) {
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6
    let label: string
    switch (zoom.value) {
      case 'day':
        label = cur.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
        cols.push({ label, isToday: cur.toDateString() === todayStr, isWeekend })
        cur.setDate(cur.getDate() + 1)
        break
      case 'week':
        label = cur.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        cols.push({ label, isToday: cur.toDateString() === todayStr, isWeekend: false })
        cur.setDate(cur.getDate() + 7)
        break
      case 'month':
        label = cur.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
        cols.push({ label, isToday: cur.getMonth() === today.getMonth() && cur.getFullYear() === today.getFullYear(), isWeekend: false })
        cur.setMonth(cur.getMonth() + 1)
        break
    }
  }
  return cols
})

const todayLeft = computed(() => {
  const s = rangeStart.value.getTime()
  const e = rangeEnd.value.getTime()
  const t = today.getTime()
  if (t < s || t > e) return null
  return ((t - s) / (e - s)) * 100
})

// Color palette for items without explicit status color
const barColors = ['#579BFC', '#00C875', '#FDAB3D', '#A25DDC', '#FF5AC4', '#FF642E']

function getBar(item: BoardItem): { left: string; width: string; color: string } | null {
  let startMs: number | null = null
  let endMs: number | null = null

  // Try timeline/date column value first
  if (dateColumn.value) {
    const cv = props.getCellValue(item, dateColumn.value)
    if (cv?.dateValue) startMs = new Date(cv.dateValue).getTime()
    if (cv?.dateEndValue) endMs = new Date(cv.dateEndValue).getTime()
  }

  // Fallback to item.dueDate
  if (!startMs && item.dueDate) {
    startMs = new Date(item.dueDate).getTime()
  }

  if (!startMs) return null
  if (!endMs) endMs = startMs + 7 * 86400000 // default 1 week

  const s = rangeStart.value.getTime()
  const e = rangeEnd.value.getTime()
  const range = e - s

  const left = Math.max(0, ((startMs - s) / range) * 100)
  const right = Math.min(100, ((endMs - s) / range) * 100)
  const width = Math.max(2, right - left)

  const color = item.statusColor || barColors[item.title.length % barColors.length]

  return { left: `${left}%`, width: `${width}%`, color }
}
</script>
