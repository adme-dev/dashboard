<template>
  <div class="min-h-[28px] flex items-center relative" @click.stop>
    <div
      class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer hover:bg-gray-100 transition-colors"
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
        class="fixed z-[100] bg-white rounded-lg shadow-xl border w-[280px] p-3"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <!-- Quick Select -->
        <div class="grid grid-cols-2 gap-2 mb-3">
          <button class="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-left" @click="setQuick('today')">Today</button>
          <button class="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-left" @click="setQuick('tomorrow')">Tomorrow</button>
          <button class="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-left" @click="setQuick('next_week')">Next week</button>
          <button class="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-left text-gray-400" @click="setQuick('none')">No Date</button>
        </div>

        <!-- Calendar -->
        <div class="border rounded-lg overflow-hidden">
          <UCalendar v-model="calendarModel" />
        </div>

        <!-- Footer -->
        <div class="mt-3 pt-3 border-t flex items-center justify-between">
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
const pickerPosition = ref({ x: 0, y: 0 })

const currentDateStr = computed(() => props.value?.dateValue || '')

const formattedDate = computed(() => {
  const d = currentDateStr.value
  if (!d) return '-'
  const date = new Date(d)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === now.toDateString()) return 'Today'
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
})

const dateColorClass = computed(() => {
  const d = currentDateStr.value
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  if (date < now) return 'text-red-600'
  if (date.toDateString() === now.toDateString()) return 'text-orange-600'
  return 'text-gray-700'
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
  localDate.value = currentDateStr.value
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
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
  confirmDate()
}

function clearDate() {
  emit('update', { dateValue: null })
  closePicker()
}

function confirmDate() {
  if (!localDate.value) return
  emit('update', { dateValue: localDate.value })
  closePicker()
}
</script>
