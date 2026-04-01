<template>
  <div class="min-h-[28px] flex items-center relative" @click.stop>
    <div
      class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
      :class="dateColorClass"
      @click="togglePicker"
    >
      <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5" />
      <span>{{ formattedDate }}</span>
    </div>

    <!-- Date Picker Popover -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100] bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 w-[280px] p-3"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <!-- Quick Select -->
        <div class="grid grid-cols-2 gap-2 mb-3">
          <button class="px-3 py-2 text-sm border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 text-left dark:text-neutral-100" @click="setQuick('today')">Today</button>
          <button class="px-3 py-2 text-sm border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 text-left dark:text-neutral-100" @click="setQuick('tomorrow')">Tomorrow</button>
          <button class="px-3 py-2 text-sm border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 text-left dark:text-neutral-100" @click="setQuick('next_week')">Next week</button>
          <button class="px-3 py-2 text-sm border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 text-left text-gray-400 dark:text-neutral-500" @click="setQuick('none')">No Date</button>
        </div>

        <!-- Calendar -->
        <div class="border border-gray-200 dark:border-neutral-700 rounded-lg overflow-hidden">
          <UCalendar v-model="calendarModel" />
        </div>

        <!-- Time Picker -->
        <div class="mt-3 pt-3 border-t border-gray-200 dark:border-neutral-700">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-clock" class="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 flex-shrink-0" />
            <div class="flex items-center gap-1 flex-1">
              <USelect
                v-model="localHour"
                :items="hours"
                size="sm"
                class="w-16"
              />
              <span class="text-gray-400 dark:text-neutral-500 font-medium">:</span>
              <USelect
                v-model="localMinute"
                :items="minutes"
                size="sm"
                class="w-16"
              />
            </div>
            <button
              v-if="localHour !== '09' || localMinute !== '00'"
              class="text-xs text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300"
              @click="localHour = '09'; localMinute = '00'"
            >Reset</button>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-3 pt-3 border-t border-gray-200 dark:border-neutral-700 flex items-center justify-between">
          <button class="text-sm text-red-600 hover:text-red-700" @click="clearDate">Clear</button>
          <div class="flex items-center gap-2">
            <UButton size="xs" variant="ghost" @click="closePicker">Cancel</UButton>
            <UButton size="xs" color="primary" @click="confirmDate" :disabled="!localDate">Set Date</UButton>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { CalendarDate, today, getLocalTimeZone } from '@internationalized/date'
import type { CustomColumn, TaskColumnValue } from '~/types'

interface ClickOutsideElement extends HTMLElement { _clickOutside?: (event: Event) => void }
const vClickOutside = {
  mounted(el: ClickOutsideElement, binding: any) {
    el._clickOutside = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) binding.value()
    }
    document.addEventListener('click', el._clickOutside, true)
  },
  unmounted(el: ClickOutsideElement) {
    if (el._clickOutside) document.removeEventListener('click', el._clickOutside, true)
  },
}

const props = defineProps<{
  column: CustomColumn
  value: TaskColumnValue | null
  taskId: string
  readonly?: boolean
}>()

const emit = defineEmits<{ update: [payload: any] }>()

const showPicker = ref(false)
const localDate = ref('')
const localHour = ref('09')
const localMinute = ref('00')
const pickerPosition = ref({ x: 0, y: 0 })

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const currentDateStr = computed(() => props.value?.dateValue || '')

const formattedDate = computed(() => {
  const d = currentDateStr.value
  if (!d) return '-'
  const date = new Date(d)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Check if value includes time (has T or contains hours)
  const hasTime = d.includes('T') && !d.endsWith('T00:00:00') && !d.endsWith('T00:00')
  const timeSuffix = hasTime ? ` ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}` : ''

  if (date.toDateString() === now.toDateString()) return 'Today' + timeSuffix
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow' + timeSuffix
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + timeSuffix
})

const dateColorClass = computed(() => {
  const d = currentDateStr.value
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  if (date < now) return 'text-red-600'
  if (date.toDateString() === now.toDateString()) return 'text-orange-600'
  return 'text-gray-700 dark:text-neutral-300'
})

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

const calendarModel = computed({
  get: () => {
    if (!localDate.value) return today(getLocalTimeZone())
    const [year, month, day] = localDate.value.split('-').map(Number)
    return new CalendarDate(year, month, day)
  },
  set: (val: any) => {
    localDate.value = val.toString()
  },
})

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const d = currentDateStr.value
  if (d && d.includes('T')) {
    localDate.value = d.split('T')[0]
    const timePart = d.split('T')[1] || ''
    const [h, m] = timePart.split(':')
    localHour.value = (h || '09').padStart(2, '0')
    localMinute.value = (m || '00').padStart(2, '0')
  } else {
    localDate.value = d
    localHour.value = '09'
    localMinute.value = '00'
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = computePopoverPosition(rect, 280, 480)
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
}

function setQuick(type: string) {
  const d = new Date()
  if (type === 'today') localDate.value = d.toISOString().split('T')[0]
  else if (type === 'tomorrow') { d.setDate(d.getDate() + 1); localDate.value = d.toISOString().split('T')[0] }
  else if (type === 'next_week') { d.setDate(d.getDate() + 7); localDate.value = d.toISOString().split('T')[0] }
  else if (type === 'none') { clearDate(); return }
  // Quick dates use 9am default
  localHour.value = '09'
  localMinute.value = '00'
  confirmDate()
}

function clearDate() {
  emit('update', { dateValue: null })
  closePicker()
}

function confirmDate() {
  if (!localDate.value) return
  const dateWithTime = `${localDate.value}T${localHour.value}:${localMinute.value}:00`
  emit('update', { dateValue: dateWithTime })
  closePicker()
}
</script>
