<template>
  <div v-if="isLoading" class="flex items-center py-3 pl-12 bg-gray-50/50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700">
    <UIcon name="i-lucide-loader-2" class="w-4 h-4 text-gray-400 animate-spin mr-2" />
    <span class="text-xs text-gray-500 dark:text-neutral-400">Loading subitems...</span>
  </div>

  <template v-else>
    <div
      v-for="subitem in subitems"
      :key="subitem.id"
      class="flex items-center border-b border-gray-100 dark:border-neutral-700/50 bg-gray-50/50 dark:bg-neutral-800/50 hover:bg-gray-100/70 dark:hover:bg-neutral-700/50 cursor-pointer border-l-2 border-l-blue-400/40"
    >
      <!-- Checkbox -->
      <div class="w-10 px-2 py-2.5 border-r border-gray-200 dark:border-neutral-700">
        <!-- placeholder for alignment -->
      </div>

      <!-- Title (indented) -->
      <div class="flex-1 min-w-[250px] px-4 py-2.5 border-r border-gray-200 dark:border-neutral-700">
        <div class="flex items-center gap-1.5 pl-6">
          <UIcon name="i-lucide-corner-down-right" class="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 flex-shrink-0" />
          <p class="text-sm text-gray-700 dark:text-neutral-300 truncate">{{ subitem.title }}</p>
        </div>
      </div>

      <!-- Column cells -->
      <div
        v-for="col in columns"
        :key="col.id"
        class="px-2 py-1 border-r border-gray-200 dark:border-neutral-700"
        :style="{ width: (col.width || 150) + 'px' }"
        @click.stop
      >
        <BoardCell
          :column="normalizeColumn(col)"
          :value="getCellValue(subitem, col)"
          :task-id="subitem.id"
          @update="(columnId: string, payload: any) => handleCellUpdate(subitem.id, columnId, payload)"
        />
      </div>
    </div>

    <!-- Add subitem row -->
    <BoardSubitemAddRow
      :parent-task-id="parentTaskId"
      :board-id="boardId"
    />
  </template>
</template>

<script setup lang="ts">
import type { BoardColumn, BoardItem } from '~/composables/useBoardData'
import type { CustomColumn, TaskColumnValue } from '~/types'
import BoardCell from '~/components/board/BoardCell.vue'
import BoardSubitemAddRow from '~/components/board/BoardSubitemAddRow.vue'

const props = defineProps<{
  parentTaskId: string
  boardId: string
  columns: BoardColumn[]
  normalizeColumn: (col: BoardColumn) => CustomColumn
  getCellValue: (item: BoardItem, col: BoardColumn) => TaskColumnValue | null
  handleCellUpdate: (taskId: string, columnId: string, payload: any) => void
}>()

const { getSubitems, isLoading: isLoadingFn } = useBoardSubitems()

const subitems = computed(() => getSubitems(props.parentTaskId))
const isLoading = computed(() => isLoadingFn(props.parentTaskId))
</script>
