<script setup lang="ts">
import type { Task, BoardViewType, KanbanFilters, SortRule } from '~/types'
import { useWorkflowKeyboardShortcuts } from '~/composables/useKeyboardShortcuts'
import SubtaskList from '~/components/task/SubtaskList.vue'
import TaskCommentThread from '~/components/task/CommentThread.vue'
import TaskBillingPanel from '~/components/task/TaskBillingPanel.vue'
import TaskChatPanel from '~/components/task/TaskChatPanel.vue'
import TaskDetailsPanel from '~/components/task/TaskDetailsPanel.vue'
import TaskTimePanel from '~/components/task/TaskTimePanel.vue'

definePageMeta({
  title: 'Workflow Board'
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

// Search input ref for keyboard shortcut
const searchInputRef = ref<HTMLInputElement | null>(null)

// Current view state
const currentView = ref<BoardViewType>((route.query.view as BoardViewType) || 'kanban')
const currentWorkspaceId = ref<string | undefined>(route.query.workspace as string)
const currentDepartmentId = ref<string | undefined>(route.query.department as string)
const currentFilters = ref<KanbanFilters>({})
const currentSortConfig = ref<SortRule[]>([])
const groupBy = ref<string | undefined>(undefined)

// Fetch workspaces for sidebar
const { data: workspacesData } = useLazyFetch('/api/agency/workspaces')
const workspaces = computed(() => (workspacesData.value as any)?.workspaces || [])

const selectedWorkspace = computed(() =>
  workspaces.value.find((w: any) => w.id === currentWorkspaceId.value)
)

const sidebarTitle = computed(() => {
  if (currentDepartmentId.value) {
    // Find the board name within workspaces
    for (const ws of workspaces.value) {
      const board = ws.boards?.find((b: any) => b.id === currentDepartmentId.value)
      if (board) return board.name
    }
  }
  if (currentWorkspaceId.value) return selectedWorkspace.value?.name || 'Workspace'
  return 'All Tasks'
})

// Fetch team members for assignee dropdown
const { data: teamMembersData } = useLazyFetch('/api/agency/team-members', {
  query: { active: 'true' }
})
const teamMembers = computed(() => (teamMembersData.value as any)?.members || [])

// Fetch projects for project dropdown
const { data: projectsData } = useLazyFetch('/api/agency/projects', {
  query: { status: 'active' }
})
const projects = computed(() => (projectsData.value as any[]) || [])

// Fetch statuses based on selected workspace/department
const { data: statusesData } = useLazyFetch('/api/agency/statuses', {
  query: computed(() => ({
    departmentId: currentDepartmentId.value,
    workspaceId: !currentDepartmentId.value ? currentWorkspaceId.value : undefined
  }))
})
const statuses = computed(() => (statusesData.value as any[]) || [])

// Fetch tags (labels) based on selected department
const { data: tagsData, refresh: refreshTags } = useLazyFetch('/api/agency/tags', {
  query: computed(() => ({
    limit: 100
  }))
})
const labels = computed(() => (tagsData.value as any[]) || [])

// Refresh labels list
function refreshLabels() {
  refreshTags()
}

// Task detail slideover
const showTaskPanel = ref(false)
const selectedTaskId = ref<string | null>(null)
const activeTab = ref('updates')
const showChat = ref(false)

const taskPanelTabs = [
  { id: 'updates', label: 'Updates' },
  { id: 'subtasks', label: 'Subtasks' },
  { id: 'details', label: 'Details' },
  { id: 'time-billing', label: 'Time & Billing' },
  { id: 'ai', label: 'AI', icon: 'i-lucide-sparkles' },
]

const { data: taskData, execute: fetchTask } = useFetch<Task>(() => `/api/agency/tasks/${selectedTaskId.value!}`, { immediate: false, watch: false })
const selectedTask = computed(() => taskData.value || null)

// Keyboard nav highlighted task (separate from detail panel selectedTask)
const navTask = ref<Task | null>(null)

// AI assistant panel
const showAiPanel = ref(false)

// Derive context names for AI panel
const currentBoardName = computed(() => {
  if (!currentDepartmentId.value) return undefined
  for (const ws of workspaces.value) {
    const board = ws.boards?.find((b: any) => b.id === currentDepartmentId.value)
    if (board) return board.name
  }
  return undefined
})

// Create task modal
const showCreateModal = ref(false)
const createTaskStatusId = ref<string | undefined>()
const createTaskDate = ref<string | undefined>()

// Derive departmentId for create dialog
const createDialogDepartmentId = computed(() =>
  currentDepartmentId.value
  || selectedWorkspace.value?.boards?.[0]?.id
  || workspaces.value[0]?.boards?.[0]?.id
)

function onTaskCreated() {
  refreshBoard()
}

// Save view modal
const showSaveViewModal = ref(false)
const saveViewName = ref('')

// Handle workspace/board selection
function selectWorkspace(workspaceId: string | undefined) {
  currentWorkspaceId.value = workspaceId
  currentDepartmentId.value = undefined
  router.push({
    query: {
      ...route.query,
      workspace: workspaceId || undefined,
      department: undefined
    }
  })
}

function selectBoard(boardId: string, workspaceId: string) {
  currentWorkspaceId.value = undefined
  currentDepartmentId.value = boardId
  router.push({
    query: {
      ...route.query,
      workspace: undefined,
      department: boardId
    }
  })
}

// Handle view change
function changeView(view: BoardViewType) {
  currentView.value = view
  router.push({
    query: {
      ...route.query,
      view
    }
  })
}

// Handle task click
async function openTask(task: Task) {
  showTaskPanel.value = false
  selectedTaskId.value = null
  await nextTick()
  selectedTaskId.value = task.id
  activeTab.value = 'updates'
  showChat.value = false
  showTaskPanel.value = true
  await fetchTask()
}

// Handle create task
function openCreateTask(statusId?: string) {
  createTaskStatusId.value = statusId
  createTaskDate.value = undefined
  showCreateModal.value = true
}

function openCreateTaskWithDate(date: string) {
  createTaskStatusId.value = undefined
  createTaskDate.value = date
  showCreateModal.value = true
}

// Handle save view
async function saveCurrentView() {
  if (!saveViewName.value.trim()) {
    toast.add({
      title: 'View name is required',
      color: 'error'
    })
    return
  }

  try {
    await $fetch('/api/agency/views/saved', {
      method: 'POST',
      body: {
        departmentId: currentDepartmentId.value,
        name: saveViewName.value,
        viewType: currentView.value,
        filters: currentFilters.value,
        sortConfig: currentSortConfig.value,
        groupBy: groupBy.value
      }
    })

    toast.add({
      title: 'View saved successfully',
      color: 'success'
    })

    showSaveViewModal.value = false
    saveViewName.value = ''
  } catch (error) {
    toast.add({
      title: 'Failed to save view',
      color: 'error'
    })
  }
}

// Board ref for refresh
const boardRef = ref<any>(null)

function refreshBoard() {
  boardRef.value?.refreshTasks?.()
}

// Keyboard navigation helper - get task at current position
function getTaskAtNavPosition(colIndex: number, taskIndex: number): Task | null {
  if (currentView.value !== 'kanban' || !boardRef.value) return null
  return boardRef.value.getTaskAtPosition?.(colIndex, taskIndex) || null
}

// Keyboard shortcuts
const { showHelp: showShortcutsHelp, shortcuts, formatShortcut, selectedTaskIndex, selectedColumnIndex } = useWorkflowKeyboardShortcuts({
  onNewTask: () => openCreateTask(),
  onSearch: () => {
    const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement
    searchInput?.focus()
  },
  onNavigateUp: () => {
    if (currentView.value !== 'kanban' || !boardRef.value) return
    const taskCount = boardRef.value.getTaskCount?.(selectedColumnIndex.value) || 0
    if (taskCount === 0) return

    // Move up, wrap to bottom if at top
    if (selectedTaskIndex.value <= 0) {
      selectedTaskIndex.value = taskCount - 1
    } else {
      selectedTaskIndex.value--
    }
    navTask.value = getTaskAtNavPosition(selectedColumnIndex.value, selectedTaskIndex.value)
  },
  onNavigateDown: () => {
    if (currentView.value !== 'kanban' || !boardRef.value) return
    const taskCount = boardRef.value.getTaskCount?.(selectedColumnIndex.value) || 0
    if (taskCount === 0) return

    // Move down, wrap to top if at bottom
    if (selectedTaskIndex.value >= taskCount - 1) {
      selectedTaskIndex.value = 0
    } else {
      selectedTaskIndex.value++
    }
    navTask.value = getTaskAtNavPosition(selectedColumnIndex.value, selectedTaskIndex.value)
  },
  onNavigateLeft: () => {
    if (currentView.value !== 'kanban' || !boardRef.value) return
    const columnCount = boardRef.value.getColumnCount?.() || 0
    if (columnCount === 0) return

    // Move to previous column, wrap to last if at first
    if (selectedColumnIndex.value <= 0) {
      selectedColumnIndex.value = columnCount - 1
    } else {
      selectedColumnIndex.value--
    }

    // Clamp task index to new column's task count
    const taskCount = boardRef.value.getTaskCount?.(selectedColumnIndex.value) || 0
    if (taskCount > 0) {
      selectedTaskIndex.value = Math.min(selectedTaskIndex.value, taskCount - 1)
      navTask.value = getTaskAtNavPosition(selectedColumnIndex.value, selectedTaskIndex.value)
    } else {
      selectedTaskIndex.value = -1
      navTask.value = null
    }
  },
  onNavigateRight: () => {
    if (currentView.value !== 'kanban' || !boardRef.value) return
    const columnCount = boardRef.value.getColumnCount?.() || 0
    if (columnCount === 0) return

    // Move to next column, wrap to first if at last
    if (selectedColumnIndex.value >= columnCount - 1) {
      selectedColumnIndex.value = 0
    } else {
      selectedColumnIndex.value++
    }

    // Clamp task index to new column's task count
    const taskCount = boardRef.value.getTaskCount?.(selectedColumnIndex.value) || 0
    if (taskCount > 0) {
      selectedTaskIndex.value = Math.min(selectedTaskIndex.value, taskCount - 1)
      navTask.value = getTaskAtNavPosition(selectedColumnIndex.value, selectedTaskIndex.value)
    } else {
      selectedTaskIndex.value = -1
      navTask.value = null
    }
  },
  onOpenTask: () => {
    if (navTask.value) {
      openTask(navTask.value)
    }
  },
  onCloseModal: () => {
    if (showTaskPanel.value) {
      showTaskPanel.value = false
    } else if (showCreateModal.value) {
      showCreateModal.value = false
    } else if (showSaveViewModal.value) {
      showSaveViewModal.value = false
    }
  },
  onToggleView: (view: string) => {
    changeView(view as BoardViewType)
  },
  onRefresh: () => refreshBoard()
})
</script>

<template>
  <div class="flex-1 min-w-0 flex h-svh max-h-svh overflow-hidden">
    <!-- Workspace Sidebar -->
    <UDashboardPanel
      collapsible
      class="!flex-none !w-52 !max-h-svh overflow-hidden"
    >
      <UDashboardNavbar title="Workspaces" />

      <div class="flex-1 overflow-y-auto">
        <nav class="p-2 space-y-1">
          <!-- All Tasks -->
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors"
            :class="!currentWorkspaceId && !currentDepartmentId ? 'bg-primary/10 text-primary font-medium' : 'text-muted hover:text-default hover:bg-elevated/50'"
            @click="selectWorkspace(undefined)"
          >
            <UIcon name="i-lucide-layout-grid" class="w-4 h-4 flex-shrink-0" />
            <span class="truncate">All Tasks</span>
          </button>

          <!-- Workspace groups -->
          <div v-for="ws in workspaces" :key="ws.id" class="mt-2">
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors"
              :class="currentWorkspaceId === ws.id ? 'bg-primary/10 text-primary font-medium' : 'text-default hover:bg-elevated/50'"
              @click="selectWorkspace(ws.id)"
            >
              <UIcon :name="'i-lucide-' + (ws.icon || 'briefcase')" class="w-4 h-4 flex-shrink-0" />
              <span class="truncate flex-1 text-left">{{ ws.name }}</span>
              <span v-if="ws.stats?.tasks" class="text-xs text-muted">{{ ws.stats.tasks }}</span>
            </button>

            <!-- Boards under workspace (shown when workspace is selected) -->
            <div v-if="currentWorkspaceId === ws.id && ws.boards?.length" class="ml-4 mt-1 space-y-0.5">
              <button
                v-for="board in ws.boards"
                :key="board.id"
                class="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors"
                :class="currentDepartmentId === board.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted hover:text-default hover:bg-elevated/50'"
                @click="selectBoard(board.id, ws.id)"
              >
                <span
                  class="w-2 h-2 rounded-sm flex-shrink-0"
                  :style="{ backgroundColor: board.color || ws.color || '#579BFC' }"
                />
                <span class="truncate flex-1 text-left">{{ board.name }}</span>
                <span v-if="board.taskCount" class="text-xs text-muted">{{ board.taskCount }}</span>
              </button>
            </div>
          </div>
        </nav>
      </div>
    </UDashboardPanel>

    <!-- Main Board Panel -->
    <UDashboardPanel class="!max-h-svh overflow-hidden">
      <UDashboardNavbar :title="sidebarTitle">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UTooltip text="AI Assistant">
              <UButton
                icon="i-lucide-brain"
                :variant="showAiPanel ? 'soft' : 'ghost'"
                :color="showAiPanel ? 'primary' : 'neutral'"
                size="sm"
                @click="showAiPanel = !showAiPanel"
              />
            </UTooltip>
            <UButton
              icon="i-lucide-plus"
              label="New Task"
              @click="openCreateTask()"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <!-- Toolbar -->
      <UDashboardToolbar class="px-4 py-2 border-b border-default">
        <WorkflowBoardToolbar
          :department-id="currentDepartmentId"
          :current-view="currentView"
          :filters="currentFilters"
          :sort-config="currentSortConfig"
          :group-by="groupBy"
          @update:current-view="changeView"
          @update:filters="currentFilters = $event"
          @update:sort-config="currentSortConfig = $event"
          @update:group-by="groupBy = $event"
          @save-view="showSaveViewModal = true"
        />
      </UDashboardToolbar>

      <!-- Board Content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Kanban View -->
        <WorkflowKanbanBoard
          v-if="currentView === 'kanban'"
          ref="boardRef"
          :department-id="currentDepartmentId"
          :workspace-id="currentWorkspaceId"
          :filters="currentFilters"
          :selected-task-id="navTask?.id || selectedTaskId"
          :available-labels="labels"
          @task-click="openTask"
          @create-task="openCreateTask"
          @task-labels-update="refreshBoard"
          @refresh-labels="refreshLabels"
        />

        <!-- Table View -->
        <WorkflowTableView
          v-else-if="currentView === 'table'"
          ref="boardRef"
          :department-id="currentDepartmentId"
          :workspace-id="currentWorkspaceId"
          :filters="currentFilters"
          :sort-config="currentSortConfig"
          :group-by="groupBy"
          @task-click="openTask"
          @create-task="openCreateTask()"
          @sort-change="currentSortConfig = $event"
        />

        <!-- Timeline View -->
        <WorkflowTimelineView
          v-else-if="currentView === 'timeline'"
          :department-id="currentDepartmentId"
          :workspace-id="currentWorkspaceId"
          :filters="currentFilters"
          @task-click="openTask"
        />

        <!-- Calendar View -->
        <WorkflowCalendarView
          v-else-if="currentView === 'calendar'"
          :department-id="currentDepartmentId"
          :workspace-id="currentWorkspaceId"
          :filters="currentFilters"
          @task-click="openTask"
          @create-task="openCreateTaskWithDate"
        />
      </div>
    </UDashboardPanel>

    <!-- AI Assistant Panel -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-x-4"
      enter-to-class="opacity-100 translate-x-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-x-0"
      leave-to-class="opacity-0 translate-x-4"
    >
      <div v-if="showAiPanel" class="w-[340px] flex-shrink-0 max-h-svh overflow-hidden">
        <WorkflowAiPanel
          :workspace-id="currentWorkspaceId"
          :workspace-name="selectedWorkspace?.name"
          :department-id="currentDepartmentId"
          :department-name="currentBoardName"
          @close="showAiPanel = false"
        />
      </div>
    </Transition>

    <!-- Task Slideover -->
    <USlideover
      v-model:open="showTaskPanel"
      side="right"
      :ui="{ content: 'w-[90vw] sm:w-[70vw] md:w-[50vw] lg:w-[33vw] min-w-[400px] max-w-[800px]' }"
    >
      <template #header>
        <div v-if="selectedTask" class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <UBadge
              v-if="selectedTask.status"
              :style="{ backgroundColor: selectedTask.status.color + '20', color: selectedTask.status.color }"
              variant="subtle"
              size="sm"
            >
              {{ selectedTask.status.name }}
            </UBadge>
            <UBadge
              v-if="selectedTask.priority"
              :color="selectedTask.priority === 'urgent' ? 'error' : selectedTask.priority === 'high' ? 'warning' : 'neutral'"
              size="sm"
            >
              {{ selectedTask.priority }}
            </UBadge>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-message-circle"
              :variant="showChat ? 'soft' : 'ghost'"
              :color="showChat ? 'primary' : 'neutral'"
              size="xs"
              @click="showChat = !showChat"
            />
          </div>
        </div>
      </template>

      <template #body>
        <div v-if="selectedTask" class="h-full flex flex-col">
          <div class="mb-4">
            <h2 class="text-lg font-semibold leading-tight">{{ selectedTask.title }}</h2>
            <p v-if="selectedTask.assignee" class="text-sm text-muted mt-1">
              Assigned to {{ selectedTask.assignee.name }}
            </p>
          </div>

          <!-- Chat Overlay (replaces tabs when active) -->
          <div v-if="showChat" class="flex-1 overflow-hidden">
            <TaskChatPanel v-if="selectedTaskId" :task-id="selectedTaskId" />
          </div>

          <!-- Tab Interface -->
          <template v-else>
            <div class="flex items-center border-b -mx-4 px-4 mb-4">
              <button
                v-for="tab in taskPanelTabs"
                :key="tab.id"
                class="px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1"
                :class="activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-default'"
                @click="activeTab = tab.id"
              >
                <UIcon v-if="tab.icon" :name="tab.icon" class="w-3.5 h-3.5" />
                {{ tab.label }}
              </button>
            </div>

            <div class="flex-1 overflow-auto">
              <template v-if="activeTab === 'updates'">
                <TaskCommentThread
                  v-if="selectedTaskId"
                  :task-id="selectedTaskId"
                  placeholder="Write an update and mention others with @"
                />
              </template>

              <div v-else-if="activeTab === 'subtasks'" class="px-1">
                <SubtaskList v-if="selectedTaskId" :task-id="selectedTaskId" />
              </div>

              <div v-else-if="activeTab === 'details'">
                <TaskDetailsPanel v-if="selectedTaskId" :task-id="selectedTaskId" />
              </div>

              <div v-else-if="activeTab === 'time-billing'" class="space-y-6">
                <TaskTimePanel v-if="selectedTaskId" :task-id="selectedTaskId" />
                <hr class="border-default" />
                <TaskBillingPanel v-if="selectedTaskId" :task-id="selectedTaskId" />
              </div>

              <div v-else-if="activeTab === 'ai'">
                <WorkflowTaskAiAssistant
                  v-if="selectedTaskId"
                  :task-id="selectedTaskId"
                  :task="selectedTask"
                  @task-updated="fetchTask()"
                />
              </div>
            </div>
          </template>
        </div>
      </template>
    </USlideover>

    <!-- Create Task Dialog -->
    <WorkflowTaskCreateDialog
      v-model:open="showCreateModal"
      :statuses="statuses"
      :team-members="teamMembers"
      :projects="projects"
      :labels="labels"
      :department-id="createDialogDepartmentId"
      :workspace-id="currentWorkspaceId"
      :board-name="currentBoardName"
      :initial-status-id="createTaskStatusId"
      :initial-date="createTaskDate"
      @created="onTaskCreated"
    />

    <!-- Save View Modal -->
    <UModal v-model:open="showSaveViewModal">
      <template #content>
        <UCard class="w-full max-w-sm">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Save View</h3>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                size="sm"
                @click="showSaveViewModal = false"
              />
            </div>
          </template>

          <UFormField label="View Name" required>
            <UInput
              v-model="saveViewName"
              placeholder="My custom view"
              autofocus
            />
          </UFormField>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showSaveViewModal = false">
                Cancel
              </UButton>
              <UButton @click="saveCurrentView">
                Save View
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Keyboard Shortcuts Help Modal -->
    <WorkflowKeyboardShortcutsHelp
      v-model:open="showShortcutsHelp"
      :shortcuts="shortcuts"
      :format-shortcut="formatShortcut"
    />

    <!-- Keyboard shortcuts button (fixed position) -->
    <div class="fixed bottom-4 right-4 z-50">
      <UTooltip text="Keyboard shortcuts (?)">
        <UButton
          icon="i-lucide-keyboard"
          variant="soft"
          size="sm"
          aria-label="Show keyboard shortcuts"
          @click="showShortcutsHelp = true"
        />
      </UTooltip>
    </div>
  </div>
</template>
