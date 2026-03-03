<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="inline-flex items-center px-3 py-1 rounded text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity min-w-[80px] justify-center"
      :style="currentStyle"
      @click="togglePicker"
    >
      {{ currentLabel }}
    </div>

    <!-- Status Picker Popover -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100] bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 w-[360px]"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <!-- Search (shown when > 6 options) -->
        <div v-if="options.length > 6" class="p-3 border-b border-gray-200 dark:border-neutral-700">
          <div class="relative">
            <UIcon name="i-lucide-search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search..."
              class="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div class="p-3">
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="opt in filteredOptions"
              :key="opt.value || opt.id"
              class="px-2 py-2 rounded text-xs font-medium text-center hover:opacity-80 transition-opacity relative"
              :class="{ 'ring-2 ring-offset-1 ring-blue-500': isSelected(opt) }"
              :style="{ backgroundColor: opt.color, color: getContrastColor(opt.color) }"
              @click="selectStatus(opt)"
            >
              {{ opt.label || opt.name }}
            </button>
          </div>
        </div>

        <!-- Footer: Clear + Edit -->
        <div class="px-3 pb-3 flex items-center justify-between">
          <button
            v-if="selectedValue"
            class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200"
            @click="clearStatus"
          >
            <UIcon name="i-lucide-x-circle" class="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
          <span v-else />
          <button
            class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200"
            @click="$emit('editColumn')"
          >
            <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5" />
            <span>Edit Labels</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
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

const emit = defineEmits<{
  update: [payload: any]
  editColumn: []
}>()

const showPicker = ref(false)
const pickerPosition = ref({ x: 0, y: 0 })
const searchQuery = ref('')

const options = computed(() => {
  const opts = props.column.settings?.options || []
  if (opts.length > 0) return opts
  // Default status options
  return [
    { value: 'done', label: 'Done', color: '#00C875' },
    { value: 'working-on-it', label: 'Working On It', color: '#FDAB3D' },
    { value: 'stuck', label: 'Stuck', color: '#E2445C' },
    { value: 'not-started', label: 'Not Started', color: '#C4C4C4' },
  ]
})

const filteredOptions = computed(() => {
  if (!searchQuery.value) return options.value
  const q = searchQuery.value.toLowerCase()
  return options.value.filter((o: any) => (o.label || o.name || '').toLowerCase().includes(q))
})

const selectedValue = computed(() => props.value?.jsonValue?.optionId || props.value?.textValue || '')

const currentOption = computed(() =>
  options.value.find((o: any) => o.value === selectedValue.value || o.id === selectedValue.value)
)

const currentLabel = computed(() => currentOption.value?.label || currentOption.value?.name || selectedValue.value || '-')
const currentStyle = computed(() => {
  const color = currentOption.value?.color || '#E5E7EB'
  return {
    backgroundColor: color,
    color: getContrastColor(color),
  }
})

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

function getContrastColor(hex: string): string {
  if (!hex || hex === '#E5E7EB') return '#6B7280'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#333333' : '#ffffff'
}

function isSelected(opt: any): boolean {
  return (opt.value || opt.id) === selectedValue.value
}

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const popoverWidth = 360
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  // Clamp horizontal: prefer left-aligned, but shift left if it overflows
  let x = rect.left
  if (x + popoverWidth > viewportWidth - 8) {
    x = viewportWidth - popoverWidth - 8
  }
  if (x < 8) x = 8
  // Clamp vertical: show below by default, above if not enough space
  let y = rect.bottom + 8
  const estimatedHeight = 300
  if (y + estimatedHeight > viewportHeight - 8) {
    y = rect.top - estimatedHeight - 8
    if (y < 8) y = 8
  }
  pickerPosition.value = { x, y }
  showPicker.value = true
  searchQuery.value = ''
}

function closePicker() {
  showPicker.value = false
}

function selectStatus(opt: any) {
  emit('update', { jsonValue: { optionId: opt.value || opt.id }, textValue: opt.label || opt.name })
  closePicker()
}

function clearStatus() {
  emit('update', { jsonValue: { optionId: null }, textValue: null })
  closePicker()
}
</script>
