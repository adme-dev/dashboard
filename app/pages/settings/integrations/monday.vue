<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold">Monday.com Integration</h1>
      <p class="text-gray-500 mt-1">Connect and sync with your Monday.com workspace</p>
    </div>

    <!-- Connection Status Card -->
    <UCard>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-xl flex items-center justify-center"
            :class="connectionStatus === 'connected' ? 'bg-green-100' : 'bg-gray-100'"
          >
            <UIcon
              name="i-lucide-layout-grid"
              class="w-6 h-6"
              :class="connectionStatus === 'connected' ? 'text-green-600' : 'text-gray-400'"
            />
          </div>
          <div>
            <h3 class="font-semibold text-lg">Monday.com Connection</h3>
            <p class="text-sm text-gray-500">
              <template v-if="connectionStatus === 'connected'">
                Connected to <span class="font-medium text-gray-900">{{ accountInfo?.name }}</span>
              </template>
              <template v-else-if="connectionStatus === 'error'">
                <span class="text-red-500">Connection failed</span>
              </template>
              <template v-else>
                Not connected. Enter your API token to get started.
              </template>
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <UBadge
            :color="connectionStatus === 'connected' ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{ connectionStatus === 'connected' ? 'Connected' : 'Disconnected' }}
          </UBadge>
        </div>
      </div>

      <!-- Token Input -->
      <div v-if="connectionStatus !== 'connected'" class="mt-6 pt-6 border-t">
        <UFormField label="Monday.com API Token" description="Find this in Monday.com &gt; Admin &gt; API">
          <div class="flex gap-2">
            <UInput
              v-model="apiToken"
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiJ9..."
              class="flex-1 font-mono"
            />
            <UButton
              :loading="testingConnection"
              @click="testAndConnect"
            >
              Connect
            </UButton>
          </div>
        </UFormField>
      </div>

      <!-- Connected Actions -->
      <div v-else class="mt-6 pt-6 border-t flex gap-3">
        <UButton
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="syncing"
          @click="runFullSync"
        >
          Full Sync
        </UButton>
        <UButton
          variant="outline"
          icon="i-lucide-settings"
          @click="showSyncSettings = true"
        >
          Sync Settings
        </UButton>
        <UButton
          color="error"
          variant="ghost"
          @click="disconnect"
        >
          Disconnect
        </UButton>
      </div>
    </UCard>

    <!-- Connected Boards -->
    <UCard v-if="connectionStatus === 'connected'">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold">Connected Boards</h3>
            <p class="text-sm text-gray-500">Select which Monday.com boards to sync</p>
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            variant="ghost"
            size="sm"
            :loading="fetchingBoards"
            @click="fetchMondayBoards"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <div v-if="fetchingBoards" class="flex justify-center py-8">
        <UIcon name="i-lucide-rotate-cw" class="w-6 h-6 animate-spin text-gray-400" />
      </div>

      <div v-else-if="mondayBoards.length === 0" class="text-center py-8 text-gray-500">
        <UIcon name="i-lucide-layout-grid" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No boards found</p>
      </div>

      <div v-else class="divide-y">
        <div
          v-for="board in mondayBoards"
          :key="board.id"
          class="py-4 flex items-center justify-between"
        >
          <div class="flex items-center gap-3">
            <UCheckbox
              :model-value="isBoardConnected(board.id)"
              @update:model-value="toggleBoardConnection(board.id)"
            />
            <div>
              <p class="font-medium">{{ board.name }}</p>
              <p class="text-sm text-gray-500">
                {{ board.items_count || 0 }} items · {{ board.columns?.length || 0 }} columns
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <USelectMenu
              v-if="isBoardConnected(board.id)"
              v-model="boardMappings[board.id].departmentId"
              :items="departmentOptions"
              value-key="value"
              placeholder="Map to department"
              class="w-48"
            />
            <UBadge
              v-if="getSyncStatus(board.id)"
              :color="getSyncStatus(board.id)?.lastSyncAt ? 'success' : 'warning'"
              variant="subtle"
              size="sm"
            >
              {{ getSyncStatus(board.id)?.lastSyncAt ? 'Synced' : 'Pending' }}
            </UBadge>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Sync Logs -->
    <UCard v-if="syncLogs.length > 0">
      <template #header>
        <h3 class="font-semibold">Recent Sync Activity</h3>
      </template>

      <div class="space-y-3">
        <div
          v-for="log in syncLogs.slice(0, 10)"
          :key="log.id"
          class="flex items-center justify-between py-2"
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="log.status === 'success' ? 'i-lucide-check-circle' : log.status === 'error' ? 'i-lucide-x-circle' : 'i-lucide-clock'"
              class="w-5 h-5"
              :class="log.status === 'success' ? 'text-green-500' : log.status === 'error' ? 'text-red-500' : 'text-blue-500'"
            />
            <div>
              <p class="text-sm font-medium">{{ log.operation }}</p>
              <p class="text-xs text-gray-500">{{ formatTime(log.createdAt) }}</p>
            </div>
          </div>
          <div class="text-sm text-gray-600">
            <template v-if="log.details">
              {{ log.details.itemsSynced }} items · {{ log.details.boardsSynced }} boards
            </template>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Sync Settings Modal -->
    <UModal v-model:open="showSyncSettings">
      <template #content>
        <UCard class="max-w-lg">
          <template #header>
            <h3 class="font-semibold text-lg">Sync Settings</h3>
          </template>

          <div class="space-y-4">
            <UFormField label="Auto-sync frequency">
              <USelectMenu
                v-model="syncSettings.frequency"
                :items="[
                  { label: 'Real-time (webhooks)', value: 'realtime' },
                  { label: 'Every 15 minutes', value: '15min' },
                  { label: 'Every hour', value: 'hourly' },
                  { label: 'Every 4 hours', value: '4hour' },
                  { label: 'Daily', value: 'daily' },
                  { label: 'Manual only', value: 'manual' }
                ]"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Sync direction">
              <USelectMenu
                v-model="syncSettings.direction"
                :items="[
                  { label: 'Monday → Dashboard (one-way)', value: 'oneway' },
                  { label: 'Bidirectional sync', value: 'bidirectional' }
                ]"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <div class="space-y-2">
              <label class="flex items-center gap-2">
                <UCheckbox v-model="syncSettings.syncComments" />
                <span class="text-sm">Sync comments and updates</span>
              </label>
              <label class="flex items-center gap-2">
                <UCheckbox v-model="syncSettings.syncFiles" />
                <span class="text-sm">Sync file attachments</span>
              </label>
              <label class="flex items-center gap-2">
                <UCheckbox v-model="syncSettings.syncSubitems" />
                <span class="text-sm">Sync subitems as subtasks</span>
              </label>
              <label class="flex items-center gap-2">
                <UCheckbox v-model="syncSettings.deleteArchived" />
                <span class="text-sm">Delete archived items locally</span>
              </label>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showSyncSettings = false">
                Cancel
              </UButton>
              <UButton color="primary" @click="saveSyncSettings">
                Save Settings
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'agency'
})

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

// State
const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
const apiToken = ref('')
const testingConnection = ref(false)
const syncing = ref(false)
const fetchingBoards = ref(false)
const showSyncSettings = ref(false)
const accountInfo = ref<{ id: string; name: string } | null>(null)

const mondayBoards = ref<Array<{
  id: string
  name: string
  items_count?: number
  columns?: any[]
}>>([])

const connectedBoards = ref<string[]>([])
const boardMappings = ref<Record<string, { departmentId?: string; lastSyncAt?: string }>>({})

const syncLogs = ref<Array<{
  id: string
  operation: string
  status: 'success' | 'error' | 'pending'
  createdAt: string
  details?: any
}>>([])

const syncSettings = ref({
  frequency: 'hourly',
  direction: 'oneway',
  syncComments: true,
  syncFiles: true,
  syncSubitems: true,
  deleteArchived: false
})

// Fetch departments for mapping
const { data: departmentsData } = await useFetch('/api/agency/departments')
const departmentOptions = computed(() => [
  { label: 'Select department', value: '' },
  ...(departmentsData.value || []).map((d: any) => ({ label: d.name, value: d.id }))
])

// Check existing connection on mount
onMounted(async () => {
  try {
    const response = await apiFetch<any>('/api/agency/monday/connection')
    if (response.connected) {
      connectionStatus.value = 'connected'
      accountInfo.value = response.account
      await fetchMondayBoards()
      await fetchSyncLogs()
    }
  } catch {
    // Not connected
  }
})

// Test connection with token
async function testAndConnect() {
  if (!apiToken.value) {
    toast.add({ title: 'Please enter an API token', color: 'error' })
    return
  }

  testingConnection.value = true
  try {
    const response = await apiFetch<any>('/api/agency/monday/connection', {
      method: 'POST',
      body: { token: apiToken.value }
    })

    connectionStatus.value = 'connected'
    accountInfo.value = response.account
    toast.add({ title: `Connected to ${response.account.name}`, color: 'success' })
    await fetchMondayBoards()
  } catch (error: any) {
    connectionStatus.value = 'error'
    toast.add({
      title: 'Connection failed',
      description: error.data?.message || 'Invalid API token',
      color: 'error'
    })
  } finally {
    testingConnection.value = false
  }
}

// Disconnect
async function disconnect() {
  try {
    await apiFetch('/api/agency/monday/connection', { method: 'DELETE' })
    connectionStatus.value = 'disconnected'
    accountInfo.value = null
    mondayBoards.value = []
    connectedBoards.value = []
    toast.add({ title: 'Disconnected from Monday.com', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to disconnect', color: 'error' })
  }
}

// Fetch boards from Monday
async function fetchMondayBoards() {
  fetchingBoards.value = true
  try {
    const response = await apiFetch<any>('/api/agency/monday/boards')
    mondayBoards.value = response.boards || []
  } catch (error: any) {
    toast.add({
      title: 'Failed to fetch boards',
      description: error.data?.message,
      color: 'error'
    })
  } finally {
    fetchingBoards.value = false
  }
}

// Board connection management
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

function getSyncStatus(boardId: string) {
  return boardMappings.value[boardId]
}

// Full sync
async function runFullSync() {
  if (connectedBoards.value.length === 0) {
    toast.add({ title: 'Select at least one board to sync', color: 'warning' })
    return
  }

  syncing.value = true
  try {
    const response = await apiFetch<any>('/api/agency/monday/sync', {
      method: 'POST',
      body: {
        boardIds: connectedBoards.value,
        mappings: boardMappings.value
      }
    })

    toast.add({
      title: 'Sync complete',
      description: `Synced ${response.itemsSynced} items from ${response.boardsSynced} boards`,
      color: 'success'
    })
    await fetchSyncLogs()
  } catch (error: any) {
    toast.add({
      title: 'Sync failed',
      description: error.data?.message,
      color: 'error'
    })
  } finally {
    syncing.value = false
  }
}

// Sync settings
async function saveSyncSettings() {
  try {
    await apiFetch('/api/agency/monday/settings', {
      method: 'PUT',
      body: syncSettings.value
    })
    showSyncSettings.value = false
    toast.add({ title: 'Settings saved', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to save settings', color: 'error' })
  }
}

// Fetch sync logs
async function fetchSyncLogs() {
  try {
    const response = await apiFetch<any>('/api/agency/monday/sync-logs')
    syncLogs.value = response.logs || []
  } catch {
    // Ignore
  }
}

function formatTime(date: string) {
  return new Date(date).toLocaleString()
}
</script>
