<template>
  <div>
      <div class="space-y-6">
        <!-- Monday.com Connection -->
        <UCard>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div
                class="size-12 rounded-xl flex items-center justify-center"
                :class="connectionStatus === 'connected' ? 'bg-success/10' : 'bg-elevated'"
              >
                <UIcon
                  name="i-lucide-layout-grid"
                  class="size-6"
                  :class="connectionStatus === 'connected' ? 'text-success' : 'text-muted'"
                />
              </div>
              <div>
                <h3 class="font-semibold text-lg text-highlighted">Monday.com</h3>
                <p class="text-sm text-muted">
                  <template v-if="connectionStatus === 'connected'">
                    Connected to <span class="font-medium text-highlighted">{{ accountInfo?.name }}</span>
                  </template>
                  <template v-else-if="connectionStatus === 'error'">
                    <span class="text-error">Connection failed</span>
                  </template>
                  <template v-else>
                    Not connected. Enter your API token to get started.
                  </template>
                </p>
              </div>
            </div>
            <UBadge
              :color="connectionStatus === 'connected' ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ connectionStatus === 'connected' ? 'Connected' : 'Disconnected' }}
            </UBadge>
          </div>

          <!-- Token Input -->
          <div v-if="connectionStatus !== 'connected'" class="mt-6 pt-6 border-t border-default">
            <UFormField label="Monday.com API Token" description="Find this in Monday.com > Admin > API">
              <div class="flex gap-2">
                <UInput
                  v-model="apiToken"
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiJ9..."
                  class="flex-1 font-mono"
                />
                <UButton
                  color="primary"
                  :loading="testingConnection"
                  @click="testAndConnect"
                >
                  Connect
                </UButton>
              </div>
            </UFormField>
          </div>

          <!-- Connected Actions -->
          <div v-else class="mt-6 pt-6 border-t border-default space-y-4">
            <div class="flex gap-3">
              <UButton
                color="primary"
                icon="i-lucide-download"
                :loading="importing"
                @click="runImportAll"
              >
                Import All from Monday
              </UButton>
              <UButton
                variant="outline"
                color="neutral"
                icon="i-lucide-refresh-cw"
                :loading="syncing"
                @click="runFullSync"
              >
                Sync Selected
              </UButton>
              <UButton
                color="error"
                variant="ghost"
                @click="disconnect"
              >
                Disconnect
              </UButton>
            </div>

            <!-- Import Progress -->
            <div v-if="importResult" class="rounded-lg border border-default p-4 space-y-3">
              <div class="flex items-center gap-2">
                <UIcon
                  :name="importResult.success ? 'i-lucide-check-circle' : 'i-lucide-alert-circle'"
                  class="size-5"
                  :class="importResult.success ? 'text-success' : 'text-warning'"
                />
                <span class="font-medium text-highlighted">
                  {{ importResult.success ? 'Import Complete' : 'Import Completed with Issues' }}
                </span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="text-center p-2 rounded-md bg-elevated">
                  <p class="text-2xl font-bold text-highlighted">{{ importResult.departmentsCreated }}</p>
                  <p class="text-xs text-muted">Departments Created</p>
                </div>
                <div class="text-center p-2 rounded-md bg-elevated">
                  <p class="text-2xl font-bold text-highlighted">{{ importResult.boardsMigrated }}</p>
                  <p class="text-xs text-muted">Boards Migrated</p>
                </div>
                <div class="text-center p-2 rounded-md bg-elevated">
                  <p class="text-2xl font-bold text-highlighted">{{ importResult.itemsMigrated }}</p>
                  <p class="text-xs text-muted">Items Imported</p>
                </div>
                <div class="text-center p-2 rounded-md bg-elevated">
                  <p class="text-2xl font-bold text-error">{{ importResult.itemsFailed }}</p>
                  <p class="text-xs text-muted">Items Failed</p>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Connected Boards -->
        <UCard v-if="connectionStatus === 'connected'">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold text-highlighted">Connected Boards</h3>
                <p class="text-sm text-muted">Select which Monday.com boards to sync</p>
              </div>
              <UButton
                icon="i-lucide-refresh-cw"
                variant="ghost"
                color="neutral"
                size="sm"
                :loading="fetchingBoards"
                @click="fetchMondayBoards"
              >
                Refresh
              </UButton>
            </div>
          </template>

          <div v-if="fetchingBoards" class="flex justify-center py-8">
            <XfLoader size="sm" />
          </div>

          <div v-else-if="mondayBoards.length === 0" class="py-8">
            <UEmpty
              icon="i-lucide-layout-grid"
              title="No boards found"
              description="No boards were found in your Monday.com account"
              :actions="[{ label: 'Refresh', icon: 'i-lucide-refresh-cw', color: 'primary', onClick: () => fetchMondayBoards() }]"
            />
          </div>

          <div v-else class="divide-y divide-default">
            <div
              v-for="board in paginatedBoards"
              :key="board.id"
              class="py-4 flex items-center gap-3"
            >
              <UCheckbox
                :model-value="isBoardConnected(board.id)"
                @update:model-value="toggleBoardConnection(board.id)"
              />
              <div class="flex-1 min-w-0">
                <p class="font-medium text-highlighted">{{ board.name }}</p>
                <p class="text-sm text-muted">
                  {{ board.itemCount || 0 }} items
                </p>
              </div>
              <div v-if="isBoardConnected(board.id)" class="flex items-center gap-2">
                <USelect
                  :model-value="boardMappings[board.id]?.departmentId || ''"
                  :items="departmentOptions"
                  placeholder="Map to department"
                  class="w-48"
                  size="sm"
                  @update:model-value="setBoardDepartment(board.id, $event)"
                />
                <UBadge
                  :color="boardMappings[board.id]?.lastSyncAt ? 'success' : boardMappings[board.id]?.departmentId ? 'warning' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ boardMappings[board.id]?.lastSyncAt ? 'Synced' : boardMappings[board.id]?.departmentId ? 'Ready' : 'No mapping' }}
                </UBadge>
              </div>
            </div>
          </div>
          <div v-if="mondayBoards.length > boardsPerPage" class="pt-4 flex items-center justify-between border-t border-default">
            <span class="text-sm text-muted">
              Showing {{ Math.min(boardsPage * boardsPerPage, mondayBoards.length) }} of {{ mondayBoards.length }} boards
            </span>
            <UPagination
              v-model="boardsPage"
              :total="mondayBoards.length"
              :items-per-page="boardsPerPage"
            />
          </div>
        </UCard>

        <!-- Sync Settings -->
        <UCard v-if="connectionStatus === 'connected'">
          <template #header>
            <h3 class="font-semibold text-highlighted">Sync Settings</h3>
          </template>

          <div class="space-y-6">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField label="Auto-sync frequency">
                <USelect
                  v-model="syncSettings.frequency"
                  :items="frequencyOptions"
                />
              </UFormField>

              <UFormField label="Sync direction">
                <USelect
                  v-model="syncSettings.direction"
                  :items="directionOptions"
                />
              </UFormField>
            </div>

            <div class="space-y-3">
              <p class="text-sm font-medium text-highlighted">Sync options</p>
              <div class="space-y-2">
                <label class="flex items-center gap-2 cursor-pointer">
                  <UCheckbox v-model="syncSettings.syncComments" />
                  <span class="text-sm">Sync comments and updates</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <UCheckbox v-model="syncSettings.syncFiles" />
                  <span class="text-sm">Sync file attachments</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <UCheckbox v-model="syncSettings.syncSubitems" />
                  <span class="text-sm">Sync subitems as subtasks</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <UCheckbox v-model="syncSettings.deleteArchived" />
                  <span class="text-sm">Delete archived items locally</span>
                </label>
              </div>
            </div>

            <div class="flex justify-end">
              <UButton
                color="primary"
                :loading="savingSettings"
                @click="saveSyncSettings"
              >
                Save settings
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Sync Logs -->
        <UCard v-if="syncLogs.length > 0">
          <template #header>
            <h3 class="font-semibold text-highlighted">Recent Sync Activity</h3>
          </template>

          <div class="divide-y divide-default">
            <div
              v-for="log in syncLogs.slice(0, 10)"
              :key="log.id"
              class="flex items-center justify-between py-3"
            >
              <div class="flex items-center gap-3">
                <UIcon
                  :name="logIcon(log.status)"
                  class="size-5"
                  :class="logColor(log.status)"
                />
                <div>
                  <p class="text-sm font-medium text-highlighted">{{ log.operation }}</p>
                  <p class="text-xs text-muted">{{ formatTime(log.createdAt) }}</p>
                </div>
              </div>
              <div v-if="log.details" class="text-sm text-muted">
                {{ log.details.itemsSynced }} items · {{ log.details.boardsSynced }} boards
              </div>
            </div>
          </div>
        </UCard>
      </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['role-admin'] })

const toast = useToast()

const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
const apiToken = ref('')
const testingConnection = ref(false)
const syncing = ref(false)
const importing = ref(false)
const fetchingBoards = ref(false)
const savingSettings = ref(false)
const importResult = ref<{
  success: boolean
  departmentsCreated: number
  boardsMigrated: number
  itemsMigrated: number
  itemsFailed: number
} | null>(null)
const accountInfo = ref<{ id: string; name: string } | null>(null)

const mondayBoards = ref<Array<{
  id: string
  name: string
  itemCount?: number
}>>([])

const connectedBoards = ref<string[]>([])
const boardMappings = ref<Record<string, { departmentId?: string; lastSyncAt?: string }>>({})
const boardsPage = ref(1)
const boardsPerPage = 20

const paginatedBoards = computed(() => {
  const start = (boardsPage.value - 1) * boardsPerPage
  return mondayBoards.value.slice(start, start + boardsPerPage)
})

const syncLogs = ref<Array<{
  id: string
  operation: string
  status: 'success' | 'error' | 'pending'
  createdAt: string
  details?: { itemsSynced: number; boardsSynced: number }
}>>([])

const syncSettings = ref({
  frequency: 'hourly',
  direction: 'oneway',
  syncComments: true,
  syncFiles: true,
  syncSubitems: true,
  deleteArchived: false,
})

const frequencyOptions = [
  { label: 'Real-time (webhooks)', value: 'realtime' },
  { label: 'Every 15 minutes', value: '15min' },
  { label: 'Every hour', value: 'hourly' },
  { label: 'Every 4 hours', value: '4hour' },
  { label: 'Daily', value: 'daily' },
  { label: 'Manual only', value: 'manual' },
]

const directionOptions = [
  { label: 'Monday \u2192 Dashboard (one-way)', value: 'oneway' },
  { label: 'Bidirectional sync', value: 'bidirectional' },
]

const { data: departments } = useFetch('/api/agency/departments')

const departmentOptions = computed(() => {
  return (departments.value || []).map((d: any) => ({
    label: d.name,
    value: d.id,
  }))
})

function setBoardDepartment(boardId: string, departmentId: string) {
  if (!boardMappings.value[boardId]) {
    boardMappings.value[boardId] = {}
  }
  boardMappings.value[boardId].departmentId = departmentId
}

const logIcon = (status: string) => {
  if (status === 'success') return 'i-lucide-check-circle'
  if (status === 'error') return 'i-lucide-x-circle'
  return 'i-lucide-clock'
}

const logColor = (status: string) => {
  if (status === 'success') return 'text-success'
  if (status === 'error') return 'text-error'
  return 'text-primary'
}

const formatTime = (date: string) => {
  return new Date(date).toLocaleString()
}

// Check existing connection on mount
onMounted(async () => {
  try {
    const response = await $fetch('/api/agency/monday/connection')
    if (response.connected) {
      connectionStatus.value = 'connected'
      accountInfo.value = response.account
      if (response.settings) {
        const { connectedBoards: saved, boardMappings: savedMappings, ...rest } = response.settings
        syncSettings.value = { ...syncSettings.value, ...rest }
        if (saved) {
          connectedBoards.value = saved
        }
        if (savedMappings) {
          boardMappings.value = savedMappings
        }
      }
      await fetchMondayBoards()
      await autoMapBoards()
      await fetchSyncLogs()
    }
  } catch {
    // Not connected
  }
})

async function autoMapBoards() {
  try {
    const response = await $fetch('/api/agency/monday/board-department-mappings')
    if (!response.mappings?.length) return

    let autoMapped = 0
    for (const mapping of response.mappings) {
      const boardId = mapping.mondayBoardId
      // Only auto-map if no existing mapping
      if (!boardMappings.value[boardId]?.departmentId) {
        if (!connectedBoards.value.includes(boardId)) {
          connectedBoards.value.push(boardId)
        }
        boardMappings.value[boardId] = {
          ...boardMappings.value[boardId],
          departmentId: mapping.departmentId,
        }
        autoMapped++
      }
    }

    if (autoMapped > 0) {
      toast.add({
        title: `Auto-mapped ${autoMapped} board${autoMapped > 1 ? 's' : ''} from migration data`,
        color: 'success',
      })
    }
  } catch {
    // Non-critical, ignore
  }
}

async function testAndConnect() {
  if (!apiToken.value) {
    toast.add({ title: 'Please enter an API token', color: 'error' })
    return
  }

  testingConnection.value = true
  try {
    const response = await $fetch('/api/agency/monday/connection', {
      method: 'POST',
      body: { token: apiToken.value },
    })

    connectionStatus.value = 'connected'
    accountInfo.value = response.account
    toast.add({ title: `Connected to ${response.account?.name}`, color: 'success' })
    await fetchMondayBoards()
  } catch (error: any) {
    connectionStatus.value = 'error'
    toast.add({
      title: 'Connection failed',
      description: error.data?.message || 'Invalid API token',
      color: 'error',
    })
  } finally {
    testingConnection.value = false
  }
}

async function disconnect() {
  try {
    await $fetch('/api/agency/monday/connection', { method: 'DELETE' })
    connectionStatus.value = 'disconnected'
    accountInfo.value = null
    mondayBoards.value = []
    connectedBoards.value = []
    toast.add({ title: 'Disconnected from Monday.com', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to disconnect', color: 'error' })
  }
}

async function fetchMondayBoards() {
  fetchingBoards.value = true
  try {
    const response = await $fetch('/api/agency/monday/boards')
    mondayBoards.value = response.boards || []
  } catch (error: any) {
    toast.add({
      title: 'Failed to fetch boards',
      description: error.data?.message,
      color: 'error',
    })
  } finally {
    fetchingBoards.value = false
  }
}

function isBoardConnected(boardId: string) {
  return connectedBoards.value.includes(boardId)
}

function toggleBoardConnection(boardId: string) {
  if (isBoardConnected(boardId)) {
    connectedBoards.value = connectedBoards.value.filter(id => id !== boardId)
    delete boardMappings.value[boardId]
  } else {
    connectedBoards.value.push(boardId)
    boardMappings.value[boardId] = { departmentId: '' }
  }
}

async function runFullSync() {
  if (connectedBoards.value.length === 0) {
    toast.add({ title: 'Select at least one board to sync', color: 'warning' })
    return
  }

  syncing.value = true
  try {
    const response = await $fetch('/api/agency/monday/sync', {
      method: 'POST',
      body: {
        boardIds: connectedBoards.value,
        mappings: boardMappings.value,
      },
    })

    toast.add({
      title: 'Sync complete',
      description: `Synced ${response.itemsSynced} items from ${response.boardsSynced} boards`,
      color: 'success',
    })
    await fetchSyncLogs()
  } catch (error: any) {
    toast.add({
      title: 'Sync failed',
      description: error.data?.message,
      color: 'error',
    })
  } finally {
    syncing.value = false
  }
}

async function runImportAll() {
  importing.value = true
  importResult.value = null
  try {
    const response = await $fetch('/api/agency/monday/import-all', {
      method: 'POST',
      body: {
        skipArchived: true,
        importUpdates: syncSettings.value.syncComments,
        importFiles: syncSettings.value.syncFiles,
        importSubitems: syncSettings.value.syncSubitems,
      },
    })

    importResult.value = {
      success: response.success,
      departmentsCreated: response.departmentsCreated,
      boardsMigrated: response.boardsMigrated,
      itemsMigrated: response.itemsMigrated,
      itemsFailed: response.itemsFailed,
    }

    toast.add({
      title: response.success ? 'Import complete' : 'Import completed with issues',
      description: `${response.itemsMigrated} items from ${response.boardsMigrated} boards. ${response.departmentsCreated} departments created.`,
      color: response.success ? 'success' : 'warning',
    })

    // Refresh boards and logs to reflect new state
    await fetchMondayBoards()
    await autoMapBoards()
    await fetchSyncLogs()
  } catch (error: any) {
    toast.add({
      title: 'Import failed',
      description: error.data?.message || 'An error occurred during import',
      color: 'error',
    })
  } finally {
    importing.value = false
  }
}

async function saveSyncSettings() {
  savingSettings.value = true
  try {
    await $fetch('/api/agency/monday/settings', {
      method: 'PUT',
      body: {
        ...syncSettings.value,
        connectedBoards: connectedBoards.value,
        boardMappings: boardMappings.value,
      },
    })
    toast.add({ title: 'Settings saved', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to save settings', color: 'error' })
  } finally {
    savingSettings.value = false
  }
}

async function fetchSyncLogs() {
  try {
    const response = await $fetch('/api/agency/monday/sync-logs')
    syncLogs.value = response.logs || []
  } catch {
    // Ignore
  }
}
</script>
