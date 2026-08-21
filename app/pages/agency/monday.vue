<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
          Monday.com Migration
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Import all your Monday.com boards, items, and history into your new workflow system.
        </p>
      </div>
      <UButton
        to="/agency/monday-cutover"
        color="primary"
        variant="soft"
        icon="i-lucide-shield-check"
      >
        Cutover governance
      </UButton>
    </div>

    <!-- Connection Status -->
    <UCard class="mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div
            class="w-3 h-3 rounded-full"
            :class="connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'"
          />
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">
              Monday.com Connection
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ connectionMessage }}
            </p>
          </div>
        </div>
        <div class="flex gap-3">
          <UButton
            v-if="connectionStatus === 'connected'"
            color="primary"
            variant="outline"
            icon="i-lucide-eye"
            @click="showPreview = true"
          >
            Preview Import
          </UButton>
          <UButton
            v-if="connectionStatus === 'connected'"
            color="primary"
            icon="i-lucide-play"
            :loading="startingMigration"
            @click="startDirectMigration"
          >
            Start Migration
          </UButton>
          <UButton
            v-else
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="testingConnection"
            @click="testConnection"
          >
            Test Connection
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-key-round"
            to="/api/agency/monday/oauth/start"
            external
          >
            {{ connectionStatus === 'connected' ? 'Reconnect for automation' : 'Connect with Monday' }}
          </UButton>
        </div>
      </div>
    </UCard>

    <UAlert
      v-if="connectionStatus === 'connected'"
      class="mb-6"
      title="Campaign Exceptions automation needs Monday write consent"
      description="Use Reconnect for automation once to grant boards:write and updates:write. XeroFlow remains restricted to the Campaign Exceptions board and its machine-owned columns."
      icon="i-lucide-shield-check"
      color="primary"
      variant="soft"
    />

    <UCard class="mb-6">
      <template #header><div class="flex flex-wrap items-center justify-between gap-3"><h3 class="font-semibold text-gray-900 dark:text-white">Webhook queue</h3><div class="flex gap-2"><UButton size="sm" color="primary" variant="soft" icon="i-lucide-webhook" :loading="registeringWebhooks" @click="registerWebhooks">Register approved boards</UButton><UButton size="sm" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="loadingWebhookStatus" @click="fetchWebhookStatus">Refresh queue</UButton></div></div></template>
      <p v-if="!webhookStatus" class="text-sm text-gray-600 dark:text-gray-400">Refresh to inspect webhook delivery and processing health.</p>
      <div v-else class="grid gap-3 sm:grid-cols-3"><div v-for="entry in webhookStatus.counts" :key="entry.status" class="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"><p class="text-2xl font-bold">{{ entry.count }}</p><p class="text-xs capitalize text-gray-600 dark:text-gray-400">{{ entry.status }}</p></div><p v-if="webhookStatus.recentFailures.length" class="sm:col-span-3 text-sm text-red-600">{{ webhookStatus.recentFailures.length }} recent webhook failures require review.</p></div>
    </UCard>

    <UCard class="mb-6">
      <template #header><div class="flex items-center justify-between gap-3"><h3 class="font-semibold text-gray-900 dark:text-white">Monday work health</h3><UButton size="sm" color="neutral" variant="outline" icon="i-lucide-activity" :loading="loadingHealth" @click="fetchHealth">Refresh health</UButton></div></template>
      <p v-if="!health" class="text-sm text-gray-600 dark:text-gray-400">Refresh to check overdue, blocked, and inactive Monday-linked work.</p>
      <div v-else-if="health.alerts.length === 0" class="text-sm text-green-600">No overdue, blocked, or inactive mapped tasks found.</div>
      <div v-else class="divide-y divide-gray-200 dark:divide-gray-700"><div v-for="alert in health.alerts.slice(0, 10)" :key="alert.mondayItemId" class="flex items-center justify-between gap-3 py-3"><div class="min-w-0"><p class="truncate font-medium">{{ alert.title }}</p><p class="text-xs text-gray-500">{{ alert.reasons.join(' · ') }} · last activity {{ formatDate(alert.lastActivityAt) }}</p></div><UBadge color="warning" variant="subtle">{{ alert.reasons.length }} alert{{ alert.reasons.length === 1 ? '' : 's' }}</UBadge></div><p v-if="health.alerts.length > 10" class="pt-3 text-xs text-gray-500">Showing 10 of {{ health.alerts.length }} alerts.</p></div>
    </UCard>

    <UCard class="mb-6">
      <template #header><div class="flex items-center justify-between gap-3"><h3 class="font-semibold text-gray-900 dark:text-white">Monday structure discovery</h3><UButton size="sm" color="neutral" variant="outline" icon="i-lucide-scan-search" :loading="discovering" @click="discoverMonday">Discover structure</UButton></div></template>
      <p class="text-sm text-gray-600 dark:text-gray-400">Read-only inventory of boards, groups, columns, and sample value types. Nothing is imported.</p>
      <div v-if="discovery" class="mt-4 grid gap-3 sm:grid-cols-3"><div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"><p class="text-2xl font-bold">{{ discovery.boardCount }}</p><p class="text-xs text-gray-600 dark:text-gray-400">Boards discovered</p></div><div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"><p class="text-2xl font-bold">{{ discovery.boards.reduce((sum, board) => sum + board.groups.length, 0) }}</p><p class="text-xs text-gray-600 dark:text-gray-400">Groups</p></div><div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"><p class="text-2xl font-bold">{{ discovery.boards.reduce((sum, board) => sum + board.columns.length, 0) }}</p><p class="text-xs text-gray-600 dark:text-gray-400">Columns</p></div></div>
      <div v-if="discovery" class="mt-4 divide-y divide-gray-200 dark:divide-gray-700"><div v-for="board in discovery.boards" :key="board.id" class="flex items-center justify-between gap-3 py-3"><div><p class="font-medium">{{ board.name }}</p><p class="text-xs text-gray-500">{{ board.groups.length }} groups · {{ board.columns.length }} columns · {{ board.sample.items }} sampled items</p></div><UBadge color="neutral" variant="subtle">{{ board.state }}</UBadge></div></div>
    </UCard>

    <!-- Migration Settings -->
    <UCard v-if="showSettings" class="mb-6">
      <template #header>
        <h3 class="font-semibold text-gray-900 dark:text-white">
          Migration Settings
        </h3>
      </template>

      <div class="grid grid-cols-2 gap-6">
        <UFormField label="Default Department">
          <USelect
            v-model="migrationConfig.defaultDepartmentId"
            :options="departmentOptions"
            placeholder="Select a department for unmapped boards"
          />
        </UFormField>

        <UFormField label="Default Project (optional)">
          <USelect
            v-model="migrationConfig.defaultProjectId"
            :options="projectOptions"
            placeholder="Select a default project"
          />
        </UFormField>

        <div class="col-span-2">
          <UFormField label="Import Options">
            <div class="grid grid-cols-2 gap-4">
              <UCheckbox
                v-model="migrationConfig.importUpdates"
                label="Import comments and updates"
              />
              <UCheckbox
                v-model="migrationConfig.importFiles"
                label="Import file attachments"
              />
              <UCheckbox
                v-model="migrationConfig.importSubitems"
                label="Import subitems as tasks"
              />
              <UCheckbox
                v-model="migrationConfig.skipCompletedItems"
                label="Skip completed items"
              />
              <UCheckbox
                v-model="migrationConfig.skipArchivedBoards"
                label="Skip archived boards"
              />
            </div>
          </UFormField>
        </div>
      </div>
    </UCard>

    <!-- Active Migration Progress -->
    <UCard v-if="activeMigration" class="mb-6 border-primary-500 dark:border-primary-400">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-gray-900 dark:text-white">
            Migration in Progress
          </h3>
          <UBadge :color="getStatusColor(activeMigration.status)">
            {{ activeMigration.status }}
          </UBadge>
        </div>
      </template>

      <div class="space-y-4">
        <!-- Overall Progress -->
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-600 dark:text-gray-400">Overall Progress</span>
            <span class="font-medium">{{ Math.round(overallProgress) }}%</span>
          </div>
          <UProgress :value="overallProgress" color="primary" />
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-4 gap-4">
          <div class="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ activeMigration.stats.boardsMigrated }}/{{ activeMigration.stats.boardsTotal }}
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400">Boards</div>
          </div>
          <div class="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="text-2xl font-bold text-primary-600">
              {{ activeMigration.stats.itemsMigrated.toLocaleString() }}
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400">Items Migrated</div>
          </div>
          <div class="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="text-2xl font-bold text-red-600">
              {{ activeMigration.stats.itemsFailed }}
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400">Failed</div>
          </div>
          <div class="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ activeMigration.stats.itemsTotal.toLocaleString() }}
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400">Total Items</div>
          </div>
        </div>

        <!-- Current Board -->
        <div v-if="activeMigration.currentBoard" class="text-sm text-gray-600 dark:text-gray-400">
          Currently processing: <span class="font-medium">{{ activeMigration.currentBoard }}</span>
        </div>
      </div>
    </UCard>

    <!-- Migration History -->
    <UCard>
      <template #header>
        <h3 class="font-semibold text-gray-900 dark:text-white">
          Migration History
        </h3>
      </template>

      <div v-if="migrations.length === 0" class="text-center py-8 text-gray-500">
        No migrations yet. Start your first migration above.
      </div>

      <UTable
        v-else
        :data="migrations"
        :columns="columns"
        :loading="loading"
      >
        <template #status-cell="{ row }">
          <UBadge :color="getStatusColor(row.original.status)">
            {{ row.original.status }}
          </UBadge>
        </template>

        <template #stats-cell="{ row }">
          <div class="text-sm">
            <div>{{ row.original.stats.itemsMigrated.toLocaleString() }} items migrated</div>
            <div v-if="row.original.stats.itemsFailed > 0" class="text-red-600">
              {{ row.original.stats.itemsFailed }} failed
            </div>
          </div>
        </template>

        <template #startedAt-cell="{ row }">
          {{ formatDate(row.original.startedAt) }}
        </template>

        <template #actions-cell="{ row }">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-eye"
            @click="viewMigration(row.original.id)"
          >
            View
          </UButton>
        </template>
      </UTable>
    </UCard>

    <!-- Preview Modal -->
    <MondayMigrationPreview
      v-model:open="showPreview"
      :config="migrationConfig"
      :departments="departmentOptions"
      :projects="projectOptions"
      @start="handlePreviewStart"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MondayMigrationPreview from '../../components/monday/MigrationPreview.vue'

definePageMeta({ middleware: ['role-admin'] })

// Types
interface MigrationSession {
  id: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  startedAt: string
  completedAt?: string
  startedBy: string
  mondayAccount: {
    id: string
    name: string
  }
  stats: {
    boardsTotal: number
    boardsMigrated: number
    itemsTotal: number
    itemsMigrated: number
    itemsFailed: number
  }
  currentBoard?: string
  currentBoardProgress?: number
}

// State
const connectionStatus = ref<'unknown' | 'connected' | 'error'>('unknown')
const connectionMessage = ref('Click "Test Connection" to verify your Monday.com API access')
const testingConnection = ref(false)
const startingMigration = ref(false)
const showSettings = ref(false)
const showPreview = ref(false)
const loading = ref(false)
const migrations = ref<MigrationSession[]>([])
const activeMigration = ref<MigrationSession | null>(null)
const discovering = ref(false)
const discovery = ref<{ boardCount: number; boards: Array<{ id: string; name: string; state: string; groups: unknown[]; columns: unknown[]; sample: { items: number } }> } | null>(null)
const loadingHealth = ref(false)
const health = ref<{ alerts: Array<{ mondayItemId: string; title: string; reasons: string[]; lastActivityAt: string }> } | null>(null)
const loadingWebhookStatus = ref(false)
const registeringWebhooks = ref(false)
const webhookStatus = ref<{ counts: Array<{ status: string; count: number }>; recentFailures: Array<{ eventId: string }> } | null>(null)
const departments = ref<Array<{ id: string; name: string }>>([])
const projects = ref<Array<{ id: string; name: string }>>([])
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown }
) => Promise<T>

const migrationConfig = ref({
  defaultDepartmentId: '',
  defaultProjectId: '',
  importUpdates: true,
  importFiles: true,
  importSubitems: true,
  skipCompletedItems: false,
  skipArchivedBoards: true,
})

let refreshInterval: NodeJS.Timeout | null = null

// Computed
const departmentOptions = computed(() => {
  return departments.value.map(d => ({
    label: d.name,
    value: d.id,
  }))
})

const projectOptions = computed(() => {
  return projects.value.map(p => ({
    label: p.name,
    value: p.id,
  }))
})

const overallProgress = computed(() => {
  if (!activeMigration.value) return 0
  const { boardsTotal, boardsMigrated } = activeMigration.value.stats
  if (boardsTotal === 0) return 0
  return (boardsMigrated / boardsTotal) * 100
})

const columns = [
  { accessorKey: 'mondayAccount.name', header: 'Account' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'stats', header: 'Progress' },
  { accessorKey: 'startedBy', header: 'Started By' },
  { accessorKey: 'startedAt', header: 'Started' },
  { accessorKey: 'actions', header: '' },
]

// Methods
async function testConnection() {
  testingConnection.value = true
  try {
    const response = await apiFetch<{ account: { name: string } }>('/api/agency/monday/test-connection')
    connectionStatus.value = 'connected'
    connectionMessage.value = `Connected to ${response.account.name}`
    showSettings.value = true
  } catch (error: any) {
    connectionStatus.value = 'error'
    connectionMessage.value = error.message || 'Failed to connect to Monday.com'
  } finally {
    testingConnection.value = false
  }
}

async function discoverMonday() {
  discovering.value = true
  try {
    discovery.value = await apiFetch<typeof discovery.value>('/api/agency/hr/monday/discovery')
  } catch (error: any) {
    connectionMessage.value = error?.data?.statusMessage || 'Discovery failed'
  } finally {
    discovering.value = false
  }
}

async function fetchHealth() {
  loadingHealth.value = true
  try { health.value = await apiFetch<typeof health.value>('/api/agency/monday/health') }
  catch (error) { console.error('Failed to fetch Monday health', error) }
  finally { loadingHealth.value = false }
}

async function fetchWebhookStatus() {
  loadingWebhookStatus.value = true
  try { webhookStatus.value = await apiFetch<typeof webhookStatus.value>('/api/agency/monday/webhook-status') }
  catch (error) { console.error('Failed to fetch Monday webhook status', error) }
  finally { loadingWebhookStatus.value = false }
}

async function registerWebhooks() {
  registeringWebhooks.value = true
  try {
    const result = await apiFetch<{ boards: Array<{ created: number; failed: Array<{ event: string }> }> }>('/api/agency/monday/webhooks/register', { method: 'POST' })
    const created = result.boards.reduce((total, board) => total + board.created, 0)
    const failedCount = result.boards.reduce((total, board) => total + board.failed.length, 0)
    connectionMessage.value = failedCount
      ? `${failedCount} webhook events could not be registered; supported events remain active`
      : created
        ? `${created} signed Monday webhooks registered`
        : 'Approved-board webhooks are already registered'
    await fetchWebhookStatus()
  } catch (error: any) {
    connectionMessage.value = error?.data?.statusMessage || 'Webhook registration failed'
  } finally { registeringWebhooks.value = false }
}

async function startDirectMigration() {
  // Ensure a default department is set
  const config = { ...migrationConfig.value }
  if (!config.defaultDepartmentId && departments.value.length > 0) {
    config.defaultDepartmentId = departments.value[0].id
  }

  startingMigration.value = true

  try {
    const response = await apiFetch<{ success?: boolean }>('/api/agency/monday/migrations', {
      method: 'POST',
      body: { config },
    })

    if (response.success) {
      await fetchMigrations()
      startRefreshInterval()
    }
  } catch (error: any) {
    console.error('Failed to start migration:', error)
  } finally {
    startingMigration.value = false
  }
}

async function handlePreviewStart(boardMappings: Record<string, { departmentId?: string; projectId?: string }>) {
  showPreview.value = false
  startingMigration.value = true
  
  try {
    // Convert board mappings to the format expected by the API
    const boardMappingArray = Object.entries(boardMappings).map(([mondayBoardId, mapping]) => ({
      mondayBoardId,
      departmentId: mapping.departmentId,
      projectId: mapping.projectId,
    }))

    const response = await apiFetch<{ success?: boolean }>('/api/agency/monday/migrations', {
      method: 'POST',
      body: {
        config: {
          ...migrationConfig.value,
          boardMappings: boardMappingArray,
        },
      },
    })
    
    if (response.success) {
      await fetchMigrations()
      startRefreshInterval()
    }
  } catch (error: any) {
    console.error('Failed to start migration:', error)
    // Show error toast
  } finally {
    startingMigration.value = false
  }
}

async function fetchMigrations() {
  loading.value = true
  try {
    const response = await apiFetch<{ sessions: MigrationSession[] }>('/api/agency/monday/migrations')
    migrations.value = response.sessions
    
    // Find active migration
    const running = response.sessions.find(s => s.status === 'running')
    activeMigration.value = running || null
    
    if (!running && refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  } finally {
    loading.value = false
  }
}

async function fetchDepartments() {
  try {
    const response = await apiFetch<Array<{ id: string; name: string }>>('/api/agency/departments')
    departments.value = response
  } catch (error) {
    console.error('Failed to fetch departments:', error)
  }
}

async function fetchProjects() {
  try {
    const response = await apiFetch<Array<{ id: string; name: string }>>('/api/agency/projects')
    projects.value = response
  } catch (error) {
    console.error('Failed to fetch projects:', error)
  }
}

function startRefreshInterval() {
  if (refreshInterval) return
  refreshInterval = setInterval(fetchMigrations, 5000) // Refresh every 5 seconds
}

function viewMigration(id: string) {
  navigateTo(`/agency/monday/migrations/${id}`)
}

function getStatusColor(status: string): 'primary' | 'success' | 'error' | 'warning' | 'neutral' {
  const colors: Record<string, 'primary' | 'success' | 'error' | 'warning' | 'neutral'> = {
    running: 'primary',
    completed: 'success',
    failed: 'error',
    paused: 'warning',
    pending: 'neutral',
  }
  return colors[status] || 'neutral'
}

function formatDate(date: string) {
  return new Date(date).toLocaleString()
}

// Lifecycle
onMounted(async () => {
  await fetchMigrations()
  fetchDepartments()
  fetchProjects()

  // Check if there's an active migration on load
  const running = migrations.value.find(s => s.status === 'running')
  if (running) {
    startRefreshInterval()
  }
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>
