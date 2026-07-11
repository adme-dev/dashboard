<template>
  <div class="h-full flex flex-col bg-gray-50 dark:bg-neutral-950">
    <!-- Header -->
    <div class="bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-lg flex items-center justify-center"
            :style="{ backgroundColor: workspace?.color + '20' }"
          >
            <UIcon
              :name="`i-lucide-${workspace?.icon || 'briefcase'}`"
              class="w-5 h-5"
              :style="{ color: workspace?.color }"
            />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-xl font-semibold">{{ workspace?.name }}</h1>
              <UDropdownMenu :items="workspaceDropdownItems">
                <UButton variant="ghost" color="neutral" icon="i-lucide-chevron-down" size="xs" />
              </UDropdownMenu>
            </div>
            <p class="text-sm text-gray-500 dark:text-neutral-400">
              {{ workspace?.boards?.length || 0 }} boards · {{ workspace?.stats?.tasks || 0 }} tasks
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            color="primary"
            variant="subtle"
            size="sm"
            icon="i-lucide-user-plus"
            @click="showInviteModal = true"
          >
            Invite / {{ members?.length || 0 }}
          </UButton>
          <UButton color="primary" icon="i-lucide-plus" @click="showNewBoard = true">
            New Board
          </UButton>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-6 mt-4 border-b border-gray-200 dark:border-neutral-800">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
          :class="activeTab === tab.key ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100'"
          @click="activeTab = tab.key"
        >
          <UIcon :name="tab.icon" class="w-4 h-4" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-6">
      <!-- Loading -->
      <div v-if="pending" class="flex items-center justify-center h-full">
        <XfLoader />
      </div>

      <template v-else>
        <!-- ==================== RECENTS TAB ==================== -->
        <div v-if="activeTab === 'recents'">
          <!-- Quick Stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4">
              <p class="text-sm text-gray-500 dark:text-neutral-400">Total Boards</p>
              <p class="text-2xl font-semibold mt-1">{{ workspace?.boards?.length || 0 }}</p>
            </div>
            <div class="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4">
              <p class="text-sm text-gray-500 dark:text-neutral-400">Total Tasks</p>
              <p class="text-2xl font-semibold mt-1">{{ workspace?.stats?.tasks || 0 }}</p>
            </div>
            <div class="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4">
              <p class="text-sm text-gray-500 dark:text-neutral-400">Team Members</p>
              <p class="text-2xl font-semibold mt-1">{{ members?.length || 0 }}</p>
            </div>
            <div class="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4">
              <p class="text-sm text-gray-500 dark:text-neutral-400">Avg Tasks / Board</p>
              <p class="text-2xl font-semibold mt-1">{{ avgTasksPerBoard }}</p>
            </div>
          </div>

          <!-- Recently Active Boards -->
          <div v-if="recentBoards.length">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400 mb-3">Recently Active</h2>
            <div class="space-y-2">
              <NuxtLink
                v-for="board in recentBoards"
                :key="board.id"
                :to="`/agency/boards/${board.slug}`"
                class="group flex items-center gap-4 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4 hover:border-primary hover:shadow-sm transition-all"
              >
                <span
                  class="w-3 h-3 rounded-full shrink-0"
                  :style="{ backgroundColor: board.color }"
                />
                <div class="flex-1 min-w-0">
                  <h3 class="font-medium text-sm group-hover:text-primary transition-colors truncate">
                    {{ board.name }}
                  </h3>
                  <p v-if="board.description" class="text-xs text-gray-500 dark:text-neutral-400 truncate mt-0.5">
                    {{ board.description }}
                  </p>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <UBadge v-if="board.taskCount > 0" color="primary" variant="subtle" size="sm">
                    {{ board.taskCount }} tasks
                  </UBadge>
                  <UIcon name="i-lucide-chevron-right" class="w-4 h-4 text-gray-400 dark:text-neutral-500 group-hover:text-primary transition-colors" />
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- Empty state for recents -->
          <div v-else class="text-center py-16">
            <UIcon name="i-lucide-clock" class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-neutral-600" />
            <h3 class="font-medium">No boards yet</h3>
            <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">Create your first board to get started.</p>
            <UButton color="primary" icon="i-lucide-plus" class="mt-4" @click="showNewBoard = true">
              New Board
            </UButton>
          </div>
        </div>

        <!-- ==================== CONTENT TAB ==================== -->
        <div v-else-if="activeTab === 'content'">
          <!-- Boards Grid -->
          <div v-if="workspace?.boards?.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink
              v-for="board in workspace.boards"
              :key="board.id"
              :to="`/agency/boards/${board.slug}`"
              class="group bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-5 hover:shadow-md hover:border-primary transition-all"
            >
              <div class="flex items-start justify-between mb-4">
                <div
                  class="w-12 h-12 rounded-lg flex items-center justify-center"
                  :style="{ backgroundColor: board.color + '15' }"
                >
                  <UIcon
                    name="i-lucide-columns-3"
                    class="w-6 h-6"
                    :style="{ color: board.color }"
                  />
                </div>
                <UBadge
                  v-if="board.taskCount > 0"
                  color="primary"
                  variant="subtle"
                >
                  {{ board.taskCount }} tasks
                </UBadge>
              </div>

              <h3 class="font-semibold text-gray-900 dark:text-neutral-100 group-hover:text-primary transition-colors">
                {{ board.name }}
              </h3>
              <p v-if="board.description" class="text-sm text-gray-500 dark:text-neutral-400 mt-1 line-clamp-2">
                {{ board.description }}
              </p>
            </NuxtLink>
          </div>

          <!-- Empty State - Workspace Welcome -->
          <div v-else class="max-w-4xl mx-auto">
            <h2 class="text-lg font-semibold mb-6">Welcome to your new workspace</h2>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <!-- Add new board -->
              <button
                class="group flex flex-col items-center p-8 rounded-xl border-2 border-dashed border-gray-200 dark:border-neutral-700 hover:border-primary hover:bg-primary/5 transition-all text-center"
                @click="showNewBoard = true"
              >
                <div class="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 dark:border-neutral-600 group-hover:border-primary flex items-center justify-center mb-4 transition-colors">
                  <UIcon name="i-lucide-plus" class="w-8 h-8 text-gray-400 dark:text-neutral-500 group-hover:text-primary transition-colors" />
                </div>
                <h3 class="font-medium text-gray-900 dark:text-neutral-100">Add new board</h3>
                <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">Start from scratch</p>
              </button>

              <!-- Start with a template -->
              <button
                class="group flex flex-col items-center p-8 rounded-xl border-2 border-gray-200 dark:border-neutral-800 hover:border-primary hover:shadow-md transition-all text-center"
                @click="showTemplateSelector = true"
              >
                <div class="w-16 h-16 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mb-4">
                  <UIcon name="i-lucide-layout-template" class="w-8 h-8 text-blue-500" />
                </div>
                <h3 class="font-medium text-gray-900 dark:text-neutral-100">Start with a template</h3>
                <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">Choose from our library</p>
              </button>

              <!-- Start with AI -->
              <button
                class="group flex flex-col items-center p-8 rounded-xl border-2 border-gray-200 dark:border-neutral-800 hover:border-purple-500 hover:shadow-md transition-all text-center bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950"
                @click="startWithAI"
              >
                <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-lg">
                  <UIcon name="i-lucide-sparkles" class="w-8 h-8 text-white" />
                </div>
                <h3 class="font-medium text-gray-900 dark:text-neutral-100">Start with magic AI</h3>
                <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">Let AI build it for you</p>
              </button>
            </div>
          </div>
        </div>

        <!-- ==================== PERMISSIONS TAB ==================== -->
        <div v-else-if="activeTab === 'permissions'">
          <div class="max-w-3xl">
            <!-- Workspace privacy -->
            <div class="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-5 mb-6">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                    <UIcon name="i-lucide-globe" class="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 class="font-medium">Open Workspace</h3>
                    <p class="text-sm text-gray-500 dark:text-neutral-400">All team members can see and access this workspace</p>
                  </div>
                </div>
                <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-settings">
                  Change
                </UButton>
              </div>
            </div>

            <!-- Members list -->
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                Members ({{ members?.length || 0 }})
              </h2>
              <UButton variant="subtle" color="primary" size="sm" icon="i-lucide-user-plus" @click="showInviteModal = true">
                Add Member
              </UButton>
            </div>

            <!-- Members loading -->
            <div v-if="membersPending" class="flex items-center justify-center py-12">
              <XfLoader size="sm" />
            </div>

            <div v-else-if="members?.length" class="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800">
              <div
                v-for="member in members"
                :key="member.id"
                class="flex items-center gap-4 p-4"
              >
                <UAvatar
                  :alt="member.name"
                  :src="member.avatarUrl || undefined"
                  size="sm"
                />
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm truncate">{{ member.name }}</p>
                  <p class="text-xs text-gray-500 dark:text-neutral-400 truncate">{{ member.email }}</p>
                </div>
                <UBadge
                  :color="member.role === 'admin' || member.role === 'owner' ? 'warning' : 'neutral'"
                  variant="subtle"
                  size="sm"
                >
                  {{ member.role }}
                </UBadge>
              </div>
            </div>

            <!-- No members -->
            <div v-else class="text-center py-12">
              <UIcon name="i-lucide-users" class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-neutral-600" />
              <h3 class="font-medium">No members found</h3>
              <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">Invite team members to collaborate.</p>
            </div>

            <!-- Board-level access -->
            <div v-if="workspace?.boards?.length" class="mt-8">
              <h2 class="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400 mb-3">
                Board Access
              </h2>
              <div class="space-y-2">
                <div
                  v-for="board in workspace.boards"
                  :key="board.id"
                  class="flex items-center gap-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4"
                >
                  <span
                    class="w-3 h-3 rounded-full shrink-0"
                    :style="{ backgroundColor: board.color }"
                  />
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm truncate">{{ board.name }}</p>
                  </div>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    {{ boardMemberCounts[board.id] ?? '...' }} members
                  </UBadge>
                  <NuxtLink
                    :to="`/agency/boards/${board.slug}`"
                    class="text-xs text-primary hover:underline"
                  >
                    Manage
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- New Board Modal -->
    <UModal v-model:open="showNewBoard" title="Create New Board">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Board Name">
            <UInput v-model="newBoard.name" placeholder="e.g., Q1 Marketing Campaign" class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="newBoard.description" placeholder="What is this board for?" :rows="3" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" color="neutral" @click="showNewBoard = false">Cancel</UButton>
        <UButton color="primary" @click="createBoard">Create Board</UButton>
      </template>
    </UModal>

    <!-- Template Selector -->
    <WorkspaceTemplateSelector
      v-model="showTemplateSelector"
      @select="onTemplateSelect"
    />

    <!-- Invite Modal -->
    <WorkspaceInviteModal
      v-model="showInviteModal"
      :workspace-id="workspace?.id || ''"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// Page meta
definePageMeta({})

// Types
interface Board {
  id: string
  name: string
  slug: string
  color: string
  description?: string
  taskCount: number
}

interface Workspace {
  id: string
  name: string
  slug: string
  color: string
  icon?: string
  description?: string
  stats: {
    boards: number
    tasks: number
  }
  boards: Board[]
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
  isActive: boolean
  initials: string
}

// Tabs config
const tabs = [
  { key: 'recents' as const, label: 'Recents', icon: 'i-lucide-clock' },
  { key: 'content' as const, label: 'Content', icon: 'i-lucide-layout-grid' },
  { key: 'permissions' as const, label: 'Permissions', icon: 'i-lucide-lock' },
]

// Route
const route = useRoute()
const workspaceSlug = computed(() => route.params.slug as string)
const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>

// Fetch workspaces
const workspacesData = ref<{ workspaces: Workspace[] }>({ workspaces: [] })
const pending = ref(false)

async function refreshWorkspaces() {
  pending.value = true
  try {
    workspacesData.value = await apiFetch<{ workspaces: Workspace[] }>('/api/agency/workspaces')
  } catch {
    workspacesData.value = { workspaces: [] }
  } finally {
    pending.value = false
  }
}

// Get current workspace
const workspace = computed<Workspace | undefined>(() => {
  return workspacesData.value?.workspaces?.find((w: Workspace) => w.slug === workspaceSlug.value)
})

// Fetch team members
const membersData = ref<{ members: TeamMember[] }>({ members: [] })
const membersPending = ref(false)

async function refreshMembers() {
  membersPending.value = true
  try {
    membersData.value = await apiFetch<{ members: TeamMember[] }>('/api/agency/team-members')
  } catch {
    membersData.value = { members: [] }
  } finally {
    membersPending.value = false
  }
}

await Promise.all([refreshWorkspaces(), refreshMembers()])
const members = computed(() => membersData.value?.members || [])

// Workspace dropdown
const router = useRouter()
const otherWorkspaces = computed(() => {
  return (workspacesData.value?.workspaces || []).filter((w: Workspace) => w.slug !== workspaceSlug.value)
})

const workspaceDropdownItems = computed(() => {
  const items: any[][] = []

  // Switch workspace section
  if (otherWorkspaces.value.length) {
    items.push(otherWorkspaces.value.map((w: Workspace) => ({
      label: w.name,
      icon: `i-lucide-${w.icon || 'briefcase'}`,
      onSelect() { router.push(`/agency/w/${w.slug}`) },
    })))
  }

  // Actions section
  items.push([
    {
      label: 'All Workspaces',
      icon: 'i-lucide-layout-grid',
      onSelect() { router.push('/agency/boards') },
    },
    {
      label: 'New Workspace',
      icon: 'i-lucide-plus',
      onSelect() { router.push('/agency/boards') },
    },
  ])

  return items
})

// Active tab
const activeTab = ref<'recents' | 'content' | 'permissions'>('recents')

// Computed: recent boards sorted by task count
const recentBoards = computed(() => {
  if (!workspace.value?.boards?.length) return []
  return [...workspace.value.boards]
    .sort((a, b) => b.taskCount - a.taskCount)
})

// Computed: avg tasks per board
const avgTasksPerBoard = computed(() => {
  const boards = workspace.value?.boards?.length || 0
  const tasks = workspace.value?.stats?.tasks || 0
  if (!boards) return 0
  return Math.round(tasks / boards)
})

// Board member counts — fetch per-board on permissions tab
const boardMemberCounts = ref<Record<string, number>>({})

watch(activeTab, async (tab) => {
  if (tab === 'permissions' && workspace.value?.boards?.length) {
    for (const board of workspace.value.boards) {
      if (boardMemberCounts.value[board.id] !== undefined) continue
      try {
        const data = await apiFetch<any[]>(`/api/agency/departments/${board.id}/members`)
        boardMemberCounts.value[board.id] = data?.length || 0
      } catch {
        boardMemberCounts.value[board.id] = 0
      }
    }
  }
})

// New board modal
const showNewBoard = ref(false)
const newBoard = ref({ name: '', description: '' })

// Template selector
const showTemplateSelector = ref(false)

// Invite modal
const showInviteModal = ref(false)

function createBoard() {
  showNewBoard.value = false
  newBoard.value = { name: '', description: '' }
}

function onTemplateSelect(template: any) {
  showNewBoard.value = true
}

function startWithAI() {
  // TODO: AI board creation
}
</script>
