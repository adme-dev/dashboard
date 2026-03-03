<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 cursor-pointer"
      @click="togglePicker"
    >
      <span
        class="w-6 h-6 rounded border"
        :style="{ backgroundColor: currentColor || '#E5E7EB' }"
      />
      <span class="text-xs text-gray-500 dark:text-neutral-400">{{ currentColor || '-' }}</span>
    </div>

    <!-- Color Picker Popover -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100] bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 w-56 p-3"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <div class="grid grid-cols-7 gap-2 mb-3">
          <button
            v-for="color in presetColors"
            :key="color"
            class="w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform"
            :class="currentColor === color ? 'border-blue-500' : 'border-transparent'"
            :style="{ backgroundColor: color }"
            @click="selectColor(color)"
          />
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="customColor"
            type="color"
            class="w-8 h-8 rounded border border-gray-200 dark:border-neutral-700 cursor-pointer"
          />
          <input
            v-model="customColor"
            type="text"
            placeholder="#000000"
            class="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded outline-none focus:border-blue-500"
            @keydown.enter="selectColor(customColor)"
          />
        </div>
        <div class="mt-2 flex justify-end">
          <UButton size="xs" color="primary" @click="selectColor(customColor)">Apply</UButton>
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
const customColor = ref('#000000')
const pickerPosition = ref({ x: 0, y: 0 })

const currentColor = computed(() => props.value?.textValue || '')

const presetColors = [
  '#E2445C', '#FF642E', '#FDAB3D', '#FFCC00', '#CAB641',
  '#00C875', '#9CD326', '#579BFC', '#A25DDC', '#FF5AC4',
  '#7BC86C', '#4ECDC4', '#784848', '#6B7280', '#000000',
  '#C4C4C4', '#FFB3BA', '#99E6FF', '#B39DDB', '#F8BBD9',
  '#FFFFFF',
]

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  customColor.value = currentColor.value || '#000000'
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
}

function selectColor(color: string) {
  emit('update', { textValue: color })
  closePicker()
}
</script>
