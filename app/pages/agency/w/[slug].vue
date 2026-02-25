<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b px-6 py-4">
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
              <UButton variant="ghost" color="neutral" icon="i-lucide-chevron-down" size="xs" />
            </div>
            <p class="text-sm text-gray-500">
              {{ workspace?.boards?.length || 0 }} boards · {{ workspace?.stats?.tasks || 0 }} tasks
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UButton 
            color="primary" 
            size="sm"
            @click="showInviteModal = true"
          >
            Invite / {{ workspace?.members?.length || 1 }}
          </UButton>
          <UButton color="primary" icon="i-lucide-plus" @click="showNewBoard = true">
            New Board
          </UButton>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-6 mt-4 border-b">
        <button
          class="pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
          :class="activeTab === 'recents' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'"
          @click="activeTab = 'recents'"
        >
          <UIcon name="i-lucide-clock" class="w-4 h-4" />
          Recents
        </button>
        <button
          class="pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
          :class="activeTab === 'content' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'"
          @click="activeTab = 'content'"
        >
          <UIcon name="i-lucide-layout-grid" class="w-4 h-4" />
          Content
        </button>
        <button
          class="pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
          :class="activeTab === 'permissions' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'"
          @click="activeTab = 'permissions'"
        >
          <UIcon name="i-lucide-lock" class="w-4 h-4" />
          Permissions
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-6">
      <!-- Loading -->
      <div v-if="pending" class="flex items-center justify-center h-full">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
      </div>

      <!-- Boards Grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <NuxtLink
          v-for="board in workspace?.boards"
          :key="board.id"
          :to="`/agency/boards/${board.slug}`"
          class="group bg-white rounded-lg border p-5 hover:shadow-md hover:border-primary transition-all"
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

          <h3 class="font-semibold text-gray-900 group-hover:text-primary transition-colors">
            {{ board.name }}
          </h3>
          <p v-if="board.description" class="text-sm text-gray-500 mt-1 line-clamp-2">
            {{ board.description }}
          </p>
        </NuxtLink>

        <!-- Empty State - Workspace Welcome -->
        <div v-if="!workspace?.boards?.length" class="col-span-full">
          <div class="max-w-4xl mx-auto">
            <h2 class="text-lg font-semibold mb-6">Welcome to your new workspace</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <!-- Add new board -->
              <button
                class="group flex flex-col items-center p-8 rounded-xl border-2 border-dashed border-gray-200 hover:border-primary hover:bg-primary/5 transition-all text-center"
                @click="showNewBoard = true"
              >
                <div class="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 group-hover:border-primary flex items-center justify-center mb-4 transition-colors">
                  <UIcon name="i-lucide-plus" class="w-8 h-8 text-gray-400 group-hover:text-primary transition-colors" />
                </div>
                <h3 class="font-medium text-gray-900">Add new board</h3>
                <p class="text-sm text-gray-500 mt-1">Start from scratch</p>
              </button>

              <!-- Start with a template -->
              <button
                class="group flex flex-col items-center p-8 rounded-xl border-2 border-gray-200 hover:border-primary hover:shadow-md transition-all text-center"
                @click="showTemplateSelector = true"
              >
                <div class="w-16 h-16 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                  <UIcon name="i-lucide-layout-template" class="w-8 h-8 text-blue-500" />
                </div>
                <h3 class="font-medium text-gray-900">Start with a template</h3>
                <p class="text-sm text-gray-500 mt-1">Choose from our library</p>
              </button>

              <!-- Start with AI -->
              <button
                class="group flex flex-col items-center p-8 rounded-xl border-2 border-gray-200 hover:border-purple-500 hover:shadow-md transition-all text-center bg-gradient-to-br from-purple-50 to-pink-50"
                @click="startWithAI"
              >
                <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-lg">
                  <UIcon name="i-lucide-sparkles" class="w-8 h-8 text-white" />
                </div>
                <h3 class="font-medium text-gray-900">Start with magic AI</h3>
                <p class="text-sm text-gray-500 mt-1">Let AI build it for you</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- New Board Modal -->
    <UModal v-model:open="showNewBoard" title="Create New Board">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Board Name">
            <UInput v-model="newBoard.name" placeholder="e.g., Q1 Marketing Campaign" class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="newBoard.description" placeholder="What is this board for?" :rows="2" class="w-full" />
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

// Route
const route = useRoute()
const workspaceSlug = computed(() => route.params.slug as string)

// Fetch workspaces
const { data: workspacesData, pending } = await useFetch<{ workspaces: Workspace[] }>('/api/agency/workspaces')

// Get current workspace
const workspace = computed<Workspace | undefined>(() => {
  return workspacesData.value?.workspaces?.find((w: Workspace) => w.slug === workspaceSlug.value)
})

// Active tab
const activeTab = ref<'recents' | 'content' | 'permissions'>('recents')

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
  // TODO: Create board from template
  console.log('Selected template:', template)
  showNewBoard.value = true
}

function startWithAI() {
  // TODO: AI board creation
  console.log('Starting with AI')
}
</script>
