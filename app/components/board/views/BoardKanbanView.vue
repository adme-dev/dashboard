<template>
  <div class="flex-1 flex gap-4 p-4 overflow-x-auto overflow-y-hidden">
    <!-- Pick which status/dropdown column to group by -->
    <div v-if="!kanbanColumn && statusColumns.length > 1" class="flex-1 flex items-center justify-center">
      <div class="text-center p-8 border rounded-lg bg-white dark:bg-neutral-900 dark:border-neutral-700">
        <UIcon name="i-lucide-kanban" class="w-12 h-12 text-gray-300 dark:text-neutral-600 mx-auto mb-3" />
        <h3 class="font-medium">Choose a column for Kanban lanes</h3>
        <div class="flex flex-wrap gap-2 justify-center">
          <UButton
            v-for="col in statusColumns"
            :key="col.id"
            variant="outline"
            size="sm"
            @click="selectedColumnId = col.id"
          >
            {{ col.name }}
          </UButton>
        </div>
      </div>
    </div>

    <!-- Kanban lanes -->
    <template v-else>
      <div
        v-for="lane in lanes"
        :key="lane.id"
        class="flex-shrink-0 w-72 flex flex-col bg-gray-50 dark:bg-neutral-900 rounded-lg border dark:border-neutral-700"
      >
        <!-- Lane header -->
        <div class="p-3 border-b dark:border-neutral-700 flex items-center gap-2">
          <div
            class="w-3 h-3 rounded-full"
            :style="{ backgroundColor: lane.color }"
          />
          <span class="text-sm font-semibold flex-1 truncate">{{ lane.label }}</span>
          <span class="text-xs text-gray-500 dark:text-neutral-400 bg-gray-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded-full">{{ lane.items.length }}</span>
        </div>

        <!-- Lane items -->
        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          <div
            v-for="item in lane.items"
            :key="item.id"
            class="bg-white dark:bg-neutral-800 rounded-lg border dark:border-neutral-700 p-3 cursor-pointer hover:shadow-sm transition-shadow"
            :class="{ 'ring-2 ring-blue-500': selection.isSelected(item.id) }"
            @click="$emit('openTask', item.id)"
          >
            <p class="text-sm font-medium mb-2">{{ item.title }}</p>
            <!-- Show a few key column values -->
            <div class="flex flex-wrap gap-1">
              <template v-for="col in previewColumns" :key="col.id">
                <div class="text-xs">
                  <BoardCell
                    :column="normalizeColumn(col)"
                    :value="getCellValue(item, col)"
                    :task-id="item.id"
                    :readonly="true"
                    @update="(columnId, payload) => $emit('cellUpdate', item.id, columnId, payload)"
                  />
                </div>
              </template>
            </div>
          </div>

          <!-- Empty lane -->
          <div v-if="lane.items.length === 0" class="text-center py-6 text-xs text-gray-400 dark:text-neutral-500">
            No items
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="lanes.length === 0" class="flex-1 flex items-center justify-center">
        <div class="text-center p-8">
          <UIcon name="i-lucide-kanban" class="w-12 h-12 text-gray-300 dark:text-neutral-600 mx-auto mb-3" />
          <p class="text-gray-500 dark:text-neutral-400">No status column found for Kanban view</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CustomColumn, TaskColumnValue } from '~/types'
import type { BoardColumn, BoardItem, BoardGroup } from '~/composables/useBoardData'
import BoardCell from '~/components/board/BoardCell.vue'

const props = defineProps<{
  groups: BoardGroup[]
  columns: BoardColumn[]
  normalizeColumn: (col: BoardColumn) => CustomColumn
  getCellValue: (item: BoardItem, col: BoardColumn) => TaskColumnValue | null
  selection: {
    isSelected: (id: string) => boolean
  }
}>()

defineEmits<{
  openTask: [taskId: string]
  cellUpdate: [taskId: string, columnId: string, payload: any]
}>()

const selectedColumnId = ref<string | null>(null)

// Find status/dropdown columns suitable for kanban lanes
const statusColumns = computed(() =>
  props.columns.filter(c => {
    const type = c.columnType || c.type
    return type === 'status' || type === 'dropdown'
  })
)

// Auto-select first status column if only one available
const kanbanColumn = computed(() => {
  if (selectedColumnId.value) {
    return props.columns.find(c => c.id === selectedColumnId.value)
  }
  if (statusColumns.value.length === 1) {
    return statusColumns.value[0]
  }
  // Auto-select first status column
  const statusCol = statusColumns.value.find(c => (c.columnType || c.type) === 'status')
  return statusCol || statusColumns.value[0] || null
})

// Preview columns: show a few non-kanban columns on cards
const previewColumns = computed(() =>
  props.columns
    .filter(c => c.id !== kanbanColumn.value?.id)
    .filter(c => {
      const type = c.columnType || c.type
      return type === 'people' || type === 'date' || type === 'priority' || type === 'progress'
    })
    .slice(0, 3)
)

// All items flat
const allItems = computed<BoardItem[]>(() => {
  const items: BoardItem[] = []
  for (const g of props.groups) {
    items.push(...g.items)
  }
  return items
})

// Build lanes from column options
const lanes = computed(() => {
  const col = kanbanColumn.value
  if (!col) return []

  const options: any[] = col.settings?.options || []

  // If no options, group by distinct values
  if (options.length === 0) {
    // Fallback: group by text value
    const grouped = new Map<string, BoardItem[]>()
    for (const item of allItems.value) {
      const cv = props.getCellValue(item, col)
      const key = cv?.textValue || cv?.jsonValue?.optionId || cv?.jsonValue?.selectedIds?.[0] || 'Unset'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(item)
    }
    return Array.from(grouped.entries()).map(([label, items]) => ({
      id: label,
      label,
      color: '#C4C4C4',
      items,
    }))
  }

  // Build lanes from options (use value || id since platform statuses use "value", custom options use "id")
  const result = options.map(opt => ({
    id: opt.value || opt.id,
    label: opt.label || opt.name,
    color: opt.color || '#C4C4C4',
    items: [] as BoardItem[],
  }))

  // Add "Unset" lane
  const unsetLane = { id: '__unset__', label: 'Unset', color: '#C4C4C4', items: [] as BoardItem[] }

  for (const item of allItems.value) {
    const cv = props.getCellValue(item, col)
    const selectedId = cv?.jsonValue?.optionId || cv?.jsonValue?.selectedIds?.[0] || cv?.jsonValue?.selected_id
    // Match by ID first, then by text value matching label (for platform status sync)
    const lane = result.find(l => l.id === selectedId) ||
      (cv?.textValue ? result.find(l => l.label === cv.textValue) : null)
    if (lane) {
      lane.items.push(item)
    } else {
      unsetLane.items.push(item)
    }
  }

  // Only show unset lane if it has items
  if (unsetLane.items.length > 0) {
    result.push(unsetLane)
  }

  return result
})
</script>
