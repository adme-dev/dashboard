<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="flex items-center gap-1 min-h-[28px] px-1 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 cursor-pointer w-full"
      @click="togglePicker"
    >
      <div v-if="linkedCount" class="flex items-center gap-1.5">
        <UIcon name="i-lucide-link-2" class="w-3.5 h-3.5 text-blue-500" />
        <span class="text-xs text-gray-700 dark:text-neutral-300">{{ linkedCount }} linked</span>
      </div>
      <span v-else class="text-sm text-gray-400 dark:text-neutral-500">-</span>
    </div>

    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100]"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <LinkedItemPicker
          :task-id="taskId"
          @close="closePicker"
          @updated="onLinksUpdated"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { CustomColumn, TaskColumnValue } from '~/types'
import { computePopoverPosition } from '~/utils/popover-position'

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

const linkedCount = computed(() => props.value?.jsonValue?.count || 0)

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = computePopoverPosition(rect, 320, 400)
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
}

function onLinksUpdated(count: number) {
  emit('update', { jsonValue: { count } })
}
</script>
