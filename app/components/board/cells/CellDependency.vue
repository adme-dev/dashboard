<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="flex items-center gap-1 min-h-[28px] px-1 rounded hover:bg-gray-100 cursor-pointer w-full"
      @click="togglePicker"
    >
      <div v-if="dependencyCount" class="flex items-center gap-1.5">
        <UIcon name="i-lucide-git-branch" class="w-3.5 h-3.5 text-purple-500" />
        <span class="text-xs text-gray-700">{{ dependencyCount }} dep{{ dependencyCount > 1 ? 's' : '' }}</span>
      </div>
      <span v-else class="text-sm text-gray-400">-</span>
    </div>

    <!-- Dependency Popover -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100] bg-white rounded-lg shadow-xl border w-72"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <div class="p-3 border-b">
          <h4 class="text-sm font-medium text-gray-900">Dependencies</h4>
        </div>
        <div v-if="currentDeps.length" class="max-h-48 overflow-y-auto py-2">
          <div
            v-for="dep in currentDeps"
            :key="dep"
            class="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50"
          >
            <span class="text-sm text-gray-700 truncate">{{ dep }}</span>
            <button @click="removeDep(dep)" class="text-gray-400 hover:text-red-500">
              <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p v-else class="px-3 py-4 text-sm text-gray-400 text-center">No dependencies</p>
        <div class="p-2 border-t">
          <div class="flex items-center gap-1">
            <input
              v-model="newDepId"
              type="text"
              placeholder="Task ID..."
              class="flex-1 px-2 py-1.5 text-sm border rounded outline-none focus:border-blue-500"
              @keydown.enter="addDep"
            />
            <UButton size="xs" color="primary" @click="addDep" :disabled="!newDepId.trim()">Add</UButton>
          </div>
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
const newDepId = ref('')
const pickerPosition = ref({ x: 0, y: 0 })

const currentDeps = computed<string[]>(() => props.value?.jsonValue?.taskIds || [])
const dependencyCount = computed(() => currentDeps.value.length)

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
  newDepId.value = ''
}

function addDep() {
  const id = newDepId.value.trim()
  if (!id || currentDeps.value.includes(id)) return
  emit('update', { jsonValue: { taskIds: [...currentDeps.value, id] } })
  newDepId.value = ''
}

function removeDep(id: string) {
  emit('update', { jsonValue: { taskIds: currentDeps.value.filter((d) => d !== id) } })
}
</script>
