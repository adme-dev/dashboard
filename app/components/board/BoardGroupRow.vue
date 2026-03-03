<template>
  <div class="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors group/header">
    <!-- Expand/Collapse -->
    <button
      class="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
      @click="$emit('toggle')"
    >
      <UIcon
        :name="isCollapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
        class="w-4 h-4 text-gray-500 dark:text-neutral-400"
      />
    </button>

    <!-- Color Swatch -->
    <button
      class="w-3 h-3 rounded-sm flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1"
      :style="{ backgroundColor: color, ringColor: color }"
      @click="showColorPicker = !showColorPicker"
    />

    <!-- Group Name (editable) -->
    <div v-if="isRenaming" class="flex items-center gap-1" @click.stop>
      <input
        ref="renameInput"
        v-model="editName"
        type="text"
        class="text-sm font-medium bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded px-2 py-0.5 outline-none focus:border-blue-500 w-48"
        @keydown.enter="saveRename"
        @keydown.escape="cancelRename"
        @blur="saveRename"
      />
    </div>
    <span v-else class="font-medium text-sm" :style="{ color }">{{ name }}</span>

    <!-- Task Count -->
    <UBadge color="neutral" variant="subtle" class="ml-1">{{ taskCount }}</UBadge>

    <!-- Actions (visible on hover) -->
    <div class="flex items-center gap-0.5 ml-auto opacity-0 group-hover/header:opacity-100 transition-opacity">
      <UDropdownMenu :items="menuItems">
        <button class="p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded transition-colors">
          <UIcon name="i-lucide-more-horizontal" class="w-4 h-4 text-gray-500 dark:text-neutral-400" />
        </button>
      </UDropdownMenu>
    </div>

    <!-- Color Picker Popover -->
    <div
      v-if="showColorPicker"
      class="absolute z-20 mt-1 top-full left-12 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-lg shadow-lg p-3"
      @click.stop
    >
      <div class="grid grid-cols-7 gap-1.5">
        <button
          v-for="c in groupColors"
          :key="c"
          class="w-6 h-6 rounded-full hover:scale-110 transition-transform"
          :class="c === color ? 'ring-2 ring-offset-1' : ''"
          :style="{ backgroundColor: c, ringColor: c }"
          @click="$emit('updateColor', c); showColorPicker = false"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  groupId: string
  name: string
  color: string
  taskCount: number
  isCollapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
  rename: [name: string]
  updateColor: [color: string]
  delete: []
  addGroup: [position: 'above' | 'below']
}>()

const showColorPicker = ref(false)
const isRenaming = ref(false)
const editName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

const groupColors = [
  '#579BFC', '#00C875', '#FDAB3D', '#E2445C', '#A25DDC',
  '#FF5AC4', '#FF642E', '#CAB641', '#9CD326', '#00D2D2',
  '#784BD1', '#66CCFF', '#BB3354', '#FF158A', '#037F4C',
  '#225091', '#4ECCC6', '#C4C4C4', '#808080', '#333333',
  '#7F5347',
]

function startRename() {
  editName.value = props.name
  isRenaming.value = true
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function saveRename() {
  const trimmed = editName.value.trim()
  if (trimmed && trimmed !== props.name) {
    emit('rename', trimmed)
  }
  isRenaming.value = false
}

function cancelRename() {
  isRenaming.value = false
}

const isDynamic = computed(() => props.groupId.startsWith('grouped_'))

const menuItems = computed(() => {
  const items: any[] = []

  if (!isDynamic.value) {
    items.push(
      { label: 'Rename Group', icon: 'i-lucide-pencil', onSelect: () => startRename() },
      { label: 'Add Group Above', icon: 'i-lucide-arrow-up', onSelect: () => emit('addGroup', 'above') },
      { label: 'Add Group Below', icon: 'i-lucide-arrow-down', onSelect: () => emit('addGroup', 'below') },
      { type: 'separator' as const },
    )
  }

  items.push({
    label: props.isCollapsed ? 'Expand Group' : 'Collapse Group',
    icon: props.isCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up',
    onSelect: () => emit('toggle'),
  })

  if (!isDynamic.value) {
    items.push(
      { type: 'separator' as const },
      { label: 'Delete Group', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete') },
    )
  }

  return items
})
</script>
