<template>
  <div class="h-full flex flex-col bg-gray-50 dark:bg-neutral-950">
    <!-- Header -->
    <BoardHeader
      :board-name="board?.name || 'Board'"
      :board-id="props.boardId"
      :total-items="totalItems"
      :last-updated="board?.lastUpdated"
      v-model:active-view="activeView"
      v-model:search-query="searchQuery"
      @new-item="$emit('newItem')"
    />

    <!-- Toolbar -->
    <BoardToolbar
      v-if="activeView !== 'files'"
      v-model:filters="filters"
      v-model:sort-rules="sortRules"
      v-model:group-by-column-id="groupByColumnId"
      :columns="columns"
      :all-columns="allColumns"
      :board-id="props.boardId"
      @toggle-column-visibility="toggleColumnVisibility"
      @export="$emit('export')"
      @template="$emit('template')"
      @automations="$emit('automations')"
      @chat-feed="$emit('chatFeed')"
      @add-group="$emit('addGroup')"
      @add-column="$emit('addColumn')"
    />

    <!-- Loading -->
    <div v-if="pending" class="flex-1 flex items-center justify-center">
      <XfLoader />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h3 class="font-medium">Failed to load board</h3>
        <UButton color="primary" class="mt-4" @click="refresh()">Try Again</UButton>
      </div>
    </div>

    <!-- View Content -->
    <template v-else>
      <!-- Table View (default) -->
      <slot
        v-if="activeView === 'table'"
        name="table"
        :groups="filteredGroups"
        :columns="columns"
        :normalize-column="normalizeColumn"
        :get-cell-value="getCellValue"
        :handle-cell-update="handleCellUpdate"
        :selection="selection"
      />

      <!-- Kanban View -->
      <BoardKanbanView
        v-else-if="activeView === 'kanban'"
        :groups="filteredGroups"
        :columns="columns"
        :normalize-column="normalizeColumn"
        :get-cell-value="getCellValue"
        :selection="selection"
        @open-task="$emit('openTask', $event)"
        @cell-update="(taskId, colId, payload) => handleCellUpdate(taskId, colId, payload)"
      />

      <!-- Timeline View -->
      <BoardTimelineView
        v-else-if="activeView === 'timeline'"
        :groups="filteredGroups"
        :columns="columns"
        :get-cell-value="getCellValue"
        :handle-cell-update="handleCellUpdate"
        @open-task="$emit('openTask', $event)"
      />

      <!-- Calendar View -->
      <BoardCalendarView
        v-else-if="activeView === 'calendar'"
        :groups="filteredGroups"
        :columns="columns"
        :get-cell-value="getCellValue"
        :normalize-column="normalizeColumn"
        @open-task="$emit('openTask', $event)"
        @cell-update="(taskId, colId, payload) => handleCellUpdate(taskId, colId, payload)"
        @add-item="$emit('addItem', $event)"
      />

      <!-- List View -->
      <BoardListView
        v-else-if="activeView === 'list'"
        :groups="filteredGroups"
        :columns="columns"
        :normalize-column="normalizeColumn"
        :get-cell-value="getCellValue"
        :selection="selection"
        @open-task="$emit('openTask', $event)"
        @cell-update="(taskId, colId, payload) => handleCellUpdate(taskId, colId, payload)"
      />

      <!-- Gallery View -->
      <BoardGalleryView
        v-else-if="activeView === 'gallery'"
        :groups="filteredGroups"
        :columns="columns"
        :normalize-column="normalizeColumn"
        :get-cell-value="getCellValue"
        :selection="selection"
        @open-task="$emit('openTask', $event)"
        @cell-update="(taskId, colId, payload) => handleCellUpdate(taskId, colId, payload)"
      />

      <!-- Board Files View -->
      <BoardFilesView
        v-else-if="activeView === 'files'"
        :board-id="props.boardId"
        @open-task="$emit('openTask', $event)"
      />
    </template>

    <!-- Bulk Actions -->
    <slot name="bulkActions" :selection="selection" />
  </div>
</template>

<script setup lang="ts">
import type { BoardViewType } from '~/composables/useBoardData'
import BoardHeader from '~/components/board/BoardHeader.vue'
import BoardToolbar from '~/components/board/BoardToolbar.vue'
import BoardKanbanView from '~/components/board/views/BoardKanbanView.vue'
import BoardTimelineView from '~/components/board/views/BoardTimelineView.vue'
import BoardCalendarView from '~/components/board/views/BoardCalendarView.vue'
import BoardListView from '~/components/board/views/BoardListView.vue'
import BoardGalleryView from '~/components/board/views/BoardGalleryView.vue'
import BoardFilesView from '~/components/board/views/BoardFilesView.vue'

const props = defineProps<{
  boardId: string
}>()

defineEmits<{
  openTask: [taskId: string]
  export: []
  template: []
  automations: []
  chatFeed: []
  addGroup: []
  addColumn: []
  addItem: [payload: { groupId: string; title: string; date: string }]
  newItem: []
}>()

const showAddItem = ref(false)

// Central board data
const boardIdRef = computed(() => props.boardId)
const {
  board,
  groups,
  filteredGroups,
  columns,
  allColumns,
  totalItems,
  pending,
  error,
  refresh,
  refreshColumns,
  toggleColumnVisibility,
  resizeColumn,
  activeView,
  searchQuery,
  filters,
  sortRules,
  groupByColumnId,
  toggleGroupExpanded,
  updateGroupItemsCache,
  statuses,
  normalizeColumn,
  getCellValue,
  handleCellUpdate,
} = useBoardData(boardIdRef)

// Selection
const selection = useBoardSelection()

// Real-time updates
const { connected: realtimeConnected } = useBoardRealtime(boardIdRef, {
  onRefresh: () => {
    refresh()
    refreshColumns()
  },
})

// Expose for parent
defineExpose({
  board,
  groups,
  filteredGroups,
  columns,
  allColumns,
  totalItems,
  pending,
  error,
  refresh,
  refreshColumns,
  toggleColumnVisibility,
  resizeColumn,
  activeView,
  searchQuery,
  filters,
  sortRules,
  groupByColumnId,
  toggleGroupExpanded,
  updateGroupItemsCache,
  statuses,
  normalizeColumn,
  getCellValue,
  handleCellUpdate,
  selection,
  showAddItem,
})
</script>
