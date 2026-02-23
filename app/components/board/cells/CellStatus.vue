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
        class="fixed z-[100] bg-white rounded-lg shadow-xl border w-[360px] p-3"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="opt in options"
            :key="opt.value"
            class="px-2 py-2 rounded text-xs font-medium text-center hover:opacity-90 transition-opacity"
            :style="{ backgroundColor: opt.color, color: getContrastColor(opt.color) }"
            @click="selectStatus(opt)"
          >
            {{ opt.label }}
          </button>
        </div>
        <div class="mt-3 pt-3 border-t flex items-center gap-2">
          <button class="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
            <UIcon name="i-lucide-pencil" class="w-4 h-4" />
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

const emit = defineEmits<{ update: [payload: any] }>()

const showPicker = ref(false)
const pickerPosition = ref({ x: 0, y: 0 })

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

const selectedValue = computed(() => props.value?.jsonValue?.optionId || props.value?.textValue || '')

const currentOption = computed(() =>
  options.value.find((o: any) => o.value === selectedValue.value || o.id === selectedValue.value)
)

const currentLabel = computed(() => currentOption.value?.label || selectedValue.value || '-')
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

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
}

function selectStatus(opt: any) {
  emit('update', { jsonValue: { optionId: opt.value || opt.id }, textValue: opt.label })
  closePicker()
}
</script>
