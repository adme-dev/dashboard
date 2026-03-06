<template>
  <div class="h-full flex flex-col bg-gray-50 dark:bg-neutral-950">
    <!-- Header -->
    <div class="bg-white dark:bg-neutral-900 border-b px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">All Workspaces</h1>
          <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">
            {{ workspaces.length }} workspaces · {{ totalTasks }} tasks
          </p>
        </div>
        <UButton color="primary" icon="i-lucide-plus" @click="showNewWorkspace = true">
          New Workspace
        </UButton>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-6">
      <!-- Loading -->
      <div v-if="pending" class="flex items-center justify-center h-full">
        <XfLoader />
      </div>

      <!-- Workspaces Grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <NuxtLink
          v-for="workspace in workspaces"
          :key="workspace.id"
          :to="`/agency/w/${workspace.slug}`"
          class="group bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 p-5 hover:shadow-md hover:border-primary transition-all"
        >
          <div class="flex items-start gap-4">
            <div 
              class="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
              :style="{ backgroundColor: workspace.color + '15' }"
            >
              <UIcon 
                :name="`i-lucide-${workspace.icon || 'briefcase'}`" 
                class="w-6 h-6"
                :style="{ color: workspace.color }"
              />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-gray-900 dark:text-neutral-100 group-hover:text-primary transition-colors">
                {{ workspace.name }}
              </h3>
              <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">
                {{ workspace.stats.boards }} boards · {{ workspace.stats.tasks }} tasks
              </p>
              
              <!-- Preview of boards -->
              <div v-if="workspace.boards?.length" class="mt-3 flex flex-wrap gap-1">
                <span 
                  v-for="board in workspace.boards.slice(0, 3)" 
                  :key="board.id"
                  class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-300"
                >
                  {{ board.name }}
                </span>
                <span v-if="workspace.boards.length > 3" class="text-xs text-gray-400 dark:text-neutral-500">
                  +{{ workspace.boards.length - 3 }} more
                </span>
              </div>
            </div>
          </div>
        </NuxtLink>

        <!-- Empty State -->
        <div v-if="!workspaces.length" class="col-span-full text-center py-12">
          <UIcon name="i-lucide-briefcase" class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-neutral-600" />
          <h3 class="font-medium">No workspaces yet</h3>
          <p class="text-sm text-gray-500 dark:text-neutral-400 mt-1">Create your first workspace to get started.</p>
        </div>
      </div>

      <!-- Recent Boards -->
      <div v-if="recentBoards.length" class="mt-8">
        <h2 class="text-lg font-semibold mb-4">Recently Active Boards</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="board in recentBoards"
            :key="board.id"
            :to="`/agency/boards/${board.slug}`"
            class="group bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 p-4 hover:shadow-md hover:border-primary transition-all"
          >
            <div class="flex items-center gap-3">
              <span 
                class="w-3 h-3 rounded-full" 
                :style="{ backgroundColor: board.color }" 
              />
              <div class="flex-1 min-w-0">
                <h4 class="font-medium text-sm truncate group-hover:text-primary">
                  {{ board.name }}
                </h4>
                <p class="text-xs text-gray-500 dark:text-neutral-400">{{ board.taskCount }} tasks</p>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- New Workspace Modal -->
    <WorkspaceCreateModal 
      v-model="showNewWorkspace" 
      @created="onWorkspaceCreated"
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
  sortOrder: number
  stats: {
    boards: number
    tasks: number
  }
  boards: Board[]
}

// Fetch workspaces
const { data, pending } = await useFetch<{ workspaces: Workspace[] }>('/api/agency/workspaces')
const workspaces = computed(() => data.value?.workspaces || [])

// Calculate totals
const totalTasks = computed(() => {
  return workspaces.value.reduce((sum: number, w: any) => sum + (w.stats?.tasks || 0), 0)
})

// Get recent boards (boards with tasks)
const recentBoards = computed(() => {
  const allBoards = workspaces.value.flatMap((w: any) => 
    (w.boards || []).map((b: any) => ({ ...b, workspaceName: w.name }))
  )
  return allBoards
    .filter((b: any) => b.taskCount > 0)
    .sort((a: any, b: any) => b.taskCount - a.taskCount)
    .slice(0, 6)
})

// New workspace modal
const showNewWorkspace = ref(false)

function onWorkspaceCreated(workspace: any) {
  // Refresh workspaces list
  refreshNuxtData('workspaces')
}
</script>
