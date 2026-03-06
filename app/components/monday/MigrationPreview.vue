<template>
  <UModal
    :open="open"
    class="max-w-6xl"
    @update:open="$emit('update:open', $event)"
  >
    <template #content>
      <div class="p-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
              Migration Preview
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ preview?.account?.name }} • Review what will be imported
            </p>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            @click="$emit('update:open', false)"
          />
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="py-12 text-center">
          <XfLoader class="mx-auto mb-4" />
          <p class="text-gray-600 dark:text-gray-400">Analyzing your Monday.com data...</p>
          <p class="text-sm text-gray-500 mt-2">
            This may take a minute for large workspaces
          </p>
        </div>

        <!-- Preview Content -->
        <div v-else-if="preview" class="space-y-6">
          <!-- Summary Cards -->
          <div class="grid grid-cols-5 gap-4">
            <UCard class="text-center">
              <div class="text-2xl font-bold text-primary-600">
                {{ preview.summary.totalBoards }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">Boards</div>
            </UCard>
            <UCard class="text-center">
              <div class="text-2xl font-bold text-primary-600">
                {{ preview.summary.totalItems.toLocaleString() }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">Items</div>
            </UCard>
            <UCard class="text-center">
              <div class="text-2xl font-bold text-primary-600">
                {{ preview.summary.totalFiles.toLocaleString() }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">Files</div>
            </UCard>
            <UCard class="text-center">
              <div class="text-2xl font-bold text-primary-600">
                {{ preview.summary.totalComments.toLocaleString() }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">Comments</div>
            </UCard>
            <UCard class="text-center">
              <div class="text-2xl font-bold text-gray-900 dark:text-white">
                ~{{ preview.summary.estimatedTimeMinutes }}m
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">Est. Time</div>
            </UCard>
          </div>

          <!-- Warnings -->
          <UAlert
            v-if="preview.warnings?.length"
            color="warning"
            icon="i-lucide-alert-triangle"
            :title="`${preview.warnings.length} warning${preview.warnings.length > 1 ? 's' : ''}`"
          >
            <ul class="mt-2 text-sm space-y-1">
              <li v-for="(warning, i) in preview.warnings" :key="i">
                • {{ warning }}
              </li>
            </ul>
          </UAlert>

          <!-- Unmapped Columns Alert -->
          <UAlert
            v-if="preview.unmappedColumns?.length"
            color="info"
            icon="i-lucide-info"
            title="Unmapped Column Types"
          >
            <p class="text-sm mt-1">
              These column types will be imported as custom text fields:
              {{ preview.unmappedColumns.join(', ') }}
            </p>
          </UAlert>

          <!-- Board Previews -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-gray-900 dark:text-white">
                Boards to Import
              </h3>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :icon="showAllBoards ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                @click="showAllBoards = !showAllBoards"
              >
                {{ showAllBoards ? 'Show Less' : `Show All (${preview.boards.length})` }}
              </UButton>
            </div>

            <div class="space-y-3 max-h-96 overflow-y-auto">
              <UCard
                v-for="board in displayedBoards"
                :key="board.mondayBoardId"
                class="border-l-4"
                :class="{
                  'border-l-green-500': board.suggestedMapping.departmentId,
                  'border-l-amber-500': !board.suggestedMapping.departmentId,
                }"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <h4 class="font-semibold text-gray-900 dark:text-white">
                        {{ board.name }}
                      </h4>
                      <UBadge size="xs" :color="board.state === 'active' ? 'success' : 'neutral'">
                        {{ board.state }}
                      </UBadge>
                      <UBadge v-if="board.estimatedStats.hasSubitems" size="xs" color="info">
                        Has Subitems
                      </UBadge>
                    </div>
                    
                    <div class="mt-2 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <span>{{ board.itemCount.toLocaleString() }} items</span>
                      <span v-if="board.estimatedStats.completedItems > 0">
                        {{ board.estimatedStats.completedItems }} completed
                      </span>
                      <span>{{ board.columns.length }} columns</span>
                    </div>

                    <!-- Mapping Configuration -->
                    <div class="mt-3 grid grid-cols-2 gap-3">
                      <UFormField label="Map to Department" size="sm">
                        <USelect
                          :model-value="boardMappings[board.mondayBoardId]?.departmentId || board.suggestedMapping.departmentId"
                          :options="departmentOptions"
                          placeholder="Select department"
                          size="sm"
                          @update:model-value="(val) => updateBoardMapping(board.mondayBoardId, 'departmentId', String(val))"
                        />
                      </UFormField>

                      <UFormField label="Map to Project (optional)" size="sm">
                        <USelect
                          :model-value="boardMappings[board.mondayBoardId]?.projectId"
                          :options="projectOptions"
                          placeholder="Select project"
                          size="sm"
                          @update:model-value="(val) => updateBoardMapping(board.mondayBoardId, 'projectId', String(val))"
                        />
                      </UFormField>
                    </div>

                    <!-- Column Preview -->
                    <div v-if="board.columns.length > 0" class="mt-3">
                      <button
                        class="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                        @click="toggleBoardDetails(board.mondayBoardId)"
                      >
                        <UIcon :name="expandedBoards.has(board.mondayBoardId) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" />
                        {{ expandedBoards.has(board.mondayBoardId) ? 'Hide' : 'Show' }} column details & sample items
                      </button>

                      <div v-if="expandedBoards.has(board.mondayBoardId)" class="mt-3 space-y-3">
                        <!-- Columns -->
                        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                          <h5 class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Columns ({{ board.columns.length }})
                          </h5>
                          <div class="flex flex-wrap gap-2">
                            <UBadge
                              v-for="col in board.columns.slice(0, 8)"
                              :key="col.id"
                              size="xs"
                              :color="col.mappedTo ? 'success' : 'neutral'"
                              variant="subtle"
                            >
                              {{ col.title }}
                              <span v-if="col.mappedTo" class="ml-1 opacity-75">
                                → {{ col.mappedTo }}
                              </span>
                            </UBadge>
                            <span v-if="board.columns.length > 8" class="text-xs text-gray-500">
                              +{{ board.columns.length - 8 }} more
                            </span>
                          </div>
                        </div>

                        <!-- Sample Items -->
                        <div v-if="board.sampleItems.length > 0" class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                          <h5 class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Sample Items ({{ board.sampleItems.length }} shown)
                          </h5>
                          <div class="space-y-2">
                            <div
                              v-for="item in board.sampleItems.slice(0, 3)"
                              :key="item.mondayItemId"
                              class="text-sm border-l-2 border-gray-300 dark:border-gray-600 pl-3 py-1"
                            >
                              <div class="font-medium text-gray-900 dark:text-white">
                                {{ item.name }}
                              </div>
                              <div class="text-xs text-gray-500 mt-1">
                                <span
                                  v-for="(value, key) in item.columnValues"
                                  :key="key"
                                  class="inline-block mr-3"
                                >
                                  {{ key }}: {{ formatValue(value) }}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <!-- User Mapping Preview -->
          <UCard v-if="preview.users?.length">
            <template #header>
              <h3 class="font-semibold text-gray-900 dark:text-white">
                User Mappings ({{ preview.users.length }} users)
              </h3>
            </template>
            <div class="max-h-48 overflow-y-auto">
              <UTable
                :data="preview.users"
                :columns="userColumns"
              >
                <template #mappedTo-cell="{ row }">
                  <UBadge v-if="row.original.mappedTo" color="success" size="sm">
                    {{ row.original.mappedTo.name }}
                  </UBadge>
                  <UBadge v-else color="warning" size="sm">
                    Unmapped
                  </UBadge>
                </template>
              </UTable>
            </div>
          </UCard>

          <!-- Actions -->
          <div class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
            <div class="text-sm text-gray-600 dark:text-gray-400">
              <span v-if="unmappedBoardsCount > 0" class="text-amber-600">
                {{ unmappedBoardsCount }} board{{ unmappedBoardsCount > 1 ? 's' : '' }} need{{ unmappedBoardsCount === 1 ? 's' : '' }} department mapping
              </span>
              <span v-else class="text-green-600">
                All boards mapped - ready to import
              </span>
            </div>
            <div class="flex gap-3">
              <UButton
                color="neutral"
                variant="outline"
                @click="$emit('update:open', false)"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                icon="i-lucide-play"
                :disabled="unmappedBoardsCount > 0 || starting"
                :loading="starting"
                @click="startMigration"
              >
                Start Migration
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { MigrationPreview, PreviewConfig } from '../../../server/api/agency/monday/preview.post'

interface BoardMapping {
  departmentId?: string
  projectId?: string
}

interface Props {
  open: boolean
  config: PreviewConfig
  departments: Array<{ label: string; value: string }>
  projects: Array<{ label: string; value: string }>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'start': [mappings: Record<string, BoardMapping>]
}>()

// State
const loading = ref(false)
const preview = ref<MigrationPreview | null>(null)
const boardMappings = ref<Record<string, BoardMapping>>({})
const showAllBoards = ref(false)
const expandedBoards = ref<Set<string>>(new Set())
const starting = ref(false)

// Constants
const userColumns = [
  { accessorKey: 'name', header: 'Monday User' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'mappedTo', header: 'Mapped To' },
]

// Computed
const displayedBoards = computed(() => {
  if (showAllBoards.value) return preview.value?.boards || []
  return (preview.value?.boards || []).slice(0, 3)
})

const unmappedBoardsCount = computed(() => {
  if (!preview.value) return 0
  return preview.value.boards.filter(board => {
    const mapping = boardMappings.value[board.mondayBoardId]
    return !mapping?.departmentId && !board.suggestedMapping.departmentId
  }).length
})

const departmentOptions = computed(() => [
  { label: 'Select Department...', value: '' },
  ...props.departments,
])

const projectOptions = computed(() => [
  { label: 'No Project', value: '' },
  ...props.projects,
])

// Watch for modal open to fetch preview
watch(() => props.open, async (isOpen) => {
  if (isOpen && !preview.value) {
    await fetchPreview()
  }
})

// Methods
async function fetchPreview() {
  loading.value = true
  try {
    // @ts-ignore - $fetch type inference issue
    const response = await $fetch('/api/agency/monday/preview', {
      method: 'POST',
      body: { config: props.config },
    }) as MigrationPreview
    preview.value = response
    
    // Initialize mappings with suggestions
    const mappings: Record<string, BoardMapping> = {}
    for (const board of response.boards) {
      mappings[board.mondayBoardId] = {
        departmentId: board.suggestedMapping.departmentId,
        projectId: board.suggestedMapping.projectId,
      }
    }
    boardMappings.value = mappings
  } catch (error) {
    console.error('Failed to fetch preview:', error)
    // Show error toast
  } finally {
    loading.value = false
  }
}

function updateBoardMapping(boardId: string, field: 'departmentId' | 'projectId', value: string) {
  if (!boardMappings.value[boardId]) {
    boardMappings.value[boardId] = {}
  }
  boardMappings.value[boardId][field] = value || undefined
}

function toggleBoardDetails(boardId: string) {
  if (expandedBoards.value.has(boardId)) {
    expandedBoards.value.delete(boardId)
  } else {
    expandedBoards.value.add(boardId)
  }
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function startMigration() {
  // Merge suggestions with user overrides
  const finalMappings: Record<string, BoardMapping> = {}
  for (const board of preview.value?.boards || []) {
    finalMappings[board.mondayBoardId] = {
      departmentId: boardMappings.value[board.mondayBoardId]?.departmentId || board.suggestedMapping.departmentId,
      projectId: boardMappings.value[board.mondayBoardId]?.projectId || board.suggestedMapping.projectId,
    }
  }
  emit('start', finalMappings)
}

// Reset when closed
watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    preview.value = null
    boardMappings.value = {}
    expandedBoards.value.clear()
    showAllBoards.value = false
  }
})
</script>
