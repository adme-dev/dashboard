<template>
  <div class="p-6 max-w-5xl mx-auto">
    <div class="mb-8">
      <h1 class="text-2xl font-bold">Monday.com Migration</h1>
      <p class="text-gray-500 mt-1">Import workspaces, boards, items, and history</p>
    </div>

    <!-- Connection Info -->
    <UCard v-if="account" class="mb-6">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
          <UIcon name="i-lucide-layout-grid" class="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h3 class="font-semibold">{{ account.name }}</h3>
          <p class="text-sm text-gray-500">{{ account.slug }}</p>
        </div>
      </div>
    </UCard>

    <!-- Workspaces -->
    <UCard v-if="workspaces.length > 0" class="mb-6">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold">Workspaces ({{ workspaces.length }})</h3>
            <p class="text-sm text-gray-500">{{ totalItems.toLocaleString() }} total items</p>
          </div>
          <div class="flex gap-2">
            <UButton size="sm" variant="ghost" @click="selectAll">
              Select All
            </UButton>
            <UButton size="sm" variant="ghost" @click="deselectAll">
              Deselect All
            </UButton>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div
          v-for="workspace in workspaces"
          :key="workspace.id"
          class="border rounded-lg p-4"
          :class="selectedWorkspaces.includes(workspace.id) ? 'border-primary bg-primary-50' : 'border-gray-200'"
        >
          <div class="flex items-start gap-3">
            <UCheckbox
              v-model="selectedWorkspaces"
              :value="workspace.id"
            />
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <h4 class="font-medium">{{ workspace.name }}</h4>
                <UBadge variant="subtle" size="sm">
                  {{ workspace.boards.length }} boards · {{ workspace.totalItems }} items
                </UBadge>
              </div>
              <p v-if="workspace.description" class="text-sm text-gray-500 mt-1">
                {{ workspace.description }}
              </p>
              
              <!-- Boards in workspace -->
              <div class="mt-3 space-y-2">
                <div
                  v-for="board in workspace.boards.slice(0, 5)"
                  :key="board.id"
                  class="flex items-center justify-between text-sm py-1 px-2 bg-white rounded"
                >
                  <span class="text-gray-700">{{ board.name }}</span>
                  <span class="text-gray-400">{{ board.itemsCount }} items</span>
                </div>
                <p v-if="workspace.boards.length > 5" class="text-sm text-gray-400 px-2">
                  +{{ workspace.boards.length - 5 }} more boards
                </p>
              </div>

              <!-- Department Mapping -->
              <div v-if="selectedWorkspaces.includes(workspace.id)" class="mt-3">
                <USelectMenu
                  v-model="workspaceMappings[workspace.id]"
                  :items="departmentOptions"
                  value-key="value"
                  placeholder="Map to department"
                  class="w-64"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <UCard v-else-if="loadingWorkspaces">
      <div class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
        <span class="ml-3 text-gray-500">Loading workspaces...</span>
      </div>
    </UCard>

    <!-- Migration Progress -->
    <UCard v-if="status === 'running'" class="mb-6">
      <div class="space-y-4">
        <div class="flex items-center gap-4">
          <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-primary" />
          <div class="flex-1">
            <h3 class="font-semibold">Migration in Progress...</h3>
            <p class="text-sm text-gray-500">{{ statusMessage }}</p>
          </div>
        </div>
        
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span>Progress</span>
            <span>{{ Math.round(progress) }}%</span>
          </div>
          <UProgress :value="progress" color="primary" />
        </div>

        <div class="grid grid-cols-3 gap-4 text-center">
          <div class="p-3 bg-gray-50 rounded-lg">
            <div class="text-2xl font-bold">{{ stats.workspaces }}</div>
            <div class="text-xs text-gray-500">Workspaces</div>
          </div>
          <div class="p-3 bg-green-50 rounded-lg">
            <div class="text-2xl font-bold text-green-600">{{ stats.imported }}</div>
            <div class="text-xs text-gray-500">Imported</div>
          </div>
          <div class="p-3 bg-red-50 rounded-lg">
            <div class="text-2xl font-bold text-red-600">{{ stats.failed }}</div>
            <div class="text-xs text-gray-500">Failed</div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Results -->
    <UCard v-if="results.length > 0">
      <template #header>
        <h3 class="font-semibold">Migration Results</h3>
      </template>
      
      <div class="space-y-2">
        <div
          v-for="board in results"
          :key="board.name"
          class="flex items-center justify-between py-2 border-b last:border-0"
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="board.itemsFailed > 0 ? 'i-lucide-alert-triangle' : 'i-lucide-check-circle'"
              :class="board.itemsFailed > 0 ? 'text-yellow-500' : 'text-green-500'"
            />
            <span>{{ board.name }}</span>
          </div>
          <div class="text-sm text-gray-500">
            {{ board.itemsImported }} imported
            <span v-if="board.itemsFailed > 0" class="text-red-500">({{ board.itemsFailed }} failed)</span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Actions -->
    <div class="mt-6 flex gap-3">
      <UButton
        v-if="status === 'idle'"
        color="primary"
        icon="i-lucide-play"
        size="lg"
        :disabled="selectedWorkspaces.length === 0"
        :loading="migrating"
        @click="startMigration"
      >
        Migrate {{ selectedWorkspaces.length }} Workspace{{ selectedWorkspaces.length !== 1 ? 's' : '' }}
      </UButton>
      
      <template v-if="status === 'completed'">
        <UButton to="/agency/workflow" color="primary">
          View Workflow Board
        </UButton>
        <UButton to="/agency/tasks" variant="outline">
          View All Tasks
        </UButton>
        <UButton @click="reset" variant="ghost">
          Run Again
        </UButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['role-admin'] })

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

// State
const loadingWorkspaces = ref(true)
const account = ref<{ name: string; slug: string } | null>(null)
const workspaces = ref<any[]>([])
const totalItems = ref(0)
const selectedWorkspaces = ref<string[]>([])
const workspaceMappings = ref<Record<string, string>>({})
const departmentOptions = ref<{ label: string; value: string }[]>([])

const status = ref<'idle' | 'running' | 'completed' | 'error'>('idle')
const statusMessage = ref('Select workspaces to migrate')
const migrating = ref(false)
const progress = ref(0)
const stats = ref({ workspaces: 0, imported: 0, failed: 0 })
const results = ref<any[]>([])

// Load workspaces
onMounted(async () => {
  try {
    // Get departments for mapping
    const depts = await apiFetch<any[]>('/api/agency/departments')
    departmentOptions.value = [
      { label: 'Auto-map', value: '' },
      ...(depts || []).map((d: any) => ({ label: d.name, value: d.id }))
    ]

    // Get account info
    const conn = await apiFetch<any>('/api/agency/monday/connection')
    if (conn.connected) {
      account.value = conn.account
    }

    // Get workspaces
    const wsData = await apiFetch<any>('/api/agency/monday/workspaces')
    workspaces.value = wsData.workspaces || []
    totalItems.value = wsData.totalItems || 0
    
    // Auto-select all workspaces
    selectedWorkspaces.value = workspaces.value.map(w => w.id)
  } catch (error: any) {
    toast.add({
      title: 'Failed to load workspaces',
      description: error.data?.message || 'Unknown error',
      color: 'error'
    })
  } finally {
    loadingWorkspaces.value = false
  }
})

function selectAll() {
  selectedWorkspaces.value = workspaces.value.map(w => w.id)
}

function deselectAll() {
  selectedWorkspaces.value = []
}

async function startMigration() {
  if (selectedWorkspaces.value.length === 0) {
    toast.add({ title: 'Select at least one workspace', color: 'warning' })
    return
  }

  migrating.value = true
  status.value = 'running'
  statusMessage.value = 'Starting migration...'

  try {
    const response = await apiFetch<any>('/api/agency/monday/run-migration', {
      method: 'POST',
      body: {
        workspaceIds: selectedWorkspaces.value,
        workspaceMappings: workspaceMappings.value
      }
    })

    status.value = 'completed'
    statusMessage.value = `Imported ${response.itemsImported} items`
    stats.value = {
      workspaces: response.workspacesProcessed,
      imported: response.itemsImported,
      failed: response.itemsFailed
    }
    results.value = response.boards || []
    progress.value = 100

    toast.add({
      title: 'Migration Complete!',
      description: `Imported ${response.itemsImported} items from ${response.workspacesProcessed} workspaces`,
      color: 'success'
    })
  } catch (error: any) {
    status.value = 'error'
    statusMessage.value = error.data?.message || 'Migration failed'
    
    toast.add({
      title: 'Migration Failed',
      description: error.data?.message || 'Unknown error',
      color: 'error'
    })
  } finally {
    migrating.value = false
  }
}

function reset() {
  status.value = 'idle'
  statusMessage.value = 'Select workspaces to migrate'
  progress.value = 0
  stats.value = { workspaces: 0, imported: 0, failed: 0 }
  results.value = []
}
</script>
