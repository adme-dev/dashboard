<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-2">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          to="/agency/monday"
        >
          Back
        </UButton>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Migration Details
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            {{ migration?.mondayAccount?.name }} • Started {{ migration ? formatDate(migration.startedAt) : '' }}
          </p>
        </div>
        <UBadge
          size="lg"
          :color="getStatusColor(migration?.status || 'unknown')"
        >
          {{ migration?.status }}
        </UBadge>
      </div>
    </div>

    <!-- Progress Overview -->
    <div class="grid grid-cols-4 gap-4 mb-6">
      <UCard>
        <div class="text-center">
          <div class="text-3xl font-bold text-gray-900 dark:text-white">
            {{ migration?.stats?.boardsMigrated }}/{{ migration?.stats?.boardsTotal }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Boards Migrated</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <div class="text-3xl font-bold text-primary-600">
            {{ migration?.stats?.itemsMigrated }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Items Migrated</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <div class="text-3xl font-bold text-red-600">
            {{ migration?.stats?.itemsFailed }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Items Failed</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <div class="text-3xl font-bold text-gray-900 dark:text-white">
            {{ migration?.stats?.itemsTotal }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Items</div>
        </div>
      </UCard>
    </div>

    <!-- Board Mappings -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-gray-900 dark:text-white">
            Board Mappings
          </h3>
          <UButton
            v-if="hasUnsavedChanges"
            color="primary"
            :loading="saving"
            @click="saveMappings"
          >
            Save Changes
          </UButton>
        </div>
      </template>

      <div v-if="loading" class="py-8 text-center">
        <XfLoader size="sm" class="mx-auto mb-2" />
        <p class="text-gray-600 dark:text-gray-400">Loading board mappings...</p>
      </div>

      <div v-else-if="boards.length === 0" class="py-8 text-center text-gray-500">
        No boards found in this migration.
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="board in boards"
          :key="board.id"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
          :class="{
            'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800': board.status === 'completed',
            'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800': board.status === 'failed',
            'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800': board.status === 'migrating',
          }"
        >
          <div class="flex items-start justify-between mb-4">
            <div>
              <div class="flex items-center gap-2">
                <h4 class="font-semibold text-gray-900 dark:text-white">
                  {{ board.mondayBoardName }}
                </h4>
                <UBadge size="xs" :color="getStatusColor(board.status)">
                  {{ board.status }}
                </UBadge>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ board.mondayBoardType }} • {{ board.stats.itemsMigrated }} of {{ board.stats.itemsTotal }} items
              </p>
            </div>
            <div v-if="board.error" class="text-sm text-red-600">
              {{ board.error }}
            </div>
          </div>

          <!-- Mapping Configuration -->
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Map to Department">
              <USelect
                :model-value="boardMappings[board.id]?.departmentId"
                :options="departmentOptions"
                placeholder="Select department"
                @update:model-value="(val) => updateBoardMapping(board.id, 'departmentId', String(val || ''))"
              />
            </UFormField>

            <UFormField label="Map to Project (optional)">
              <USelect
                :model-value="boardMappings[board.id]?.projectId"
                :options="projectOptions"
                placeholder="Select project"
                @update:model-value="(val) => updateBoardMapping(board.id, 'projectId', String(val || ''))"
              />
            </UFormField>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Error Details -->
    <UCard v-if="migration?.error" class="mt-6 border-red-200 dark:border-red-800">
      <template #header>
        <h3 class="font-semibold text-red-600">
          Error Details
        </h3>
      </template>
      <div class="text-red-600 whitespace-pre-wrap">
        {{ migration.error.message }}
      </div>
      <pre v-if="migration.error.details" class="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded text-sm overflow-auto">
        {{ JSON.stringify(migration.error.details, null, 2) }}
      </pre>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// Types
interface BoardMapping {
  id: string
  mondayBoardId: string
  mondayBoardName: string
  mondayBoardType: string
  departmentId?: string
  departmentName?: string
  projectId?: string
  projectName?: string
  status: string
  stats: {
    itemsTotal: number
    itemsMigrated: number
    itemsFailed: number
  }
  error?: string
}

interface MigrationDetail {
  id: string
  status: string
  startedAt: string
  completedAt?: string
  startedBy: string
  mondayAccount: {
    id: string
    name: string
  }
  config: any
  stats: {
    boardsTotal: number
    boardsMigrated: number
    itemsTotal: number
    itemsMigrated: number
    itemsFailed: number
  }
  error?: {
    message: string
    details: any
  }
  boards: BoardMapping[]
}

interface SelectOption {
  label: string
  value: string
}

// Route
const route = useRoute()
const migrationId = route.params.id as string

// State
const loading = ref(false)
const saving = ref(false)
const migration = ref<MigrationDetail | null>(null)
const departments = ref<SelectOption[]>([])
const projects = ref<SelectOption[]>([])
const boardMappings = ref<Record<string, { departmentId?: string; projectId?: string }>>({})
const originalMappings = ref<Record<string, { departmentId?: string; projectId?: string }>>({})

// Computed
const boards = computed(() => migration.value?.boards || [])

const departmentOptions = computed(() => [
  { label: 'No Department', value: '' },
  ...departments.value,
])

const projectOptions = computed(() => [
  { label: 'No Project', value: '' },
  ...projects.value,
])

const hasUnsavedChanges = computed(() => {
  return JSON.stringify(boardMappings.value) !== JSON.stringify(originalMappings.value)
})

// Methods
async function fetchMigration() {
  loading.value = true
  try {
    const response = await $fetch<MigrationDetail>(`/api/agency/monday/migrations/${migrationId}`)
    migration.value = response
    
    // Initialize board mappings
    const mappings: Record<string, { departmentId?: string; projectId?: string }> = {}
    for (const board of response.boards) {
      mappings[board.id] = {
        departmentId: board.departmentId,
        projectId: board.projectId,
      }
    }
    boardMappings.value = { ...mappings }
    originalMappings.value = { ...mappings }
  } finally {
    loading.value = false
  }
}

async function fetchDepartments() {
  try {
    const response = await $fetch<{ departments: Array<{ id: string; name: string }> }>('/api/agency/departments')
    departments.value = response.departments.map(d => ({
      label: d.name,
      value: d.id,
    }))
  } catch (error) {
    console.error('Failed to fetch departments:', error)
  }
}

async function fetchProjects() {
  try {
    const response = await $fetch<{ projects: Array<{ id: string; name: string }> }>('/api/agency/projects')
    projects.value = response.projects.map(p => ({
      label: p.name,
      value: p.id,
    }))
  } catch (error) {
    console.error('Failed to fetch projects:', error)
  }
}

function updateBoardMapping(boardId: string, field: 'departmentId' | 'projectId', value: string) {
  if (!boardMappings.value[boardId]) {
    boardMappings.value[boardId] = {}
  }
  boardMappings.value[boardId][field] = value || undefined
}

async function saveMappings() {
  saving.value = true
  try {
    const updates = Object.entries(boardMappings.value).map(([boardMappingId, mapping]) => ({
      boardMappingId,
      departmentId: mapping.departmentId,
      projectId: mapping.projectId,
    }))

    await $fetch(`/api/agency/monday/migrations/${migrationId}/boards`, {
      method: 'PUT',
      body: { boards: updates },
    })

    // Update original mappings
    originalMappings.value = { ...boardMappings.value }
    
    // Show success toast
  } catch (error) {
    console.error('Failed to save mappings:', error)
    // Show error toast
  } finally {
    saving.value = false
  }
}

function getStatusColor(status: string): 'primary' | 'success' | 'error' | 'warning' | 'neutral' {
  const colors: Record<string, 'primary' | 'success' | 'error' | 'warning' | 'neutral'> = {
    pending: 'neutral',
    migrating: 'primary',
    completed: 'success',
    failed: 'error',
    skipped: 'warning',
    running: 'primary',
    paused: 'warning',
    unknown: 'neutral',
  }
  return colors[status] || 'neutral'
}

function formatDate(date: string) {
  return new Date(date).toLocaleString()
}

// Lifecycle
onMounted(() => {
  fetchMigration()
  fetchDepartments()
  fetchProjects()
})
</script>
