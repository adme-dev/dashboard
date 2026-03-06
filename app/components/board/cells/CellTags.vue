<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="flex items-center gap-1 min-h-[28px] px-1 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 cursor-pointer w-full"
      @click="togglePicker"
    >
      <div v-if="currentTags.length" class="flex flex-wrap gap-1">
        <span
          v-for="tag in currentTags.slice(0, 3)"
          :key="tag"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-300"
        >
          {{ tag }}
          <button v-if="!readonly" @click.stop="removeTag(tag)" class="ml-1 hover:text-red-500">
            <UIcon name="i-lucide-x" class="w-3 h-3" />
          </button>
        </span>
        <span v-if="currentTags.length > 3" class="text-xs text-gray-500 dark:text-neutral-400">+{{ currentTags.length - 3 }}</span>
      </div>
      <span v-else class="text-sm text-gray-400 dark:text-neutral-500">-</span>
    </div>

    <!-- Tag Input Popover -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100] bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 w-64"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <div class="p-2">
          <div class="flex items-center gap-1">
            <input
              v-model="newTag"
              type="text"
              placeholder="Add tag..."
              class="flex-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded outline-none focus:border-blue-500"
              @keydown.enter="addTag"
            />
            <UButton size="xs" color="primary" @click="addTag" :disabled="!newTag.trim()">Add</UButton>
          </div>
        </div>
        <div v-if="currentTags.length" class="px-2 pb-2">
          <div class="flex flex-wrap gap-1">
            <span
              v-for="tag in currentTags"
              :key="tag"
              class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-300"
            >
              {{ tag }}
              <button @click="removeTag(tag)" class="ml-1 hover:text-red-500">
                <UIcon name="i-lucide-x" class="w-3 h-3" />
              </button>
            </span>
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
const newTag = ref('')
const pickerPosition = ref({ x: 0, y: 0 })

const currentTags = computed<string[]>(() => props.value?.jsonValue?.tags || [])

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = computePopoverPosition(rect, 256, 300)
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
  newTag.value = ''
}

function addTag() {
  const tag = newTag.value.trim()
  if (!tag || currentTags.value.includes(tag)) return
  emit('update', { jsonValue: { tags: [...currentTags.value, tag] } })
  newTag.value = ''
}

function removeTag(tag: string) {
  emit('update', { jsonValue: { tags: currentTags.value.filter((t) => t !== tag) } })
}
</script>
