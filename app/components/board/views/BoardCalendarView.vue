<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Controls -->
    <div class="flex items-center justify-between p-3 border-b bg-white">
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-chevron-left" variant="ghost" size="sm" @click="navigatePrev" />
        <UButton variant="outline" size="sm" @click="goToToday">Today</UButton>
        <UButton icon="i-lucide-chevron-right" variant="ghost" size="sm" @click="navigateNext" />
        <span class="text-sm font-semibold ml-2">
          {{ currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-for="m in modes"
          :key="m"
          class="px-2.5 py-1 text-xs font-medium rounded transition-colors"
          :class="viewMode === m ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          @click="viewMode = m"
        >
          {{ m.charAt(0).toUpperCase() + m.slice(1) }}
        </button>
      </div>
    </div>

    <!-- Calendar -->
    <div class="flex-1 overflow-auto p-4">
      <!-- Weekday headers -->
      <div class="grid grid-cols-7 gap-1 mb-1">
        <div
          v-for="d in dayNames"
          :key="d"
          class="text-center text-xs font-semibold text-gray-500 py-1"
        >
          {{ d }}
        </div>
      </div>

      <!-- Month view -->
      <div v-if="viewMode === 'month'" class="grid gap-1">
        <div
          v-for="(week, wi) in weeks"
          :key="wi"
          class="grid grid-cols-7 gap-1"
        >
          <div
            v-for="day in week"
            :key="day.dateStr"
            class="min-h-[100px] border rounded-lg p-1.5 transition-colors"
            :class="{
              'bg-blue-50 border-blue-300': day.isToday,
              'opacity-40': !day.isCurrentMonth,
              'hover:bg-gray-50': day.isCurrentMonth,
            }"
          >
            <div class="text-xs font-medium mb-1" :class="day.isToday ? 'text-blue-700' : 'text-gray-600'">
              {{ day.date.getDate() }}
            </div>
            <div class="space-y-0.5">
              <div
                v-for="item in day.items.slice(0, 3)"
                :key="item.id"
                class="text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:brightness-110"
                :style="{ backgroundColor: item.statusColor || '#6B7280', color: 'white' }"
                @click="$emit('openTask', item.id)"
              >
                {{ item.title }}
              </div>
              <div v-if="day.items.length > 3" class="text-xs text-gray-400 px-1">
                +{{ day.items.length - 3 }} more
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Week view -->
      <div v-else class="grid grid-cols-7 gap-1">
        <div
          v-for="day in weekDays"
          :key="day.dateStr"
          class="min-h-[300px] border rounded-lg p-2 transition-colors"
          :class="{
            'bg-blue-50 border-blue-300': day.isToday,
            'hover:bg-gray-50': true,
          }"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium" :class="day.isToday ? 'text-blue-700' : ''">
              {{ day.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) }}
            </span>
            <span v-if="day.items.length" class="text-xs text-gray-400">{{ day.items.length }}</span>
          </div>
          <div class="space-y-1">
            <div
              v-for="item in day.items"
              :key="item.id"
              class="text-xs px-2 py-1.5 rounded cursor-pointer hover:brightness-110"
              :style="{ backgroundColor: item.statusColor || '#6B7280', color: 'white' }"
              @click="$emit('openTask', item.id)"
            >
              <p class="truncate">{{ item.title }}</p>
            </div>
          </div>
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

const modes = ['month', 'week'] as const
type ViewMode = (typeof modes)[number]
const viewMode = ref<ViewMode>('month')

const today = new Date()
const currentDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// All items
const allItems = computed<BoardItem[]>(() => {
  const items: BoardItem[] = []
  for (const g of props.groups) items.push(...g.items)
  return items
})

// Find date column
const dateColumn = computed(() =>
  props.columns.find(c => {
    const t = c.columnType || c.type
    return t === 'date' || t === 'timeline'
  })
)

function getItemDate(item: BoardItem): string | null {
  if (dateColumn.value) {
    const cv = props.getCellValue(item, dateColumn.value)
    if (cv?.dateValue) return cv.dateValue.split('T')[0]
  }
  if (item.dueDate) return item.dueDate.split('T')[0]
  return null
}

function itemsForDate(dateStr: string): BoardItem[] {
  return allItems.value.filter(item => getItemDate(item) === dateStr)
}

// Month calendar
const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const start = new Date(firstDay)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(lastDay)
  end.setDate(end.getDate() + (6 - end.getDay()))

  const days: { date: Date; dateStr: string; isCurrentMonth: boolean; isToday: boolean; items: BoardItem[] }[] = []
  const cur = new Date(start)
  const todayStr = today.toISOString().split('T')[0]

  while (cur <= end) {
    const ds = cur.toISOString().split('T')[0]
    days.push({
      date: new Date(cur),
      dateStr: ds,
      isCurrentMonth: cur.getMonth() === month,
      isToday: ds === todayStr,
      items: itemsForDate(ds),
    })
    cur.setDate(cur.getDate() + 1)
  }
  return days
})

const weeks = computed(() => {
  const result: (typeof calendarDays.value)[] = []
  for (let i = 0; i < calendarDays.value.length; i += 7) {
    result.push(calendarDays.value.slice(i, i + 7))
  }
  return result
})

// Week view
const weekDays = computed(() => {
  const start = new Date(currentDate.value)
  const dayOfWeek = start.getDay()
  start.setDate(start.getDate() - dayOfWeek)
  const todayStr = today.toISOString().split('T')[0]

  const days: { date: Date; dateStr: string; isToday: boolean; items: BoardItem[] }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const ds = d.toISOString().split('T')[0]
    days.push({
      date: d,
      dateStr: ds,
      isToday: ds === todayStr,
      items: itemsForDate(ds),
    })
  }
  return days
})

function navigatePrev() {
  const d = new Date(currentDate.value)
  if (viewMode.value === 'week') d.setDate(d.getDate() - 7)
  else d.setMonth(d.getMonth() - 1)
  currentDate.value = d
}

function navigateNext() {
  const d = new Date(currentDate.value)
  if (viewMode.value === 'week') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  currentDate.value = d
}

function goToToday() {
  currentDate.value = new Date(today.getFullYear(), today.getMonth(), today.getDate())
}
</script>
