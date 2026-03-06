<template>
  <div v-if="isLoading" class="flex items-center py-3 pl-12 bg-gray-50/50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700">
    <UIcon name="i-lucide-loader-2" class="w-4 h-4 text-gray-400 animate-spin mr-2" />
    <span class="text-xs text-gray-500 dark:text-neutral-400">Loading subitems...</span>
  </div>

  <template v-else>
    <!-- Subtask rows -->
    <div
      v-for="subitem in subitems"
      :key="subitem.id"
      class="flex items-center border-b border-gray-100 dark:border-neutral-700/50 bg-gray-50/50 dark:bg-neutral-800/50 hover:bg-gray-100/70 dark:hover:bg-neutral-700/50 cursor-pointer border-l-2 border-l-blue-400/40 group/subrow"
      @click="props.openTask?.(subitem.id)"
    >
      <!-- Checkbox -->
      <div class="w-10 px-2 py-2.5 border-r border-gray-200 dark:border-neutral-700">
        <!-- placeholder for alignment -->
      </div>

      <!-- Title (indented) -->
      <div class="flex-1 min-w-[250px] px-4 py-2.5 border-r border-gray-200 dark:border-neutral-700">
        <div class="flex items-center gap-1.5 pl-6">
          <UIcon name="i-lucide-corner-down-right" class="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 flex-shrink-0" />
          <p class="text-sm text-gray-700 dark:text-neutral-300 truncate min-w-0 flex-1">{{ subitem.title }}</p>
          <!-- Subitem context menu -->
          <div class="ml-auto flex-shrink-0" @click.stop>
            <UDropdownMenu :items="subitemMenuItems(subitem)">
              <button class="opacity-0 group-hover/subrow:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded transition-opacity">
                <UIcon name="i-lucide-more-horizontal" class="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400" />
              </button>
            </UDropdownMenu>
          </div>
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

    <!-- Cross-board linked tasks -->
    <div
      v-for="linked in linkedTasks"
      :key="'linked-' + linked.id"
      class="flex items-center border-b border-gray-100 dark:border-neutral-700/50 bg-gray-50/30 dark:bg-neutral-800/30 hover:bg-gray-100/70 dark:hover:bg-neutral-700/50 cursor-pointer border-l-2 border-l-purple-400/40 group/subrow"
      @click="props.openTask?.(linked.task.id)"
    >
      <!-- Checkbox placeholder -->
      <div class="w-10 px-2 py-2.5 border-r border-gray-200 dark:border-neutral-700" />

      <!-- Title + board badge -->
      <div class="flex-1 min-w-[250px] px-4 py-2.5 border-r border-gray-200 dark:border-neutral-700">
        <div class="flex items-center gap-1.5 pl-6">
          <UIcon name="i-lucide-git-branch" class="w-3.5 h-3.5 text-purple-400 dark:text-purple-500 flex-shrink-0" />
          <p class="text-sm text-gray-700 dark:text-neutral-300 truncate min-w-0 flex-1">{{ linked.task.title }}</p>
          <UBadge size="xs" variant="subtle" color="primary" class="flex-shrink-0">{{ linked.task.boardName }}</UBadge>
          <!-- Status indicator -->
          <div
            v-if="linked.task.statusColor"
            class="w-2 h-2 rounded-full flex-shrink-0"
            :style="{ backgroundColor: linked.task.statusColor }"
          />
          <!-- Context menu for linked task -->
          <div class="ml-auto flex-shrink-0" @click.stop>
            <UDropdownMenu :items="linkedMenuItems(linked)">
              <button class="opacity-0 group-hover/subrow:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded transition-opacity">
                <UIcon name="i-lucide-more-horizontal" class="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400" />
              </button>
            </UDropdownMenu>
          </div>
        </div>
      </div>

      <!-- Blank column cells (different board's columns don't apply) -->
      <div
        v-for="col in columns"
        :key="col.id"
        class="px-2 py-1 border-r border-gray-200 dark:border-neutral-700"
        :style="{ width: (col.width || 150) + 'px' }"
      >
        <span class="text-xs text-gray-300 dark:text-neutral-600">—</span>
      </div>
    </div>

    <!-- Add subitem row -->
    <BoardSubitemAddRow
      :parent-task-id="parentTaskId"
      :board-id="boardId"
      @create-cross-board="emit('createCrossBoard', parentTaskId)"
    />
  </template>
</template>

<script setup lang="ts">
import type { BoardColumn, BoardItem } from '~/composables/useBoardData'
import type { CustomColumn, TaskColumnValue } from '~/types'
import BoardCell from '~/components/board/BoardCell.vue'
import BoardSubitemAddRow from '~/components/board/BoardSubitemAddRow.vue'

interface LinkedTaskInfo {
  id: string
  title: string
  boardSlug: string
  boardName: string
  status?: string
  statusColor?: string
}

interface LinkedItemEntry {
  id: string
  linkType: string
  task: LinkedTaskInfo
}

const props = defineProps<{
  parentTaskId: string
  boardId: string
  columns: BoardColumn[]
  normalizeColumn: (col: BoardColumn) => CustomColumn
  getCellValue: (item: BoardItem, col: BoardColumn) => TaskColumnValue | null
  handleCellUpdate: (taskId: string, columnId: string, payload: any) => void
  openTask?: (taskId: string) => void
}>()

const emit = defineEmits<{
  deleteSubitem: [taskId: string]
  linkSubitem: [taskId: string]
  createCrossBoard: [parentTaskId: string]
}>()

const toast = useToast()
const { getSubitems, isLoading: isLoadingFn } = useBoardSubitems()

const subitems = computed(() => getSubitems(props.parentTaskId))
const isLoading = computed(() => isLoadingFn(props.parentTaskId))

// --- Linked cross-board tasks ---
const linkedTasks = ref<LinkedItemEntry[]>([])
const linkedLoaded = ref(false)

async function fetchLinkedTasks() {
  if (linkedLoaded.value) return
  try {
    const data = await $fetch<{ linkedItems: LinkedItemEntry[] }>(
      `/api/agency/tasks/${props.parentTaskId}/linked-items`,
    )
    linkedTasks.value = data.linkedItems || []
    linkedLoaded.value = true
  } catch {
    // Silent — linked items are supplemental
  }
}

// Fetch linked items when component mounts (subtask area is expanded)
onMounted(fetchLinkedTasks)

// Re-fetch when parent task changes
watch(() => props.parentTaskId, () => {
  linkedTasks.value = []
  linkedLoaded.value = false
  fetchLinkedTasks()
})

// --- Context menus ---
function subitemMenuItems(subitem: BoardItem) {
  return [
    [
      { label: 'Open', icon: 'i-lucide-external-link' as const, onSelect: () => props.openTask?.(subitem.id) },
      { label: 'Link to task...', icon: 'i-lucide-link-2' as const, onSelect: () => emit('linkSubitem', subitem.id) },
    ],
    [
      { label: 'Duplicate', icon: 'i-lucide-copy' as const, onSelect: () => duplicateSubitem(subitem.id) },
    ],
    [
      { label: 'Delete', icon: 'i-lucide-trash-2' as const, color: 'error' as const, onSelect: () => emit('deleteSubitem', subitem.id) },
    ],
  ]
}

function linkedMenuItems(linked: LinkedItemEntry) {
  return [
    [
      {
        label: 'Open',
        icon: 'i-lucide-external-link' as const,
        onSelect: () => props.openTask?.(linked.task.id),
      },
      {
        label: `Go to ${linked.task.boardName}`,
        icon: 'i-lucide-arrow-up-right' as const,
        onSelect: () => navigateTo(`/agency/boards/${linked.task.boardSlug}?task=${linked.task.id}`),
      },
    ],
    [
      {
        label: 'Unlink',
        icon: 'i-lucide-unlink' as const,
        color: 'error' as const,
        onSelect: () => unlinkTask(linked.id),
      },
    ],
  ]
}

async function duplicateSubitem(taskId: string) {
  try {
    await $fetch(`/api/agency/tasks/${taskId}/duplicate`, { method: 'POST' })
    const helper = useBoardSubitems()
    helper.toggleExpand(props.parentTaskId, props.boardId)
    await nextTick()
    helper.toggleExpand(props.parentTaskId, props.boardId)
    toast.add({ title: 'Subtask duplicated', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to duplicate', description: err.data?.statusMessage, color: 'error' })
  }
}

async function unlinkTask(linkId: string) {
  try {
    await $fetch(`/api/agency/tasks/${props.parentTaskId}/linked-items/${linkId}`, {
      method: 'DELETE',
    })
    linkedTasks.value = linkedTasks.value.filter(l => l.id !== linkId)
    toast.add({ title: 'Task unlinked', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to unlink', color: 'error' })
  }
}

// Expose refresh for parent to call after creating cross-board tasks
function refreshLinked() {
  linkedLoaded.value = false
  fetchLinkedTasks()
}

defineExpose({ refreshLinked })
</script>
