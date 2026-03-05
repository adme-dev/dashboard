<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Controls -->
    <div class="flex items-center justify-between p-3 border-b dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-chevron-left" variant="ghost" size="sm" @click="navigatePrev" />
        <UButton variant="outline" size="sm" @click="goToToday">Today</UButton>
        <UButton icon="i-lucide-chevron-right" variant="ghost" size="sm" @click="navigateNext" />
        <span class="text-sm font-semibold ml-2">
          {{ currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Date column selector -->
        <select
          v-if="dateColumns.length > 1"
          v-model="selectedDateColumnId"
          class="text-xs border border-gray-300 dark:border-neutral-600 rounded px-2 py-1 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 outline-none focus:border-blue-500"
        >
          <option v-for="col in dateColumns" :key="col.id" :value="col.id">{{ col.name }}</option>
        </select>
        <!-- View mode toggle -->
        <div class="flex items-center gap-1">
          <button
            v-for="m in modes"
            :key="m"
            class="px-2.5 py-1 text-xs font-medium rounded transition-colors"
            :class="viewMode === m ? 'bg-gray-200 dark:bg-neutral-700 text-gray-900 dark:text-neutral-100' : 'text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200'"
            @click="viewMode = m"
          >
            {{ m.charAt(0).toUpperCase() + m.slice(1) }}
          </button>
        </div>
      </div>
    </div>

    <!-- Scheduling banner -->
    <div v-if="schedulingItem" class="mx-4 mt-3 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
      <span class="text-xs text-blue-700 dark:text-blue-300">
        Click a day to schedule "<span class="font-medium">{{ schedulingItem.title }}</span>"
      </span>
      <button class="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 font-medium" @click="schedulingItemId = null">Cancel</button>
    </div>

    <!-- Calendar -->
    <div class="flex-1 overflow-auto p-4">
      <!-- Weekday headers -->
      <div class="grid grid-cols-7 gap-1 mb-1">
        <div
          v-for="d in dayNames"
          :key="d"
          class="text-center text-xs font-semibold text-gray-500 dark:text-neutral-400 py-1"
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
            class="min-h-[100px] border dark:border-neutral-700 rounded-lg p-1.5 transition-colors flex flex-col"
            :class="{
              'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-800': day.isToday,
              'opacity-40': !day.isCurrentMonth,
              'hover:bg-gray-50 dark:hover:bg-neutral-800': day.isCurrentMonth && !schedulingItemId,
              'hover:bg-blue-50 dark:hover:bg-blue-950 cursor-pointer': !!schedulingItemId && day.isCurrentMonth,
            }"
          >
            <div class="text-xs font-medium mb-1" :class="day.isToday ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-neutral-300'">
              {{ day.date.getDate() }}
            </div>
            <div class="space-y-0.5">
              <div
                v-for="item in day.items.slice(0, 3)"
                :key="item.id"
                class="text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:brightness-110"
                :style="{ backgroundColor: item.statusColor || '#6B7280', color: 'white' }"
                @click.stop="$emit('openTask', item.id)"
              >
                {{ item.title }}
              </div>
              <div v-if="day.items.length > 3" class="text-xs text-gray-400 dark:text-neutral-500 px-1">
                +{{ day.items.length - 3 }} more
              </div>
            </div>
            <!-- Inline add input -->
            <div v-if="addingDate === day.dateStr" class="mt-1" @click.stop>
              <input
                ref="addInputRef"
                v-model="addingTitle"
                placeholder="New item..."
                class="w-full text-xs px-1.5 py-1 border dark:border-neutral-600 rounded outline-none bg-white dark:bg-neutral-800 dark:text-neutral-200 focus:border-blue-500"
                @keydown.enter="handleAddSubmit"
                @keydown.escape="cancelAdd"
                @blur="cancelAdd"
              />
            </div>
            <!-- Clickable empty area -->
            <div v-else class="flex-1 min-h-[24px] cursor-pointer" @click="handleDayClick(day)" />
          </div>
        </div>
      </div>

      <!-- Week view -->
      <div v-else class="grid grid-cols-7 gap-1">
        <div
          v-for="day in weekDays"
          :key="day.dateStr"
          class="min-h-[300px] border dark:border-neutral-700 rounded-lg p-2 transition-colors flex flex-col"
          :class="{
            'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-800': day.isToday,
            'hover:bg-gray-50 dark:hover:bg-neutral-800': !schedulingItemId,
            'hover:bg-blue-50 dark:hover:bg-blue-950 cursor-pointer': !!schedulingItemId,
          }"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium" :class="day.isToday ? 'text-blue-700 dark:text-blue-400' : ''">
              {{ day.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) }}
            </span>
            <span v-if="day.items.length" class="text-xs text-gray-400 dark:text-neutral-500">{{ day.items.length }}</span>
          </div>
          <div class="space-y-1">
            <div
              v-for="item in day.items"
              :key="item.id"
              class="text-xs px-2 py-1.5 rounded cursor-pointer hover:brightness-110"
              :style="{ backgroundColor: item.statusColor || '#6B7280', color: 'white' }"
              @click.stop="$emit('openTask', item.id)"
            >
              <p class="truncate">{{ item.title }}</p>
            </div>
          </div>
          <!-- Inline add input -->
          <div v-if="addingDate === day.dateStr" class="mt-1" @click.stop>
            <input
              ref="addInputRef"
              v-model="addingTitle"
              placeholder="New item..."
              class="w-full text-xs px-1.5 py-1 border dark:border-neutral-600 rounded outline-none bg-white dark:bg-neutral-800 dark:text-neutral-200 focus:border-blue-500"
              @keydown.enter="handleAddSubmit"
              @keydown.escape="cancelAdd"
              @blur="cancelAdd"
            />
          </div>
          <!-- Clickable empty area -->
          <div v-else class="flex-1 min-h-[30px] cursor-pointer" @click="handleDayClick(day)" />
        </div>
      </div>

      <!-- Unscheduled items -->
      <div v-if="unscheduledItems.length > 0" class="mt-4 border dark:border-neutral-700 rounded-lg bg-gray-50 dark:bg-neutral-800 p-3">
        <h4 class="text-xs font-semibold text-gray-500 dark:text-neutral-400 mb-2">Unscheduled ({{ unscheduledItems.length }})</h4>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="item in unscheduledItems"
            :key="item.id"
            class="text-xs px-2.5 py-1.5 rounded cursor-pointer hover:shadow-sm border transition-all"
            :class="schedulingItemId === item.id
              ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
              : 'bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-200 border-gray-200 dark:border-neutral-600'"
            @click="toggleScheduling(item.id)"
          >
            {{ item.title }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CustomColumn, TaskColumnValue } from '~/types'
import type { BoardColumn, BoardItem, BoardGroup } from '~/composables/useBoardData'

const props = defineProps<{
  groups: BoardGroup[]
  columns: BoardColumn[]
  getCellValue: (item: BoardItem, col: BoardColumn) => TaskColumnValue | null
  normalizeColumn?: (col: BoardColumn) => CustomColumn
}>()

const emit = defineEmits<{
  openTask: [taskId: string]
  cellUpdate: [taskId: string, columnId: string, payload: any]
  addItem: [payload: { groupId: string; title: string; date: string }]
}>()

const modes = ['month', 'week'] as const
type ViewMode = (typeof modes)[number]
const viewMode = ref<ViewMode>('month')

const today = new Date()
const currentDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Feature 5: Date column selector
const selectedDateColumnId = ref<string | null>(null)

const dateColumns = computed(() =>
  props.columns.filter(c => {
    const t = c.columnType || c.type
    return t === 'date' || t === 'timeline'
  })
)

const dateColumn = computed(() => {
  if (selectedDateColumnId.value) {
    return dateColumns.value.find(c => c.id === selectedDateColumnId.value) || dateColumns.value[0]
  }
  return dateColumns.value[0] || null
})

// Initialize selected date column when columns change
watch(dateColumns, (cols) => {
  if (cols.length > 0 && !selectedDateColumnId.value) {
    selectedDateColumnId.value = cols[0].id
  }
}, { immediate: true })

// Feature 1: Click a day to create item
const addingDate = ref<string | null>(null)
const addingTitle = ref('')
const addInputRef = ref<HTMLInputElement[] | null>(null)

// Feature 2: Quick-schedule unscheduled items
const schedulingItemId = ref<string | null>(null)

const schedulingItem = computed(() => {
  if (!schedulingItemId.value) return null
  return allItems.value.find(i => i.id === schedulingItemId.value) || null
})

// All items
const allItems = computed<BoardItem[]>(() => {
  const items: BoardItem[] = []
  for (const g of props.groups) items.push(...g.items)
  return items
})

const unscheduledItems = computed(() =>
  allItems.value.filter(item => !getItemDate(item))
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

// Day click handler (Feature 1 + 2)
interface CalendarDay {
  date: Date
  dateStr: string
  isCurrentMonth?: boolean
  isToday: boolean
  items: BoardItem[]
}

function handleDayClick(day: CalendarDay) {
  // Feature 2: if scheduling mode, assign date to the selected unscheduled item
  if (schedulingItemId.value && dateColumn.value) {
    emit('cellUpdate', schedulingItemId.value, dateColumn.value.id, { dateValue: day.dateStr })
    schedulingItemId.value = null
    return
  }
  // Feature 1: open inline add input
  addingDate.value = day.dateStr
  addingTitle.value = ''
  nextTick(() => {
    if (addInputRef.value?.length) {
      addInputRef.value[0].focus()
    }
  })
}

function handleAddSubmit() {
  const title = addingTitle.value.trim()
  if (!title || !addingDate.value) return
  emit('addItem', {
    groupId: props.groups[0]?.id || '__ungrouped__',
    title,
    date: addingDate.value,
  })
  addingTitle.value = ''
  addingDate.value = null
}

function cancelAdd() {
  addingDate.value = null
  addingTitle.value = ''
}

function toggleScheduling(itemId: string) {
  schedulingItemId.value = schedulingItemId.value === itemId ? null : itemId
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

  const days: CalendarDay[] = []
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
  const result: CalendarDay[][] = []
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

  const days: CalendarDay[] = []
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
