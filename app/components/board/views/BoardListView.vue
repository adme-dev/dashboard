<template>
  <div class="flex-1 overflow-auto">
    <div v-for="group in groups" :key="group.id" class="mb-2">
      <!-- Group header -->
      <div
        class="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b cursor-pointer select-none"
        @click="toggleGroup(group.id)"
      >
        <UIcon
          :name="expanded.has(group.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="w-4 h-4 text-gray-500"
        />
        <span class="w-2.5 h-2.5 rounded-sm" :style="{ backgroundColor: group.color }" />
        <span class="text-sm font-semibold">{{ group.name }}</span>
        <span class="text-xs text-gray-400">({{ group.totalCount ?? group.items.length }})</span>
      </div>

      <!-- Items -->
      <div v-if="expanded.has(group.id)">
        <div
          v-for="item in group.items"
          :key="item.id"
          class="flex items-center px-4 py-2.5 border-b hover:bg-gray-50 cursor-pointer"
          :class="{ 'bg-blue-50/50': selection.isSelected(item.id) }"
          @click="$emit('openTask', item.id)"
        >
          <!-- Checkbox -->
          <div class="mr-3" @click.stop>
            <UCheckbox
              :model-value="selection.isSelected(item.id)"
              @update:model-value="selection.toggle(item.id)"
            />
          </div>

          <!-- Color indicator -->
          <span class="w-1 h-6 rounded-full mr-3" :style="{ backgroundColor: item.statusColor || group.color }" />

          <!-- Title -->
          <div class="flex-1 min-w-0 mr-4">
            <p class="text-sm font-medium truncate">{{ item.title }}</p>
          </div>

          <!-- Inline column values -->
          <div class="flex items-center gap-4">
            <template v-for="col in inlineColumns" :key="col.id">
              <div class="text-xs text-gray-600 w-28 truncate" @click.stop>
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

        <!-- Empty group -->
        <div v-if="group.items.length === 0 && !(group.totalCount > 0)" class="px-4 py-6 text-center text-xs text-gray-400">
          No items in this group
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-if="groups.length === 0" class="flex items-center justify-center p-12">
      <div class="text-center">
        <UIcon name="i-lucide-list" class="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">No items to display</p>
      </div>
    </div>
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
    toggle: (id: string) => void
  }
}>()

defineEmits<{
  openTask: [taskId: string]
  cellUpdate: [taskId: string, columnId: string, payload: any]
}>()

// Show first few important columns inline
const inlineColumns = computed(() =>
  props.columns
    .filter(c => {
      const t = c.columnType || c.type
      return t === 'status' || t === 'people' || t === 'date' || t === 'priority'
    })
    .slice(0, 4)
)

// Group expand state - all expanded by default
const expanded = ref<Set<string>>(new Set())

watch(() => props.groups, (groups) => {
  for (const g of groups) {
    if (!expanded.value.has(g.id)) expanded.value.add(g.id)
  }
}, { immediate: true })

function toggleGroup(id: string) {
  if (expanded.value.has(id)) {
    expanded.value.delete(id)
  } else {
    expanded.value.add(id)
  }
}
</script>
