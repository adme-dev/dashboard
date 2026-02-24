<script setup lang="ts">
import type { Department, Task, BoardViewType, KanbanFilters, SortRule } from '~/types'
import { useWorkflowKeyboardShortcuts } from '~/composables/useKeyboardShortcuts'

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
const currentDepartmentId = ref<string | undefined>(route.query.department as string)
const currentFilters = ref<KanbanFilters>({})
const currentSortConfig = ref<SortRule[]>([])
const groupBy = ref<string | undefined>(undefined)

// Fetch departments for sidebar
const { data: departmentsData } = await useFetch('/api/agency/departments')
const departments = computed(() => (departmentsData.value as Department[]) || [])

const selectedDepartment = computed(() =>
  departments.value.find(d => d.id === currentDepartmentId.value)
)

// Fetch team members for assignee dropdown
const { data: teamMembersData } = await useFetch('/api/agency/team-members', {
  query: { active: 'true' }
})
const teamMembers = computed(() => (teamMembersData.value as any)?.members || [])

// Fetch projects for project dropdown
const { data: projectsData } = await useFetch('/api/agency/projects', {
  query: { status: 'active' }
})
const projects = computed(() => (projectsData.value as any[]) || [])

// Fetch statuses based on selected department
const { data: statusesData } = await useFetch('/api/agency/statuses', {
  query: computed(() => ({
    departmentId: currentDepartmentId.value
  }))
})
const statuses = computed(() => (statusesData.value as any[]) || [])

// Fetch tags (labels) based on selected department
const { data: tagsData, refresh: refreshTags } = await useFetch('/api/agency/tags', {
  query: computed(() => ({
    limit: 100
  }))
})
const labels = computed(() => (tagsData.value as any[]) || [])

// Refresh labels list
function refreshLabels() {
  refreshTags()
}

// Task detail modal
const showTaskModal = ref(false)
const selectedTask = ref<Task | null>(null)

// Create task modal
const showCreateModal = ref(false)
const createTaskStatusId = ref<string | undefined>()
const createTaskDate = ref<string | undefined>()
const creatingTask = ref(false)

// Create task form state
const newTask = ref({
  title: '',
  description: '',
  projectId: undefined as string | undefined,
  statusId: undefined as string | undefined,
  priority: 'medium' as 'urgent' | 'high' | 'medium' | 'low',
  assigneeId: undefined as string | undefined,
  dueDate: '',
  startDate: '',
  estimatedHours: undefined as number | undefined,
  labels: [] as string[]
})

// Reset form when modal opens
watch(showCreateModal, (isOpen) => {
  if (isOpen) {
    newTask.value = {
      title: '',
      description: '',
      projectId: undefined,
      statusId: createTaskStatusId.value,
      priority: 'medium',
      assigneeId: undefined,
      dueDate: createTaskDate.value || '',
      startDate: '',
      estimatedHours: undefined,
      labels: []
    }
  }
})

// Priority options
const priorityOptions = [
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' }
]

// Toggle label selection
function toggleLabel(labelId: string) {
  const index = newTask.value.labels.indexOf(labelId)
  if (index === -1) {
    newTask.value.labels.push(labelId)
  } else {
    newTask.value.labels.splice(index, 1)
  }
}

// Create task handler
async function createTask() {
  if (!newTask.value.title.trim()) {
    toast.add({
      title: 'Task title is required',
      color: 'error'
    })
    return
  }

  // Must have a department selected or use first available
  const departmentId = currentDepartmentId.value || departments.value[0]?.id
  if (!departmentId) {
    toast.add({
      title: 'Please select a department',
      color: 'error'
    })
    return
  }

  creatingTask.value = true

  try {
    await $fetch('/api/agency/tasks', {
      method: 'POST',
      body: {
        departmentId,
        title: newTask.value.title.trim(),
        description: newTask.value.description?.trim() || undefined,
        projectId: newTask.value.projectId || undefined,
        statusId: newTask.value.statusId || undefined,
        priority: newTask.value.priority,
        assigneeId: newTask.value.assigneeId || undefined,
        dueDate: newTask.value.dueDate || undefined,
        startDate: newTask.value.startDate || undefined,
        estimatedHours: newTask.value.estimatedHours || undefined,
        labels: newTask.value.labels.length > 0 ? newTask.value.labels : undefined
      }
    })

    toast.add({
      title: 'Task created successfully',
      color: 'success'
    })

    showCreateModal.value = false
    refreshBoard()
  } catch (error: any) {
    toast.add({
      title: error?.data?.statusMessage || 'Failed to create task',
      color: 'error'
    })
  } finally {
    creatingTask.value = false
  }
}

// Save view modal
const showSaveViewModal = ref(false)
const saveViewName = ref('')

// Handle department selection
function selectDepartment(departmentId: string | undefined) {
  currentDepartmentId.value = departmentId
  router.push({
    query: {
      ...route.query,
      department: departmentId || undefined
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
function openTask(task: Task) {
  selectedTask.value = task
  showTaskModal.value = true
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
    selectedTask.value = getTaskAtNavPosition(selectedColumnIndex.value, selectedTaskIndex.value)
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
    selectedTask.value = getTaskAtNavPosition(selectedColumnIndex.value, selectedTaskIndex.value)
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
      selectedTask.value = getTaskAtNavPosition(selectedColumnIndex.value, selectedTaskIndex.value)
    } else {
      selectedTaskIndex.value = -1
      selectedTask.value = null
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
      selectedTask.value = getTaskAtNavPosition(selectedColumnIndex.value, selectedTaskIndex.value)
    } else {
      selectedTaskIndex.value = -1
      selectedTask.value = null
    }
  },
  onOpenTask: () => {
    if (selectedTask.value) {
      showTaskModal.value = true
    }
  },
  onCloseModal: () => {
    if (showTaskModal.value) {
      showTaskModal.value = false
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
  <div class="flex-1 min-w-0 flex">
    <!-- Department Sidebar -->
    <UDashboardPanel
      :width="240"
      collapsible
    >
      <UDashboardNavbar title="Departments" />

      <UNavigationMenu
        :items="[
          [{
            label: 'All Tasks',
            icon: 'i-lucide-layout-grid',
            active: !currentDepartmentId,
            click: () => selectDepartment(undefined)
          }],
          departments.map(dept => ({
            label: dept.name,
            icon: 'i-lucide-' + (dept.icon || 'folder'),
            active: currentDepartmentId === dept.id,
            click: () => selectDepartment(dept.id),
            badge: dept.activeTasks ? String(dept.activeTasks) : undefined
          }))
        ]"
        orientation="vertical"
        class="p-2"
      />
    </UDashboardPanel>

    <!-- Main Board Panel -->
    <UDashboardPanel>
      <UDashboardNavbar :title="selectedDepartment?.name || 'All Tasks'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="New Task"
            @click="openCreateTask()"
          />
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
      <template #body>
        <div class="h-full">
          <!-- Kanban View -->
          <WorkflowKanbanBoard
            v-if="currentView === 'kanban'"
            ref="boardRef"
            :department-id="currentDepartmentId"
            :filters="currentFilters"
            :selected-task-id="selectedTask?.id"
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
            :filters="currentFilters"
            @task-click="openTask"
          />

          <!-- Calendar View -->
          <WorkflowCalendarView
            v-else-if="currentView === 'calendar'"
            :department-id="currentDepartmentId"
            :filters="currentFilters"
            @task-click="openTask"
            @create-task="openCreateTaskWithDate"
          />
        </div>
      </template>
    </UDashboardPanel>

    <!-- Task Detail Modal -->
    <UModal v-model:open="showTaskModal">
      <template #content>
        <UCard v-if="selectedTask" class="w-full max-w-2xl">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">{{ selectedTask.title }}</h3>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                size="sm"
                @click="showTaskModal = false"
              />
            </div>
          </template>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-sm text-muted">Status</label>
                <UBadge
                  v-if="selectedTask.status"
                  :style="{ backgroundColor: selectedTask.status.color + '20', color: selectedTask.status.color }"
                  variant="subtle"
                >
                  {{ selectedTask.status.name }}
                </UBadge>
              </div>
              <div>
                <label class="text-sm text-muted">Priority</label>
                <UBadge :color="selectedTask.priority === 'urgent' ? 'error' : selectedTask.priority === 'high' ? 'warning' : 'neutral'">
                  {{ selectedTask.priority }}
                </UBadge>
              </div>
              <div>
                <label class="text-sm text-muted">Assignee</label>
                <p>{{ selectedTask.assignee?.name || 'Unassigned' }}</p>
              </div>
              <div>
                <label class="text-sm text-muted">Due Date</label>
                <p>{{ selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : 'Not set' }}</p>
              </div>
            </div>

            <div v-if="selectedTask.description">
              <label class="text-sm text-muted">Description</label>
              <p class="mt-1">{{ selectedTask.description }}</p>
            </div>

            <div v-if="selectedTask.labels?.length">
              <label class="text-sm text-muted">Labels</label>
              <div class="flex flex-wrap gap-1 mt-1">
                <UBadge
                  v-for="label in selectedTask.labels"
                  :key="label.id"
                  :style="{ backgroundColor: label.color + '20', color: label.color }"
                  variant="subtle"
                  size="sm"
                >
                  {{ label.name }}
                </UBadge>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showTaskModal = false">
                Close
              </UButton>
              <UButton :to="`/agency/tasks/${selectedTask.id}`">
                View Details
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Create Task Modal -->
    <UModal v-model:open="showCreateModal">
      <template #content>
        <UCard class="w-full max-w-lg">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Create Task</h3>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                size="sm"
                @click="showCreateModal = false"
              />
            </div>
          </template>

          <form class="space-y-4" @submit.prevent="createTask">
            <!-- Title (Required) -->
            <UFormField label="Title" required>
              <UInput
                v-model="newTask.title"
                placeholder="Enter task title..."
                autofocus
              />
            </UFormField>

            <!-- Description -->
            <UFormField label="Description">
              <UTextarea
                v-model="newTask.description"
                placeholder="Task description..."
                :rows="3"
              />
            </UFormField>

            <!-- Status & Priority (Row) -->
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Status">
                <USelectMenu
                  v-model="newTask.statusId"
                  :items="statuses.map(s => ({ label: s.name, value: s.id, color: s.color }))"
                  placeholder="Select status..."
                  value-key="value"
                >
                  <template #item="{ item }">
                    <span
                      class="w-2 h-2 rounded-full mr-2"
                      :style="{ backgroundColor: item.color }"
                    />
                    {{ item.label }}
                  </template>
                </USelectMenu>
              </UFormField>

              <UFormField label="Priority">
                <USelectMenu
                  v-model="newTask.priority"
                  :items="priorityOptions"
                  value-key="value"
                />
              </UFormField>
            </div>

            <!-- Assignee & Project (Row) -->
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Assignee">
                <USelectMenu
                  v-model="newTask.assigneeId"
                  :items="teamMembers.map((m: any) => ({ label: m.name, value: m.id }))"
                  placeholder="Unassigned"
                  value-key="value"
                />
              </UFormField>

              <UFormField label="Project">
                <USelectMenu
                  v-model="newTask.projectId"
                  :items="projects.map(p => ({ label: p.name, value: p.id }))"
                  placeholder="No project"
                  value-key="value"
                />
              </UFormField>
            </div>

            <!-- Due Date & Start Date (Row) -->
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Due Date">
                <UInput
                  v-model="newTask.dueDate"
                  type="date"
                />
              </UFormField>

              <UFormField label="Start Date">
                <UInput
                  v-model="newTask.startDate"
                  type="date"
                />
              </UFormField>
            </div>

            <!-- Estimated Hours -->
            <UFormField label="Estimated Hours">
              <UInput
                v-model.number="newTask.estimatedHours"
                type="number"
                placeholder="0"
                :min="0"
                :step="0.5"
              />
            </UFormField>

            <!-- Labels -->
            <UFormField v-if="labels.length > 0" label="Labels">
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="label in labels"
                  :key="label.id"
                  type="button"
                  class="px-2 py-1 text-xs rounded-full border transition-all"
                  :class="newTask.labels.includes(label.id)
                    ? 'border-transparent'
                    : 'border-gray-200 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800'"
                  :style="newTask.labels.includes(label.id)
                    ? { backgroundColor: label.color + '30', color: label.color, borderColor: label.color }
                    : {}"
                  @click="toggleLabel(label.id)"
                >
                  {{ label.name }}
                </button>
              </div>
            </UFormField>
          </form>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showCreateModal = false">
                Cancel
              </UButton>
              <UButton
                :loading="creatingTask"
                @click="createTask"
              >
                Create Task
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

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
