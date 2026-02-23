<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="flex items-center gap-1 min-h-[28px] px-1 rounded hover:bg-gray-100 cursor-pointer w-full"
      @click="togglePicker"
    >
      <div v-if="selectedOptions.length" class="flex flex-wrap gap-1">
        <span
          v-for="opt in selectedOptions.slice(0, 2)"
          :key="opt.value"
          class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
          :style="{ backgroundColor: opt.color + '20', color: opt.color }"
        >
          {{ opt.label }}
        </span>
        <span v-if="selectedOptions.length > 2" class="text-xs text-gray-500">
          +{{ selectedOptions.length - 2 }}
        </span>
      </div>
      <span v-else class="text-sm text-gray-400">-</span>
    </div>

    <!-- Dropdown Picker -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100] bg-white rounded-lg shadow-xl border w-64 max-h-80"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <div class="p-2 border-b">
          <input
            v-model="search"
            type="text"
            placeholder="Search..."
            class="w-full px-2 py-1.5 text-sm border rounded outline-none focus:border-blue-500"
          />
        </div>
        <div class="max-h-52 overflow-y-auto py-1">
          <button
            v-for="opt in filteredOptions"
            :key="opt.value"
            class="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-left"
            :class="{ 'bg-blue-50': isSelected(opt) }"
            @click="toggleOption(opt)"
          >
            <span
              class="w-3 h-3 rounded-sm flex-shrink-0"
              :style="{ backgroundColor: opt.color || '#6B7280' }"
            />
            <span class="flex-1 truncate">{{ opt.label }}</span>
            <UIcon v-if="isSelected(opt)" name="i-lucide-check" class="w-4 h-4 text-blue-600" />
          </button>
          <p v-if="!filteredOptions.length" class="px-3 py-2 text-sm text-gray-400">No options</p>
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
const search = ref('')
const pickerPosition = ref({ x: 0, y: 0 })

const options = computed(() => props.column.settings?.options || [])
const selectedIds = computed<string[]>(() => props.value?.jsonValue?.optionIds || [])

const selectedOptions = computed(() =>
  options.value.filter((o: any) => selectedIds.value.includes(o.value || o.id))
)

const filteredOptions = computed(() => {
  if (!search.value) return options.value
  const q = search.value.toLowerCase()
  return options.value.filter((o: any) => o.label.toLowerCase().includes(q))
})

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

function isSelected(opt: any): boolean {
  return selectedIds.value.includes(opt.value || opt.id)
}

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
  search.value = ''
}

function toggleOption(opt: any) {
  const id = opt.value || opt.id
  const current = [...selectedIds.value]
  const idx = current.indexOf(id)
  if (idx > -1) current.splice(idx, 1)
  else current.push(id)
  emit('update', { jsonValue: { optionIds: current } })
}
</script>
