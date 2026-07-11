<script setup lang="ts">
definePageMeta({ title: 'Monday Governed Sync', middleware: ['auth'] })

type Session = {
  id: string
  status: string
  boardsTotal: number
  boardsMigrated: number
  itemsMigrated: number
  itemsFailed: number
}
type SyncState = {
  id: string
  mondayBoardId: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  recordsSeen: number
  recordsCreated: number
  recordsFailed: number
  lastStartedAt: string | null
  lastCompletedAt: string | null
  errorMessage: string | null
}
type ReconciliationIssue = {
  mondayBoardId: string
  mondayItemId: string
  mondayUrl: string | null
  taskId: string | null
  title: string
  sourceState: 'active' | 'archived' | 'deleted'
  reconciliationStatus: 'current' | 'pending' | 'archived' | 'deleted'
  sourceUpdatedAt: string | null
  localUpdatedAt: string | null
}
type ReconciliationSummary = {
  total: number
  current: number
  pending: number
  archived: number
  deleted: number
  sourceNewer: number
  localNewer: number
  issues: ReconciliationIssue[]
}

const toast = useToast()
const loading = ref(true)
const starting = ref(false)
const sessions = ref<Session[]>([])
const states = ref<SyncState[]>([])
const reconciliation = ref<ReconciliationSummary>({ total: 0, current: 0, pending: 0, archived: 0, deleted: 0, sourceNewer: 0, localNewer: 0, issues: [] })
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-AU') : 'Not completed yet'
}

async function load() {
  loading.value = true
  try {
    const [migrationData, syncData] = await Promise.all([
      apiFetch<{ sessions: Array<{ id: string; status: string; stats: Omit<Session, 'id' | 'status'> }> }>('/api/agency/monday/migrations'),
      apiFetch<{ active: boolean; states: SyncState[]; reconciliation?: ReconciliationSummary }>('/api/agency/hr/monday/sync-status'),
    ])
    sessions.value = migrationData.sessions.slice(0, 20).map(item => ({ id: item.id, status: item.status, ...item.stats }))
    states.value = syncData.states
    reconciliation.value = syncData.reconciliation ?? { total: 0, current: 0, pending: 0, archived: 0, deleted: 0, sourceNewer: 0, localNewer: 0, issues: [] }
  } catch (error: any) {
    toast.add({ title: 'Monday sync status unavailable', description: error?.data?.statusMessage, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function start() {
  starting.value = true
  try {
    const result = await apiFetch<{ status: 'running' | 'already_running' }>('/api/agency/hr/monday/sync', { method: 'POST' })
    toast.add({
      title: result.status === 'already_running' ? 'Sync already running' : 'Governed sync started',
      description: 'Only approved boards and fields are processed. Comments and files remain excluded.',
      color: result.status === 'already_running' ? 'warning' : 'success',
    })
    await load()
  } catch (error: any) {
    toast.add({ title: 'Sync not started', description: error?.data?.statusMessage, color: 'error' })
  } finally {
    starting.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <main class="h-full min-h-0 overflow-y-auto bg-default">
    <header class="border-b border-default bg-elevated/30">
      <div class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <p class="font-mono text-xs uppercase tracking-[0.18em] text-primary">Governed synchronization</p>
        <h1 class="mt-2 text-3xl font-semibold text-highlighted">Monday sync</h1>
        <p class="mt-3 max-w-3xl text-sm leading-6 text-muted">Incrementally synchronize the approved evidence boards. Comments, files, private messages and embeddings are not imported here.</p>
      </div>
    </header>

    <section class="mx-auto max-w-5xl space-y-6 px-5 py-8 sm:px-8">
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Evidence scope" to="/agency/hr/monday" />
        <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" label="Refresh" :loading="loading" @click="load" />
        <UButton icon="i-lucide-play" label="Run governed sync" :loading="starting" @click="start" />
      </div>

      <UAlert color="primary" variant="soft" icon="i-lucide-clock-3" title="Automatic reconciliation is active" description="Approved boards reconcile hourly. Signed webhook events are processed every five minutes; this button is for an immediate owner-triggered run." />

      <section class="rounded-xl border border-default bg-default">
        <div class="border-b border-default bg-elevated/30 px-5 py-4">
          <h2 class="font-semibold text-highlighted">Reconciliation health</h2>
          <p class="mt-1 text-xs text-muted">Source changes remain reviewable until the governed sync observes the exact Monday timestamp. Archived or deleted sources never delete local tasks.</p>
        </div>
        <div class="grid gap-px bg-default sm:grid-cols-2 lg:grid-cols-5">
          <div class="bg-default p-4"><p class="text-2xl font-semibold text-highlighted">{{ reconciliation.pending }}</p><p class="mt-1 text-xs text-muted">Pending source changes</p></div>
          <div class="bg-default p-4"><p class="text-2xl font-semibold text-highlighted">{{ reconciliation.sourceNewer }}</p><p class="mt-1 text-xs text-muted">Monday newer</p></div>
          <div class="bg-default p-4"><p class="text-2xl font-semibold text-highlighted">{{ reconciliation.localNewer }}</p><p class="mt-1 text-xs text-muted">Local task newer</p></div>
          <div class="bg-default p-4"><p class="text-2xl font-semibold text-highlighted">{{ reconciliation.archived }}</p><p class="mt-1 text-xs text-muted">Archived in Monday</p></div>
          <div class="bg-default p-4"><p class="text-2xl font-semibold text-highlighted">{{ reconciliation.deleted }}</p><p class="mt-1 text-xs text-muted">Deleted in Monday</p></div>
        </div>
        <div v-if="reconciliation.issues.length" class="divide-y divide-default border-t border-default">
          <div v-for="issue in reconciliation.issues" :key="`${issue.mondayBoardId}:${issue.mondayItemId}`" class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">{{ issue.title }}</p>
              <p class="mt-1 text-xs text-muted">Item {{ issue.mondayItemId }} · board {{ issue.mondayBoardId }} · source {{ formatDate(issue.sourceUpdatedAt) }} · local {{ formatDate(issue.localUpdatedAt) }}</p>
            </div>
            <UBadge :color="issue.sourceState === 'deleted' ? 'error' : issue.sourceState === 'archived' ? 'warning' : 'info'" variant="subtle" :label="issue.reconciliationStatus" />
          </div>
        </div>
      </section>

      <section class="rounded-xl border border-default bg-default">
        <div class="border-b border-default bg-elevated/30 px-5 py-4"><h2 class="font-semibold text-highlighted">Board checkpoints</h2></div>
        <div v-if="loading" class="p-5 text-sm text-muted">Loading checkpoints…</div>
        <div v-else-if="states.length" class="divide-y divide-default">
          <div v-for="state in states" :key="state.id" class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p class="font-medium text-highlighted">Board {{ state.mondayBoardId }}</p>
              <p class="mt-1 text-xs text-muted">Last completed {{ formatDate(state.lastCompletedAt) }} · {{ state.recordsSeen }} seen · {{ state.recordsCreated }} created · {{ state.recordsFailed }} failed</p>
              <p v-if="state.errorMessage" class="mt-1 text-xs text-error">{{ state.errorMessage }}</p>
            </div>
            <UBadge :color="state.status === 'completed' ? 'success' : state.status === 'failed' ? 'error' : 'warning'" variant="subtle" :label="state.status" />
          </div>
        </div>
        <p v-else class="p-5 text-sm text-muted">No approved-board checkpoints exist yet.</p>
      </section>

      <section class="rounded-xl border border-default bg-default">
        <div class="border-b border-default bg-elevated/30 px-5 py-4"><h2 class="font-semibold text-highlighted">Recent sync sessions</h2></div>
        <div v-if="sessions.length" class="divide-y divide-default">
          <div v-for="session in sessions" :key="session.id" class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div><p class="font-medium text-highlighted">{{ session.id }}</p><p class="mt-1 text-xs text-muted">{{ session.boardsMigrated }}/{{ session.boardsTotal }} boards · {{ session.itemsMigrated }} items · {{ session.itemsFailed }} failed</p></div>
            <UBadge :color="session.status === 'completed' ? 'success' : session.status === 'failed' ? 'error' : 'warning'" variant="subtle" :label="session.status" />
          </div>
        </div>
        <p v-else class="p-5 text-sm text-muted">No sync sessions found.</p>
      </section>
    </section>
  </main>
</template>
