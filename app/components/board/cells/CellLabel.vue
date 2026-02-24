<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="flex items-center gap-1 min-h-[28px] px-1 rounded hover:bg-gray-100 cursor-pointer w-full"
      @click="togglePicker"
    >
      <div v-if="assignedLabels.length" class="flex flex-wrap gap-1">
        <span
          v-for="label in assignedLabels.slice(0, 3)"
          :key="label.id"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          :style="{ backgroundColor: label.color + '20', color: label.color }"
        >
          {{ label.name }}
          <button v-if="!readonly" @click.stop="removeLabel(label.id)" class="ml-1 hover:opacity-70">
            <UIcon name="i-lucide-x" class="w-3 h-3" />
          </button>
        </span>
        <span v-if="assignedLabels.length > 3" class="text-xs text-gray-500">+{{ assignedLabels.length - 3 }}</span>
      </div>
      <span v-else class="text-sm text-gray-400">-</span>
    </div>

    <!-- Label Picker Popover -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100] bg-white rounded-lg shadow-xl border w-72"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <!-- Search -->
        <div class="p-3 border-b">
          <div class="relative">
            <UIcon name="i-lucide-search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search labels..."
              class="w-full pl-9 pr-3 py-2 text-sm border rounded-md outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <!-- Labels List -->
        <div class="max-h-64 overflow-y-auto py-1">
          <button
            v-for="label in filteredLabels"
            :key="label.id"
            class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors"
            :class="{ 'bg-blue-50': isSelected(label.id) }"
            @click="toggleLabel(label.id)"
          >
            <span
              class="w-4 h-4 rounded-sm flex-shrink-0 border"
              :style="{ backgroundColor: label.color, borderColor: label.color }"
            />
            <span class="text-sm text-gray-900 flex-1 text-left">{{ label.name }}</span>
            <UIcon v-if="isSelected(label.id)" name="i-lucide-check" class="w-4 h-4 text-blue-600" />
          </button>
          <p v-if="!filteredLabels.length && searchQuery" class="px-3 py-2 text-sm text-gray-400">No matching labels</p>
          <p v-if="!filteredLabels.length && !searchQuery" class="px-3 py-4 text-sm text-gray-400 text-center">No labels available</p>
        </div>

        <!-- Create New Label -->
        <div class="p-3 border-t">
          <div v-if="showCreateForm" class="space-y-2">
            <div class="flex items-center gap-2">
              <input
                v-model="newLabelName"
                type="text"
                placeholder="Label name"
                class="flex-1 px-2 py-1.5 text-sm border rounded outline-none focus:border-blue-500"
                @keydown.enter="createLabel"
              />
              <input v-model="newLabelColor" type="color" class="w-8 h-8 rounded cursor-pointer border-0" />
            </div>
            <div class="flex gap-2">
              <UButton size="xs" color="primary" :disabled="!newLabelName.trim()" @click="createLabel">Create</UButton>
              <UButton size="xs" variant="ghost" @click="showCreateForm = false">Cancel</UButton>
            </div>
          </div>
          <button
            v-else
            class="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            @click="showCreateForm = true"
          >
            <UIcon name="i-lucide-plus" class="w-4 h-4" />
            <span>Create new label</span>
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

interface Label {
  id: string
  name: string
  color: string
}

const props = defineProps<{
  column: CustomColumn
  value: TaskColumnValue | null
  taskId: string
  readonly?: boolean
}>()

const emit = defineEmits<{ update: [payload: any] }>()

const toast = useToast()
const showPicker = ref(false)
const searchQuery = ref('')
const pickerPosition = ref({ x: 0, y: 0 })
const showCreateForm = ref(false)
const newLabelName = ref('')
const newLabelColor = ref('#6B7280')

// Fetch all available labels
const { data: labelsData, refresh: refreshLabels } = useFetch<Label[]>('/api/agency/labels')
const allLabels = computed<Label[]>(() => labelsData.value || [])

const selectedIds = computed<string[]>(() => props.value?.jsonValue?.labelIds || [])

const assignedLabels = computed(() =>
  allLabels.value.filter((l) => selectedIds.value.includes(l.id))
)

const filteredLabels = computed(() => {
  if (!searchQuery.value) return allLabels.value
  const q = searchQuery.value.toLowerCase()
  return allLabels.value.filter((l) => l.name.toLowerCase().includes(q))
})

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

function isSelected(labelId: string): boolean {
  return selectedIds.value.includes(labelId)
}

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
  searchQuery.value = ''
  showCreateForm.value = false
}

function toggleLabel(labelId: string) {
  const current = [...selectedIds.value]
  const idx = current.indexOf(labelId)
  if (idx > -1) current.splice(idx, 1)
  else current.push(labelId)
  emit('update', { jsonValue: { labelIds: current } })
}

function removeLabel(labelId: string) {
  const current = selectedIds.value.filter((id) => id !== labelId)
  emit('update', { jsonValue: { labelIds: current } })
}

async function createLabel() {
  const name = newLabelName.value.trim()
  if (!name) return

  try {
    const result = await $fetch<Label>('/api/agency/labels', {
      method: 'POST',
      body: { name, color: newLabelColor.value },
    })
    await refreshLabels()
    // Auto-select the new label
    const current = [...selectedIds.value, result.id]
    emit('update', { jsonValue: { labelIds: current } })
    newLabelName.value = ''
    newLabelColor.value = '#6B7280'
    showCreateForm.value = false
  } catch (err: any) {
    toast.add({
      title: 'Failed to create label',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  }
}
</script>
