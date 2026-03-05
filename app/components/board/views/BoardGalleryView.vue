<template>
  <div class="flex-1 overflow-auto p-4">
    <div v-for="group in groups" :key="group.id" class="mb-6">
      <!-- Group header -->
      <div class="flex items-center gap-2 mb-3">
        <span class="w-2.5 h-2.5 rounded-sm" :style="{ backgroundColor: group.color }" />
        <h3 class="text-sm font-semibold">{{ group.name }}</h3>
        <span class="text-xs text-gray-400">({{ group.totalCount ?? group.items.length }})</span>
      </div>

      <!-- Cards grid -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <div
          v-for="item in group.items"
          :key="item.id"
          class="bg-white rounded-lg border hover:shadow-md transition-shadow cursor-pointer"
          :class="{ 'ring-2 ring-blue-500': selection.isSelected(item.id) }"
          @click="$emit('openTask', item.id)"
        >
          <!-- Color bar top -->
          <div class="h-1.5 rounded-t-lg" :style="{ backgroundColor: item.statusColor || group.color }" />

          <div class="p-3">
            <!-- Title -->
            <p class="text-sm font-medium mb-3 line-clamp-2">{{ item.title }}</p>

            <!-- Column values -->
            <div class="space-y-2">
              <template v-for="col in cardColumns" :key="col.id">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-400 w-16 truncate">{{ col.name }}</span>
                  <div class="flex-1 text-xs" @click.stop>
                    <BoardCell
                      :column="normalizeColumn(col)"
                      :value="getCellValue(item, col)"
                      :task-id="item.id"
                      @update="(columnId, payload) => $emit('cellUpdate', item.id, columnId, payload)"
                    />
                  </div>
                </div>
              </template>
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-between mt-3 pt-2 border-t">
              <div class="flex -space-x-1">
                <template v-if="item.assignees?.length">
                  <UAvatar
                    v-for="a in item.assignees.slice(0, 3)"
                    :key="a.id"
                    size="xs"
                    :alt="a.name"
                    class="ring-2 ring-white"
                  />
                  <span
                    v-if="item.assignees.length > 3"
                    class="w-5 h-5 rounded-full bg-gray-200 text-xs flex items-center justify-center ring-2 ring-white"
                  >
                    +{{ item.assignees.length - 3 }}
                  </span>
                </template>
              </div>
              <span v-if="item.dueDate" class="text-xs text-gray-400">
                {{ formatDate(item.dueDate) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty group -->
      <div v-if="group.items.length === 0" class="text-center py-6 text-xs text-gray-400 bg-white rounded-lg border border-dashed">
        No items in this group
      </div>
    </div>

    <!-- Empty -->
    <div v-if="groups.length === 0" class="flex items-center justify-center p-12">
      <div class="text-center">
        <UIcon name="i-lucide-layout-grid" class="w-12 h-12 text-gray-300 mx-auto mb-3" />
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
  }
}>()

defineEmits<{
  openTask: [taskId: string]
  cellUpdate: [taskId: string, columnId: string, payload: any]
}>()

// Show first few columns on cards
const cardColumns = computed(() =>
  props.columns
    .filter(c => {
      const t = c.columnType || c.type
      return t === 'status' || t === 'date' || t === 'people' || t === 'progress' || t === 'rating' || t === 'dropdown'
    })
    .slice(0, 4)
)

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
</script>
