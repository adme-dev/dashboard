<template>
  <BoardContainer
    ref="containerRef"
    :board-id="boardId"
    @open-task="openTask"
    @export="showExport = true"
    @template="showTemplates = true"
    @automations="showAutomations = true"
    @add-group="showAddGroup = true"
    @add-column="showAddColumn = true"
    @add-item="handleAddItem"
  >
    <!-- Table View (default) -->
    <template #table="{ groups, columns, normalizeColumn, getCellValue, handleCellUpdate, selection }">
      <div class="flex-1 overflow-auto p-4">
        <div class="min-w-max">
          <!-- Groups -->
          <div v-for="group in groups" :key="group.id" class="mb-4 bg-white rounded-lg border relative">
            <!-- Group Header -->
            <BoardGroupRow
              :group-id="group.id"
              :name="group.name"
              :color="group.color"
              :task-count="group.items.length"
              :is-collapsed="!group.isExpanded"
              @toggle="toggleGroup(group)"
              @rename="(name) => renameGroup(group.id, name)"
              @update-color="(color) => updateGroupColor(group.id, color)"
              @delete="deleteGroup(group.id)"
              @add-group="(pos) => addGroupNear(group.id, pos)"
            />

            <!-- Items Table -->
            <div v-if="group.isExpanded" class="border-t">
              <!-- Headers -->
              <div class="flex items-center bg-gray-50 text-xs font-medium text-gray-500 uppercase border-b">
                <div class="w-10 px-2 py-2 border-r">
                  <UCheckbox
                    :model-value="selection.isGroupSelected(group.items)"
                    @update:model-value="selection.selectGroup(group.items, !!$event)"
                  />
                </div>
                <div class="flex-1 min-w-[250px] px-4 py-2 border-r">Item</div>
                <div v-for="col in columns" :key="col.id" class="px-4 py-2 border-r flex items-center justify-between group" :style="{ width: (col.width || 150) + 'px' }">
                  <span>{{ col.name }}</span>
                  <UDropdownMenu :items="columnMenuItems(col)">
                    <button class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity">
                      <UIcon name="i-lucide-more-vertical" class="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </UDropdownMenu>
                </div>
              </div>

              <!-- Item Rows -->
              <div
                v-for="item in group.items"
                :key="item.id"
                class="flex items-center border-b hover:bg-gray-50 cursor-pointer"
                :class="{ 'bg-blue-50': selectedTaskId === item.id, 'bg-blue-50/50': selection.isSelected(item.id) }"
                @click="openTask(item.id)"
              >
                <div class="w-10 px-2 py-3 border-r" @click.stop>
                  <UCheckbox
                    :model-value="selection.isSelected(item.id)"
                    @update:model-value="selection.toggle(item.id)"
                  />
                </div>
                <div class="flex-1 min-w-[250px] px-4 py-3 border-r">
                  <p class="text-sm font-medium">{{ item.title }}</p>
                </div>
                <div v-for="col in columns" :key="col.id" class="px-2 py-1 border-r" :style="{ width: (col.width || 150) + 'px' }" @click.stop>
                  <BoardCell
                    :column="normalizeColumn(col)"
                    :value="getCellValue(item, col)"
                    :task-id="item.id"
                    @update="(columnId, payload) => handleCellUpdate(item.id, columnId, payload)"
                    @edit-column="(columnId) => openColumnConfig(columns.find(c => c.id === columnId) || columns[0])"
                  />
                </div>
              </div>

              <!-- Add Item Row -->
              <BoardAddItemRow
                :group-id="group.id"
                :columns="columns"
                @add="handleAddItem"
              />

              <!-- Group Summary -->
              <BoardGroupSummary
                v-if="group.items.length > 0"
                :columns="columns"
                :items="group.items"
              />
            </div>
          </div>

          <!-- Empty -->
          <div v-if="!groups?.length" class="text-center py-12 bg-white rounded-lg border">
            <UIcon name="i-lucide-columns-3" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <h3 class="font-medium">No items yet</h3>
            <p class="text-sm text-gray-500 mt-1">Create a group and start adding items</p>
            <UButton color="primary" class="mt-4" icon="i-lucide-folder-plus" @click="showAddGroup = true">
              Add Group
            </UButton>
          </div>
        </div>
      </div>
    </template>

    <!-- Bulk Actions -->
    <template #bulkActions="{ selection }">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-full opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-full opacity-0"
      >
        <div v-if="selection.hasSelection.value" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <!-- Tooltip -->
          <Transition
            enter-active-class="transition duration-200"
            enter-from-class="opacity-0 translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-2"
          >
            <div v-if="selection.showBulkActionsTip.value" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80">
              <div class="bg-blue-600 text-white rounded-lg p-4 shadow-lg relative">
                <button class="absolute top-2 right-2 text-white/70 hover:text-white" @click="selection.dismissTip()">
                  <UIcon name="i-lucide-x" class="w-4 h-4" />
                </button>
                <h4 class="font-semibold mb-1">Update multiple items at once!</h4>
                <p class="text-sm text-blue-100 mb-2">
                  Select multiple items to update column value, edit or move them in one single click.
                </p>
                <p class="text-sm text-blue-100 mb-3">Guaranteed time-saver ;)</p>
                <UButton size="xs" color="neutral" variant="solid" class="bg-white text-blue-600 hover:bg-blue-50" @click="selection.dismissTip()">
                  Got it
                </UButton>
                <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                  <div class="w-3 h-3 bg-blue-600 rotate-45" />
                </div>
              </div>
            </div>
          </Transition>

          <!-- Toolbar -->
          <div class="bg-white rounded-lg shadow-xl border flex items-center px-2 py-2">
            <div class="flex items-center gap-2 px-4 border-r mr-2">
              <div class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold">
                {{ selection.selectedCount.value }}
              </div>
              <span class="text-sm font-medium text-gray-700">Item{{ selection.selectedCount.value > 1 ? 's' : '' }} selected</span>
            </div>
            <div class="flex items-center gap-1">
              <UButton variant="ghost" size="sm" icon="i-lucide-copy" class="flex-col gap-0.5 h-auto py-1.5">
                <span class="text-xs">Duplicate</span>
              </UButton>
              <UButton variant="ghost" size="sm" icon="i-lucide-upload" class="flex-col gap-0.5 h-auto py-1.5">
                <span class="text-xs">Export</span>
              </UButton>
              <UButton variant="ghost" size="sm" icon="i-lucide-archive" class="flex-col gap-0.5 h-auto py-1.5">
                <span class="text-xs">Archive</span>
              </UButton>
              <UButton variant="ghost" size="sm" icon="i-lucide-trash-2" class="flex-col gap-0.5 h-auto py-1.5">
                <span class="text-xs">Delete</span>
              </UButton>
              <UButton variant="ghost" size="sm" icon="i-lucide-arrow-right-left" class="flex-col gap-0.5 h-auto py-1.5">
                <span class="text-xs">Convert</span>
              </UButton>
              <UButton variant="ghost" size="sm" icon="i-lucide-arrow-right" class="flex-col gap-0.5 h-auto py-1.5">
                <span class="text-xs">Move to</span>
              </UButton>
              <UButton variant="ghost" size="sm" icon="i-lucide-sparkles" class="flex-col gap-0.5 h-auto py-1.5">
                <span class="text-xs">Sidekick</span>
              </UButton>
              <UButton variant="ghost" size="sm" icon="i-lucide-puzzle" class="flex-col gap-0.5 h-auto py-1.5">
                <span class="text-xs">Apps</span>
              </UButton>
            </div>
            <div class="border-l pl-2 ml-2">
              <UButton variant="ghost" size="sm" icon="i-lucide-x" color="neutral" @click="selection.clear()" />
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </BoardContainer>

  <!-- Delete Column Confirmation -->
  <UModal v-model:open="showDeleteModal" title="Delete Column">
    <template #body>
      <p class="text-gray-600">
        Are you sure you want to delete this column? This will also delete all data in this column and cannot be undone.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="showDeleteConfirm = null">Cancel</UButton>
        <UButton color="error" @click="confirmDeleteColumn">Delete Column</UButton>
      </div>
    </template>
  </UModal>

  <!-- Add Column Modal -->
  <UModal v-model:open="showAddColumn" title="Add Column">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Column Name">
          <UInput v-model="newColumn.name" placeholder="e.g., Budget" class="w-full" />
        </UFormField>
        <UFormField label="Column Type">
          <BoardColumnTypeSelector v-model="newColumn.type" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="showAddColumn = false">Cancel</UButton>
        <UButton color="primary" :disabled="!newColumn.name || !newColumn.type" @click="addColumn">Add Column</UButton>
      </div>
    </template>
  </UModal>

  <!-- Add Group Modal -->
  <UModal v-model:open="showAddGroup" title="New Group">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Group Name">
          <UInput v-model="newGroupName" placeholder="e.g., Sprint 1" class="w-full" />
        </UFormField>
        <UFormField label="Color">
          <div class="grid grid-cols-7 gap-2">
            <button
              v-for="c in groupColorOptions"
              :key="c"
              class="w-8 h-8 rounded-full hover:scale-110 transition-transform"
              :class="newGroupColor === c ? 'ring-2 ring-offset-2' : ''"
              :style="{ backgroundColor: c, ringColor: c }"
              @click="newGroupColor = c"
            />
          </div>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="showAddGroup = false">Cancel</UButton>
        <UButton color="primary" :disabled="!newGroupName.trim()" @click="handleAddGroup">Add Group</UButton>
      </div>
    </template>
  </UModal>

  <!-- Column Config Modal -->
  <BoardColumnConfig
    :column="editingColumn"
    :open="showColumnConfig"
    @update:open="showColumnConfig = $event"
    @save="handleColumnSave"
    @delete="handleColumnDelete"
    @add-option="handleAddOption"
    @update-option="handleUpdateOption"
  />

  <!-- Delete Group Confirmation -->
  <UModal v-model:open="showDeleteGroupModal" title="Delete Group">
    <template #body>
      <p class="text-gray-600">
        Are you sure you want to delete this group? Tasks in the group will become ungrouped, not deleted.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="deleteGroupId = null">Cancel</UButton>
        <UButton color="error" @click="confirmDeleteGroup">Delete Group</UButton>
      </div>
    </template>
  </UModal>

  <!-- Export Modal -->
  <BoardExportModal
    v-model:open="showExport"
    :board-id="boardId"
    :board-name="containerRef?.board?.name || 'Board'"
    :columns="containerRef?.columns || []"
  />

  <!-- Template Chooser -->
  <BoardTemplateChooser
    v-model:open="showTemplates"
    :source-board-id="containerRef?.board?.id || boardId"
    :source-board-name="containerRef?.board?.name"
    @apply="handleApplyTemplate"
    @saved="() => {}"
  />

  <!-- Automation Builder -->
  <BoardAutomationBuilder
    :board-id="boardId"
    :open="showAutomations"
    @update:open="showAutomations = $event"
  />

  <!-- Task Slideover -->
  <USlideover
    v-model:open="showTaskPanel"
    side="right"
    :ui="{ content: 'w-[680px]' }"
  >
    <template #header>
      <div v-if="selectedTask" class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <span
            v-if="selectedTask.groupName"
            class="w-2 h-2 rounded-sm"
            :style="{ backgroundColor: selectedTask.groupColor || '#579BFC' }"
          />
          <span class="text-xs text-gray-500 uppercase tracking-wide">{{ selectedTask.groupName }}</span>
        </div>
        <UButton
          :icon="itemSubscribed ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
          :variant="itemSubscribed ? 'soft' : 'ghost'"
          :color="itemSubscribed ? 'primary' : 'neutral'"
          size="xs"
          @click="toggleItemSubscription"
        >
          {{ itemSubscribed ? 'Watching' : 'Watch' }}
        </UButton>
      </div>
    </template>

    <template #body>
      <div v-if="selectedTask" class="h-full flex flex-col">
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-gray-900 leading-tight">{{ selectedTask.title }}</h2>
        </div>

        <!-- Tabs -->
        <div class="flex items-center border-b -mx-4 px-4 mb-4">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px"
            :class="activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
            <span v-if="tab.count" class="ml-1 text-xs text-gray-400">{{ tab.count }}</span>
          </button>
          <div class="flex-1" />
          <UButton icon="i-lucide-plus" variant="ghost" size="sm" color="neutral" class="mb-2" />
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-auto">
          <template v-if="activeTab === 'updates'">
            <TaskActivityFeed v-if="selectedTaskId" :task-id="selectedTaskId" />
          </template>

          <div v-else-if="activeTab === 'subtasks'" class="px-1">
            <SubtaskList v-if="selectedTaskId" :task-id="selectedTaskId" />
          </div>

          <div v-else-if="activeTab === 'files'" class="space-y-4">
            <div class="flex items-center gap-3">
              <UButton icon="i-lucide-plus" variant="outline" size="sm">Add file</UButton>
              <div class="flex-1 relative">
                <UIcon name="i-lucide-search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search for files" class="w-full pl-9 pr-3 py-1.5 text-sm border rounded-md outline-none focus:border-blue-500" />
              </div>
            </div>
            <p class="text-sm text-gray-500">No files attached yet.</p>
          </div>

          <div v-else-if="activeTab === 'activity'" class="space-y-4">
            <div class="flex items-center justify-between border-b pb-3">
              <span class="text-sm font-medium text-gray-700">Other activities</span>
              <button class="text-sm text-blue-600 hover:text-blue-700">Automation activity</button>
            </div>
            <p class="text-sm text-gray-400 text-center py-8">No activity yet.</p>
          </div>

          <div v-else-if="activeTab === 'info'" class="space-y-4">
            <div class="flex items-center justify-between py-2 border-b">
              <span class="text-sm text-gray-500">Status</span>
              <UBadge color="primary" variant="soft">{{ selectedTask.status || 'Unknown' }}</UBadge>
            </div>
            <div class="flex items-center justify-between py-2 border-b">
              <span class="text-sm text-gray-500">Due Date</span>
              <span class="text-sm">{{ formatDate(selectedTask?.dueDate) || 'Not set' }}</span>
            </div>
            <div class="flex items-center justify-between py-2 border-b">
              <span class="text-sm text-gray-500">Assignee</span>
              <div class="flex items-center gap-2">
                <UAvatar size="xs" fallback="?" />
                <span class="text-sm">Unassigned</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import type { BoardColumn, BoardGroup } from '~/composables/useBoardData'
import BoardContainer from '~/components/board/BoardContainer.vue'
import BoardCell from '~/components/board/BoardCell.vue'
import BoardGroupRow from '~/components/board/BoardGroupRow.vue'
import BoardAddItemRow from '~/components/board/BoardAddItemRow.vue'
import BoardGroupSummary from '~/components/board/BoardGroupSummary.vue'
import BoardColumnConfig from '~/components/board/BoardColumnConfig.vue'
import BoardColumnTypeSelector from '~/components/board/BoardColumnTypeSelector.vue'
import BoardExportModal from '~/components/board/BoardExportModal.vue'
import BoardTemplateChooser from '~/components/board/BoardTemplateChooser.vue'
import BoardAutomationBuilder from '~/components/board/BoardAutomationBuilder.vue'
import SubtaskList from '~/components/task/SubtaskList.vue'
import TaskActivityFeed from '~/components/task/TaskActivityFeed.vue'

definePageMeta({ title: 'Board' })

// --- Types ---

interface TaskDetail {
  id: string
  title: string
  groupName?: string
  groupColor?: string
  dueDate?: string
  status?: string
}

// --- State ---

const route = useRoute()
const toast = useToast()
const boardId = computed(() => route.params.id as string)
const containerRef = ref<InstanceType<typeof BoardContainer> | null>(null)

const showAddColumn = ref(false)
const showAddGroup = ref(false)
const showDeleteConfirm = ref<string | null>(null)
const showDeleteModal = computed({
  get: () => showDeleteConfirm.value !== null,
  set: (val: boolean) => { if (!val) showDeleteConfirm.value = null },
})
const deleteGroupId = ref<string | null>(null)
const showDeleteGroupModal = computed({
  get: () => deleteGroupId.value !== null,
  set: (val: boolean) => { if (!val) deleteGroupId.value = null },
})
const showTaskPanel = ref(false)
const selectedTaskId = ref<string | null>(null)
const activeTab = ref('updates')
const newColumn = ref({ name: '', type: '' })
const showColumnConfig = ref(false)
const editingColumn = ref<BoardColumn | null>(null)
const newGroupName = ref('')
const newGroupColor = ref('#579BFC')
const showExport = ref(false)
const showTemplates = ref(false)
const showAutomations = ref(false)

const groupColorOptions = [
  '#579BFC', '#00C875', '#FDAB3D', '#E2445C', '#A25DDC',
  '#FF5AC4', '#FF642E', '#CAB641', '#9CD326', '#00D2D2',
  '#784BD1', '#66CCFF', '#BB3354', '#FF158A', '#037F4C',
  '#225091', '#4ECCC6', '#C4C4C4', '#808080', '#333333',
  '#7F5347',
]

// --- Container accessors ---

const refresh = () => containerRef.value?.refresh()
const refreshColumns = async () => {
  await containerRef.value?.refreshColumns()
  // Keep editingColumn in sync with refreshed data
  if (editingColumn.value) {
    const updated = containerRef.value?.columns?.find((c: any) => c.id === editingColumn.value!.id)
    if (updated) editingColumn.value = updated
  }
}

// --- Task Detail ---

const { data: taskData, execute: fetchTask } = useFetch<TaskDetail>(() => `/api/agency/tasks/${selectedTaskId.value!}`, { immediate: false })
const selectedTask = computed(() => taskData.value || null)

const tabs = [
  { id: 'updates', label: 'Updates', count: 0 },
  { id: 'subtasks', label: 'Subtasks', count: 0 },
  { id: 'files', label: 'Files', count: 0 },
  { id: 'activity', label: 'Activity Log', count: 0 },
  { id: 'info', label: 'Info', count: 0 },
]

// --- Item Subscription ---

const itemSubscribed = ref(false)

async function checkItemSubscription(taskId: string) {
  itemSubscribed.value = false
  try {
    const { subscriptions } = await $fetch<{ subscriptions: any[] }>(`/api/agency/boards/${boardId.value}/subscriptions`)
    itemSubscribed.value = subscriptions.some((s: any) => s.itemId === taskId)
  } catch {
    // Non-critical
  }
}

async function toggleItemSubscription() {
  if (!selectedTaskId.value) return
  try {
    if (itemSubscribed.value) {
      await $fetch(`/api/agency/boards/${boardId.value}/unsubscribe`, {
        method: 'DELETE',
        params: { itemId: selectedTaskId.value },
      })
      itemSubscribed.value = false
    } else {
      await $fetch(`/api/agency/boards/${boardId.value}/subscribe`, {
        method: 'POST',
        body: { itemId: selectedTaskId.value },
      })
      itemSubscribed.value = true
    }
  } catch (err) {
    console.error('Item subscribe toggle failed:', err)
  }
}

// --- Task Actions ---

async function openTask(taskId: string) {
  showTaskPanel.value = false
  selectedTaskId.value = null
  await nextTick()
  selectedTaskId.value = taskId
  activeTab.value = 'updates'
  showTaskPanel.value = true
  await fetchTask()
  checkItemSubscription(taskId)
}

async function handleAddItem(payload: { groupId: string; title: string; date?: string }) {
  try {
    // board exposed from container is the resolved department UUID
    const boardData = containerRef.value?.board
    const resolvedBoardId = (boardData as any)?.id || boardId.value
    const isDynamicGroup = payload.groupId?.startsWith('grouped_') || false
    const task = await $fetch<{ id: string }>(`/api/agency/tasks`, {
      method: 'POST',
      body: {
        title: payload.title,
        departmentId: resolvedBoardId,
        groupId: (payload.groupId === '__ungrouped__' || isDynamicGroup) ? null : payload.groupId,
      },
    })
    // If a date was provided (e.g. from calendar view), set the date column value
    if (payload.date && task?.id) {
      const dateCol = containerRef.value?.columns?.find((c: any) => {
        const t = c.columnType || c.type
        return t === 'date' || t === 'timeline'
      })
      if (dateCol) {
        await containerRef.value?.handleCellUpdate(task.id, dateCol.id, { dateValue: payload.date })
      }
    }
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Failed to add item',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  }
}

// --- Column Actions ---

async function addColumn() {
  if (!newColumn.value.name || !newColumn.value.type) return
  await $fetch(`/api/agency/boards/${boardId.value}/columns`, {
    method: 'POST',
    body: newColumn.value,
  })
  newColumn.value = { name: '', type: '' }
  showAddColumn.value = false
  refreshColumns()
}

function columnMenuItems(col: BoardColumn) {
  return [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openColumnConfig(col) },
    { label: 'Sort', icon: 'i-lucide-arrow-up-down' },
    { label: 'Filter', icon: 'i-lucide-filter' },
    { type: 'separator' as const },
    { label: 'Hide', icon: 'i-lucide-eye-off', onSelect: () => hideColumn(col.id) },
    { type: 'separator' as const },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { showDeleteConfirm.value = col.id } },
  ]
}

function openColumnConfig(col: BoardColumn) {
  editingColumn.value = col
  showColumnConfig.value = true
}

async function hideColumn(columnId: string) {
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/columns/${columnId}`, {
      method: 'PATCH',
      body: { isVisible: false },
    })
    refreshColumns()
  } catch (err: any) {
    toast.add({ title: 'Failed to hide column', color: 'error' })
  }
}

async function handleColumnSave(columnId: string, payload: any) {
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/columns/${columnId}`, {
      method: 'PATCH',
      body: payload,
    })
    refreshColumns()
    toast.add({ title: 'Column updated', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to update column', color: 'error' })
  }
}

async function handleColumnDelete(columnId: string | undefined) {
  if (!columnId) return
  showColumnConfig.value = false
  showDeleteConfirm.value = columnId
}

async function handleAddOption(columnId: string, payload: { label: string; color: string }) {
  try {
    await $fetch(`/api/agency/columns/${columnId}/options`, {
      method: 'POST',
      body: payload,
    })
    await refreshColumns()
  } catch (err: any) {
    toast.add({ title: 'Failed to add option', color: 'error' })
  }
}

async function handleUpdateOption(columnId: string, optionId: string, payload: any) {
  try {
    await $fetch(`/api/agency/columns/${columnId}/options/${optionId}`, {
      method: 'PATCH',
      body: payload,
    })
    refreshColumns()
  } catch (err: any) {
    toast.add({ title: 'Failed to update option', color: 'error' })
  }
}

async function confirmDeleteColumn() {
  if (!showDeleteConfirm.value) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/columns/${showDeleteConfirm.value}`, {
      method: 'DELETE',
    })
    showDeleteConfirm.value = null
    refreshColumns()
  } catch (err) {
    console.error('Failed to delete column:', err)
  }
}

// --- Group Actions ---

function toggleGroup(group: BoardGroup) {
  // Dynamic groups (from group-by) use local collapse tracking
  if (group.id.startsWith('grouped_')) {
    containerRef.value?.toggleGroupExpanded(group.id)
    return
  }
  group.isExpanded = !group.isExpanded
  if (group.id !== '__ungrouped__') {
    $fetch(`/api/agency/boards/${boardId.value}/groups/${group.id}`, {
      method: 'PATCH',
      body: { isCollapsed: !group.isExpanded },
    }).catch(() => {})
  }
}

async function renameGroup(groupId: string, name: string) {
  if (groupId === '__ungrouped__' || groupId.startsWith('grouped_')) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/groups/${groupId}`, {
      method: 'PATCH',
      body: { name },
    })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to rename group', color: 'error' })
  }
}

async function updateGroupColor(groupId: string, color: string) {
  if (groupId === '__ungrouped__' || groupId.startsWith('grouped_')) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/groups/${groupId}`, {
      method: 'PATCH',
      body: { color },
    })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update group color', color: 'error' })
  }
}

function deleteGroup(groupId: string) {
  if (groupId === '__ungrouped__' || groupId.startsWith('grouped_')) return
  deleteGroupId.value = groupId
}

async function confirmDeleteGroup() {
  if (!deleteGroupId.value) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/groups/${deleteGroupId.value}`, {
      method: 'DELETE',
    })
    deleteGroupId.value = null
    await refresh()
    toast.add({ title: 'Group deleted', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to delete group', color: 'error' })
  }
}

async function handleAddGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  try {
    await $fetch(`/api/agency/boards/${boardId.value}/groups`, {
      method: 'POST',
      body: { name, color: newGroupColor.value },
    })
    newGroupName.value = ''
    newGroupColor.value = '#579BFC'
    showAddGroup.value = false
    await refresh()
    toast.add({ title: 'Group created', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to create group', color: 'error' })
  }
}

async function addGroupNear(_groupId: string, _position: 'above' | 'below') {
  newGroupName.value = ''
  newGroupColor.value = '#579BFC'
  showAddGroup.value = true
}

// --- Export & Templates ---

async function handleApplyTemplate(templateId: string) {
  try {
    const result = await $fetch<{ success: boolean; templateName: string; created: { columns: number; groups: number; views: number } }>(`/api/agency/boards/templates/${templateId}/apply`, {
      method: 'POST',
      body: { departmentId: containerRef.value?.board?.id || boardId.value },
    })
    toast.add({
      title: 'Template applied',
      description: `Added ${result.created.columns} columns and ${result.created.groups} groups`,
      color: 'success',
    })
    await refresh()
    refreshColumns()
  } catch (err: any) {
    toast.add({
      title: 'Failed to apply template',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  }
}

// --- Formatting ---

function formatDate(date: string | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
</script>
