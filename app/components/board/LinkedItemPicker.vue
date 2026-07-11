<template>
  <div :class="headless ? 'w-full' : 'bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 w-80'">
    <!-- Header (hidden in headless mode) -->
    <div v-if="!headless" class="p-3 border-b border-gray-200 dark:border-neutral-700 flex items-center justify-between">
      <h4 class="text-sm font-medium text-gray-900 dark:text-neutral-100">Linked Items</h4>
      <button @click="$emit('close')" class="text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300">
        <UIcon name="i-lucide-x" class="w-4 h-4" />
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="px-3 py-6 text-center">
      <span class="text-sm text-gray-400 dark:text-neutral-500">Loading...</span>
    </div>

    <!-- Current links list -->
    <template v-else>
      <div v-if="links.length" class="max-h-48 overflow-y-auto py-1">
        <div
          v-for="link in links"
          :key="link.id"
          class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-neutral-800 group"
        >
          <UIcon name="i-lucide-link-2" class="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <NuxtLink
            :to="`/agency/boards/${link.task.boardSlug}?task=${link.task.id}`"
            class="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate flex-1"
            @click.stop
          >
            {{ link.task.title }}
          </NuxtLink>
          <UBadge size="xs" variant="subtle" color="neutral" class="shrink-0">{{ link.task.boardName }}</UBadge>
          <button
            @click="unlinkItem(link.id)"
            class="text-gray-400 dark:text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p v-else class="px-3 py-4 text-sm text-gray-400 dark:text-neutral-500 text-center">No linked items</p>
    </template>

    <!-- Mode toggle: Search existing / Create new -->
    <div class="flex border-t border-gray-200 dark:border-neutral-700">
      <button
        class="flex-1 py-2 text-xs font-medium text-center transition-colors"
        :class="mode === 'search' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800'"
        @click="mode = 'search'"
      >
        <UIcon name="i-lucide-search" class="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
        Link existing
      </button>
      <button
        class="flex-1 py-2 text-xs font-medium text-center transition-colors border-l border-gray-200 dark:border-neutral-700"
        :class="mode === 'create' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800'"
        @click="switchToCreate"
      >
        <UIcon name="i-lucide-plus" class="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
        Create &amp; link
      </button>
    </div>

    <!-- Search mode -->
    <template v-if="mode === 'search'">
      <div class="p-2">
        <UInput
          v-model="searchQuery"
          placeholder="Search tasks to link..."
          icon="i-lucide-search"
          size="sm"
          autofocus
        />
      </div>

      <!-- Search results -->
      <div v-if="searchResults.length" class="max-h-48 overflow-y-auto border-t border-gray-200 dark:border-neutral-700 py-1">
        <button
          v-for="task in searchResults"
          :key="task.id"
          class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-neutral-800 w-full text-left"
          @click="linkItem(task.id)"
        >
          <UIcon name="i-lucide-plus" class="w-3.5 h-3.5 text-green-500 shrink-0" />
          <span class="text-sm text-gray-700 dark:text-neutral-300 truncate flex-1">{{ task.title }}</span>
          <UBadge size="xs" variant="subtle" color="neutral" class="shrink-0">{{ task.boardName }}</UBadge>
        </button>
      </div>
      <div v-else-if="searchQuery.length >= 2 && !searching" class="px-3 py-3 border-t border-gray-200 dark:border-neutral-700 text-center">
        <span class="text-xs text-gray-400 dark:text-neutral-500">No tasks found</span>
      </div>
    </template>

    <!-- Create mode -->
    <template v-if="mode === 'create'">
      <div class="p-3 space-y-3">
        <UFormField label="Task title" required>
          <UInput
            v-model="newTask.title"
            placeholder="Enter task title..."
            size="sm"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField label="Board" required>
          <USelectMenu
            v-model="newTask.departmentId"
            :items="boardOptions"
            value-key="value"
            placeholder="Select board..."
            size="sm"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Assignee">
          <USelectMenu
            v-model="newTask.assigneeId"
            :items="memberOptions"
            value-key="value"
            placeholder="Unassigned"
            size="sm"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Priority">
          <USelectMenu
            v-model="newTask.priority"
            :items="priorityOptions"
            value-key="value"
            size="sm"
            class="w-full"
          />
        </UFormField>

        <UButton
          block
          size="sm"
          icon="i-lucide-plus"
          :loading="creating"
          :disabled="!newTask.title.trim() || !newTask.departmentId"
          @click="createAndLink"
        >
          Create &amp; Link Task
        </UButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  taskId: string
  headless?: boolean
  initialMode?: 'search' | 'create'
}>()

const emit = defineEmits<{
  close: []
  updated: [count: number]
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: {
  method?: string
  body?: unknown
  params?: Record<string, unknown>
}) => Promise<T>

interface LinkedTask {
  id: string
  title: string
  boardSlug: string
  boardName: string
}

interface LinkedItem {
  id: string
  linkType: string
  task: LinkedTask
}

interface SearchResult {
  id: string
  title: string
  boardName: string
}

const links = ref<LinkedItem[]>([])
const loading = ref(true)
const mode = ref<'search' | 'create'>(props.initialMode || 'search')

// --- Search mode state ---
const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searching = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

// --- Create mode state ---
const newTask = reactive({
  title: '',
  departmentId: '',
  assigneeId: '_none',
  priority: 'medium',
})
const creating = ref(false)
const boards = ref<{ id: string; name: string }[]>([])
const members = ref<{ id: string; name: string }[]>([])
const sourceProjectId = ref<string | null>(null)
const createDataLoaded = ref(false)

const boardOptions = computed(() =>
  boards.value.map(b => ({ label: b.name, value: b.id }))
)

const memberOptions = computed(() => [
  { label: 'Unassigned', value: '_none' },
  ...members.value.map(m => ({ label: m.name, value: m.id })),
])

const priorityOptions = [
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

// --- Fetch linked items ---
async function fetchLinks() {
  try {
    const data = await apiFetch<{ linkedItems: LinkedItem[] }>(`/api/agency/tasks/${props.taskId}/linked-items`)
    links.value = data.linkedItems || []
  } catch (e: any) {
    toast.add({ title: 'Error', description: 'Failed to load linked items', color: 'error' })
  } finally {
    loading.value = false
  }
}

// --- Search mode ---
async function searchTasks(q: string) {
  if (q.length < 2) {
    searchResults.value = []
    return
  }
  searching.value = true
  try {
    const data = await apiFetch<{ tasks: SearchResult[] }>(`/api/agency/tasks/search`, {
      params: { q, excludeTaskId: props.taskId },
    })
    const linkedIds = new Set(links.value.map(l => l.task.id))
    searchResults.value = (data.tasks || []).filter(t => !linkedIds.has(t.id))
  } catch {
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

async function linkItem(linkedTaskId: string) {
  try {
    await apiFetch(`/api/agency/tasks/${props.taskId}/linked-items`, {
      method: 'POST',
      body: { linkedTaskId },
    })
    searchQuery.value = ''
    searchResults.value = []
    await fetchLinks()
    emit('updated', links.value.length)
  } catch (e: any) {
    if (e.statusCode === 409 || e.data?.statusCode === 409) {
      searchResults.value = searchResults.value.filter(t => t.id !== linkedTaskId)
      await fetchLinks()
      emit('updated', links.value.length)
    } else {
      toast.add({ title: 'Error', description: e.data?.statusMessage || 'Failed to link item', color: 'error' })
    }
  }
}

async function unlinkItem(linkId: string) {
  try {
    await apiFetch(`/api/agency/tasks/${props.taskId}/linked-items/${linkId}`, {
      method: 'DELETE',
    })
    await fetchLinks()
    emit('updated', links.value.length)
  } catch (e: any) {
    toast.add({ title: 'Error', description: 'Failed to unlink item', color: 'error' })
  }
}

// --- Create mode ---
async function switchToCreate() {
  mode.value = 'create'
  if (!createDataLoaded.value) {
    await loadCreateData()
  }
}

async function loadCreateData() {
  try {
    const [boardsData, membersData, taskData] = await Promise.all([
      apiFetch<any>('/api/agency/boards'),
      apiFetch<any>('/api/agency/team-members'),
      apiFetch<any>(`/api/agency/tasks/${props.taskId}`),
    ])
    const boardsList = Array.isArray(boardsData) ? boardsData : (boardsData?.boards ?? [])
    boards.value = boardsList.map((b: any) => ({ id: b.id, name: b.name }))
    const membersList = Array.isArray(membersData) ? membersData : (membersData?.members ?? [])
    members.value = membersList
      .filter((m: any) => m.isActive !== false)
      .map((m: any) => ({ id: m.id, name: m.name }))
    sourceProjectId.value = taskData?.projectId || taskData?.project_id || null
    createDataLoaded.value = true
  } catch (err) {
    console.error('Failed to load create form data:', err)
    toast.add({ title: 'Error', description: 'Failed to load boards/members', color: 'error' })
  }
}

async function createAndLink() {
  if (!newTask.title.trim() || !newTask.departmentId) return
  creating.value = true
  try {
    // Create the task on the selected board, inheriting the source task's project
    const created = await apiFetch<{ id: string }>('/api/agency/tasks', {
      method: 'POST',
      body: {
        departmentId: newTask.departmentId,
        title: newTask.title.trim(),
        priority: newTask.priority,
        assigneeId: newTask.assigneeId && newTask.assigneeId !== '_none' ? newTask.assigneeId : undefined,
        projectId: sourceProjectId.value || undefined,
      },
    })

    // Link the new task to the source task
    await apiFetch(`/api/agency/tasks/${props.taskId}/linked-items`, {
      method: 'POST',
      body: { linkedTaskId: created.id },
    })

    // Reset form
    newTask.title = ''
    newTask.assigneeId = '_none'
    newTask.priority = 'medium'
    mode.value = 'search'

    // Refresh links
    await fetchLinks()
    emit('updated', links.value.length)
    toast.add({ title: 'Task created & linked', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to create task', description: err.data?.statusMessage || 'Unknown error', color: 'error' })
  } finally {
    creating.value = false
  }
}

// --- Watchers ---
watch(searchQuery, (val) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => searchTasks(val), 300)
})

watch(() => props.taskId, () => {
  links.value = []
  searchQuery.value = ''
  searchResults.value = []
  loading.value = true
  mode.value = 'search'
  createDataLoaded.value = false
  fetchLinks()
})

onMounted(() => {
  fetchLinks()
  if (props.initialMode === 'create') {
    loadCreateData()
  }
})
</script>
