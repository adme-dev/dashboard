<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-finance'] })

type Recommendation = {
  id: string
  tenant_id: string
  client_id: string | null
  client_name: string | null
  source_report_id: string | null
  period_key: string | null
  period_label: string | null
  title: string
  action: string
  impact: string | null
  priority: 'low' | 'medium' | 'high'
  target_metric: string | null
  baseline_metric_value: number | null
  target_direction: 'up' | 'down' | null
  status: 'open' | 'in_progress' | 'done' | 'dismissed'
  due_date: string | null
  assigned_to: string | null
  assignee_name: string | null
  assignee_avatar_url: string | null
  acted_at: string | null
  outcome_notes: string | null
  category: string | null
  effort: 'xs' | 's' | 'm' | 'l' | 'xl' | null
  snoozed_until: string | null
  source: 'ai' | 'manual'
  created_by: string | null
  created_by_name: string | null
  created_by_avatar_url: string | null
  created_at: string
  updated_at: string
}

type RecommendationEvent = {
  id: string
  event_type: string
  actor_id: string | null
  actor_name: string | null
  actor_avatar_url: string | null
  payload: any
  created_at: string
}

type RecommendationOutcome = {
  id: string
  measured_at: string
  days_after_action: number | null
  metric_value: number | null
  metric_delta: number | null
  notes: string | null
}

type SimilarMatch = Recommendation & { score: number }

type GraphNode = {
  id: string
  type: 'recommendation' | 'client' | 'report' | 'metric' | 'outcome' | 'event' | 'assignee' | 'similar'
  label: string
  sublabel?: string
  meta?: Record<string, any>
}
type GraphData = { nodes: GraphNode[]; edges: Array<{ from: string; to: string; type: string; label?: string }> }

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> }
) => Promise<T>

// Client scope is URL-persisted so the page is bookmarkable and the
// filter survives drawer navigations / refresh. Everything else stays
// session-local.
const route = useRoute()
const router = useRouter()

const statusFilter = ref<'active' | 'all' | 'open' | 'in_progress' | 'done' | 'dismissed'>('active')
const priorityFilter = ref<'all' | 'low' | 'medium' | 'high'>('all')
const clientFilter = ref<string>(typeof route.query.clientId === 'string' ? route.query.clientId : 'all')
const periodFilter = ref<string>('all')
const assigneeFilter = ref<string>('all')
const categoryFilter = ref<string>('all')
const sourceFilter = ref<'all' | 'ai' | 'manual'>('all')
const showSnoozed = ref(false)

watch(clientFilter, (v) => {
  const next = { ...route.query }
  if (v === 'all') delete next.clientId
  else next.clientId = v
  router.replace({ query: next })
})

const query = computed(() => {
  const q: Record<string, string> = {}
  if (statusFilter.value === 'active') q.status = 'open,in_progress'
  else if (statusFilter.value !== 'all') q.status = statusFilter.value
  if (priorityFilter.value !== 'all') q.priority = priorityFilter.value
  if (clientFilter.value !== 'all') q.client_id = clientFilter.value
  if (periodFilter.value !== 'all') q.period = periodFilter.value
  if (assigneeFilter.value !== 'all') q.assigned_to = assigneeFilter.value
  if (categoryFilter.value !== 'all') q.category = categoryFilter.value
  if (sourceFilter.value !== 'all') q.source = sourceFilter.value
  if (showSnoozed.value) q.include_snoozed = '1'
  return q
})

const data = ref<{ recommendations: Recommendation[] }>({ recommendations: [] })
const pending = ref(false)
const clientsData = ref<Array<{ id: string; name: string }>>([])
const teamData = ref<{ members: Array<{ id: string; name: string; avatar_url?: string | null }> }>({ members: [] })
const historyData = ref<{ reports: Array<{ period_key: string; period_label: string }> }>({ reports: [] })

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<{ recommendations: Recommendation[] }>('/api/advisor/recommendations', { query: query.value })
  } finally {
    pending.value = false
  }
}

async function refreshLookups() {
  const [clients, team, history] = await Promise.all([
    apiFetch<Array<{ id: string; name: string }>>('/api/agency/clients'),
    apiFetch<{ members: Array<{ id: string; name: string; avatar_url?: string | null }> }>('/api/agency/team-members'),
    apiFetch<{ reports: Array<{ period_key: string; period_label: string }> }>('/api/ai/financial-advisor/history'),
  ])
  clientsData.value = clients
  teamData.value = team
  historyData.value = history
}

onMounted(() => {
  void refresh()
  void refreshLookups()
})

watch(query, () => {
  void refresh()
})

const recommendations = computed(() => data.value?.recommendations ?? [])

const clientOptions = computed(() => ([
  { label: 'All scopes', value: 'all' },
  { label: 'Agency (own books)', value: 'agency' },
  ...(clientsData.value ?? []).map((c) => ({ label: c.name, value: c.id })),
]))

const assigneeOptions = computed(() => ([
  { label: 'All assignees', value: 'all' },
  { label: 'Unassigned', value: 'unassigned' },
  ...(teamData.value?.members ?? []).map((m) => ({ label: m.name, value: m.id })),
]))

const periodOptions = computed(() => {
  const uniq = new Map<string, string>()
  for (const r of historyData.value?.reports ?? []) {
    uniq.set(r.period_key, r.period_label)
  }
  return [
    { label: 'All periods', value: 'all' },
    ...Array.from(uniq.entries()).map(([k, label]) => ({ label, value: k })),
  ]
})

const columns = [
  { accessorKey: 'select', header: '' },
  { accessorKey: 'priority', header: 'Priority' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'title', header: 'Recommendation' },
  { accessorKey: 'client', header: 'Client' },
  { accessorKey: 'period', header: 'Period' },
  { accessorKey: 'assignee', header: 'Assignee' },
  { accessorKey: 'due_date', header: 'Due' },
  { accessorKey: 'status', header: 'Status' },
]

// ── Bulk selection state ───────────────────────────────────────────
// Manual checkbox column with a Set ref. UTable v4's selection API
// is left unused here on purpose — the spec calls out that path as
// the safer fallback.
const selection = ref<Set<string>>(new Set())
const bulkLoading = ref(false)

function toggleSelect(id: string, ev?: Event) {
  ev?.stopPropagation()
  const next = new Set(selection.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selection.value = next
}

function isSelected(id: string): boolean {
  return selection.value.has(id)
}

function clearSelection() {
  selection.value = new Set()
}

// Reset selection when the visible list changes meaningfully (filters /
// refresh) so we never apply a bulk action to ids that are no longer
// in the user's view.
watch([statusFilter, priorityFilter, clientFilter, periodFilter, assigneeFilter, categoryFilter, sourceFilter, showSnoozed], () => {
  clearSelection()
})

// ── View toggle (table | kanban) ───────────────────────────────────
const view = useLocalStorage<'table' | 'kanban'>('advisor.view', 'table')

async function moveStatus(id: string, status: 'open' | 'in_progress' | 'done' | 'dismissed') {
  try {
    await apiFetch(`/api/advisor/recommendations/${id}`, {
      method: 'PATCH',
      body: { status },
    })
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Move failed',
      description: err?.data?.statusMessage ?? err?.message,
      color: 'error',
    })
  }
}

async function applyBulk(patch: Record<string, any>) {
  if (selection.value.size === 0) return
  bulkLoading.value = true
  const ids = Array.from(selection.value)
  try {
    const res = await apiFetch<{ updated: number; requested: number }>(
      '/api/advisor/recommendations/bulk',
      { method: 'POST', body: { ids, patch } }
    )
    if (res.updated < res.requested) {
      toast.add({
        title: 'Partial update',
        description: `Updated ${res.updated} of ${res.requested}. Some items couldn't be changed.`,
        color: 'warning',
      })
    } else {
      toast.add({ title: `Updated ${res.updated}`, color: 'success' })
    }
    clearSelection()
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Bulk update failed',
      description: err?.data?.statusMessage ?? err?.message,
      color: 'error',
    })
  } finally {
    bulkLoading.value = false
  }
}

// Helpers used in table cells (the drawer has its own copies for the
// helpers it needs internally — kept duplicated rather than promoted to
// a composable until a third surface needs them).
function priorityColor(p: string) {
  if (p === 'high') return 'error'
  if (p === 'medium') return 'warning'
  return 'neutral'
}

function statusColor(s: string) {
  if (s === 'done') return 'success'
  if (s === 'in_progress') return 'primary'
  if (s === 'dismissed') return 'neutral'
  return 'warning'
}

function statusLabel(s: string) {
  if (s === 'in_progress') return 'In progress'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function priorityLabel(p: string) {
  return p.charAt(0).toUpperCase() + p.slice(1)
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type Comment = {
  id: string
  recommendation_id: string
  author_id: string | null
  author_name: string | null
  author_avatar_url: string | null
  body: string
  created_at: string
  updated_at: string
}

// ── Drawer state + handlers ──────────────────────────────────────────
const drawerOpen = ref(false)
const drawerLoading = ref(false)
const drawerRec = ref<Recommendation | null>(null)
const drawerEvents = ref<RecommendationEvent[]>([])
const drawerOutcomes = ref<RecommendationOutcome[]>([])
const drawerSimilar = ref<SimilarMatch[]>([])
const drawerGraph = ref<GraphData | null>(null)
const drawerComments = ref<Comment[]>([])

// Current user + role check, used to gate comment edit/delete affordances
// in the drawer. Server enforces the actual permission.
const currentUser = ref<{ id: string; role?: string } | null>(null)

onMounted(async () => {
  currentUser.value = await apiFetch<{ id: string; role?: string } | null>('/api/auth/me').catch(() => null)
})

const currentUserId = computed(() => currentUser.value?.id ?? null)
const canPrivilegedEdit = computed(() => {
  const role = currentUser.value?.role
  return role === 'owner' || role === 'admin'
})

async function openDrawer(rec: Recommendation) {
  drawerOpen.value = true
  drawerLoading.value = true
  drawerRec.value = rec
  drawerSimilar.value = []
  drawerGraph.value = null
  drawerComments.value = []
  try {
    const res = await apiFetch<{ recommendation: Recommendation; events: RecommendationEvent[]; outcomes: RecommendationOutcome[]; comments: Comment[] }>(
      `/api/advisor/recommendations/${rec.id}`
    )
    drawerRec.value = res.recommendation
    drawerEvents.value = res.events
    drawerOutcomes.value = res.outcomes
    drawerComments.value = res.comments ?? []
    // Fetch related past advice + graph in the background — don't block
    // the drawer opening if Vectorize is slow or unavailable.
    apiFetch<{ matches: SimilarMatch[] }>(`/api/advisor/recommendations/similar`, {
      query: { id: rec.id, topK: 5 },
    })
      .then((r) => { drawerSimilar.value = r.matches ?? [] })
      .catch(() => { /* silent — similarity is a nice-to-have */ })
    apiFetch<GraphData>(`/api/advisor/recommendations/${rec.id}/graph`)
      .then((g) => { drawerGraph.value = g })
      .catch(() => { /* silent — graph is decorative */ })
  } catch (err: any) {
    toast.add({ title: 'Failed to load', description: err?.data?.statusMessage ?? err?.message, color: 'error' })
  } finally {
    drawerLoading.value = false
  }
}

async function onGraphNodeSelect(node: GraphNode) {
  if (node.type === 'similar' && node.meta?.recommendation_id) {
    const target = recommendations.value.find((r) => r.id === node.meta!.recommendation_id)
    if (target) {
      openDrawer(target)
    } else {
      // The similar rec isn't in the current filtered list — fetch detail directly.
      try {
        const res = await apiFetch<{ recommendation: Recommendation }>(
          `/api/advisor/recommendations/${node.meta.recommendation_id}`
        )
        openDrawer(res.recommendation)
      } catch {
        /* silent */
      }
    }
  }
}

// ── Manual create modal ────────────────────────────────────────────
const createModalOpen = ref(false)

// Metric registry mirrors server/utils/advisorMetrics.ts. Re-listed here
// because client-side imports of that file would pull a server-only h3
// dependency. Slice 6 / phase 2 may promote this to a shared module.
const METRIC_KEYS = [
  { key: 'netMarginMonth', label: 'Net margin (month)' },
  { key: 'netProfitMonth', label: 'Net profit (month)' },
  { key: 'netProfitYtd', label: 'Net profit (YTD)' },
  { key: 'revenueMonth', label: 'Revenue (month)' },
  { key: 'debtorDays', label: 'Debtor days' },
  { key: 'creditorDays', label: 'Creditor days' },
  { key: 'grossProfitPercent', label: 'Gross profit %' },
  { key: 'netProfitPercent', label: 'Net profit %' },
  { key: 'currentRatio', label: 'Current ratio' },
  { key: 'top1Share', label: 'Top-1 client share' },
  { key: 'top3Share', label: 'Top-3 client share' },
  { key: 'mrr', label: 'MRR' },
  { key: 'outstandingTotal', label: 'Outstanding A/R' },
  { key: 'overdueAmount', label: 'Overdue A/R' },
  { key: 'totalUnearned', label: 'Unearned revenue' },
]

async function onCreated(rec: Recommendation) {
  // Refresh the list so the new rec appears (subject to current filters)
  // and immediately open the drawer for editing.
  await refresh()
  openDrawer(rec)
}

async function onCommentsChanged() {
  if (!drawerRec.value) return
  // Refetch the detail to pick up new comments + the audit event row.
  try {
    const detail = await apiFetch<{
      events: RecommendationEvent[]
      outcomes: RecommendationOutcome[]
      comments: Comment[]
    }>(`/api/advisor/recommendations/${drawerRec.value.id}`)
    drawerEvents.value = detail.events
    drawerOutcomes.value = detail.outcomes
    drawerComments.value = detail.comments ?? []
    // Also refresh the list so the table's comment_count column updates.
    refresh()
  } catch {
    /* silent — toast already raised by the child component */
  }
}

async function patchRec(patch: Partial<Recommendation>) {
  if (!drawerRec.value) return
  const id = drawerRec.value.id
  try {
    const res = await apiFetch<{ recommendation: Recommendation }>(
      `/api/advisor/recommendations/${id}`,
      { method: 'PATCH', body: patch }
    )
    drawerRec.value = { ...drawerRec.value, ...res.recommendation }
    // Reload events so the new audit row shows up.
    const detail = await apiFetch<{ events: RecommendationEvent[]; outcomes: RecommendationOutcome[] }>(
      `/api/advisor/recommendations/${id}`
    )
    drawerEvents.value = detail.events
    drawerOutcomes.value = detail.outcomes
    refresh()
    toast.add({ title: 'Saved', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Save failed', description: err?.data?.statusMessage ?? err?.message, color: 'error' })
  }
}

// Human-readable label for the current scope chip.
const scopeLabel = computed(() => {
  if (clientFilter.value === 'all') return 'All scopes'
  if (clientFilter.value === 'agency') return 'Agency (own books)'
  const match = (clientsData.value ?? []).find((c) => c.id === clientFilter.value)
  return match?.name ?? 'Unknown client'
})

// ── Summary tiles ──
const summary = computed(() => {
  const list = recommendations.value
  return {
    total: list.length,
    high: list.filter((r) => r.priority === 'high').length,
    inProgress: list.filter((r) => r.status === 'in_progress').length,
    overdue: list.filter((r) => {
      if (!r.due_date) return false
      return new Date(r.due_date).getTime() < Date.now() && r.status !== 'done' && r.status !== 'dismissed'
    }).length,
  }
})
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Advisor backlog">
        <template #right>
          <USelectMenu
            v-model="clientFilter"
            :items="clientOptions"
            value-key="value"
            size="sm"
            class="w-56"
          >
            <template #leading>
              <UIcon name="i-lucide-target" class="size-4 text-muted" />
            </template>
          </USelectMenu>
          <UButtonGroup>
            <UButton
              :color="view === 'table' ? 'primary' : 'neutral'"
              :variant="view === 'table' ? 'solid' : 'outline'"
              size="sm"
              icon="i-lucide-list"
              @click="view = 'table'"
            >Table</UButton>
            <UButton
              :color="view === 'kanban' ? 'primary' : 'neutral'"
              :variant="view === 'kanban' ? 'solid' : 'outline'"
              size="sm"
              icon="i-lucide-kanban"
              @click="view = 'kanban'"
            >Kanban</UButton>
          </UButtonGroup>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            size="sm"
            @click="createModalOpen = true"
          >New</UButton>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4 p-4">
        <div v-if="clientFilter !== 'all'" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-focus" class="size-4" />
          <span>Scope:</span>
          <UBadge color="primary" variant="subtle" size="sm">{{ scopeLabel }}</UBadge>
          <button class="text-muted hover:text-default underline-offset-2 hover:underline" @click="clientFilter = 'all'">Clear</button>
        </div>

        <!-- Summary tiles -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <UCard>
            <p class="text-sm font-medium text-muted">Active</p>
            <p class="text-2xl font-bold mt-1">{{ summary.total }}</p>
          </UCard>
          <UCard>
            <p class="text-sm font-medium text-muted">High priority</p>
            <p class="text-2xl font-bold mt-1 text-red-500">{{ summary.high }}</p>
          </UCard>
          <UCard>
            <p class="text-sm font-medium text-muted">In progress</p>
            <p class="text-2xl font-bold mt-1 text-primary">{{ summary.inProgress }}</p>
          </UCard>
          <UCard>
            <p class="text-sm font-medium text-muted">Overdue</p>
            <p class="text-2xl font-bold mt-1 text-amber-500">{{ summary.overdue }}</p>
          </UCard>
        </div>

        <!-- Filters -->
        <AdvisorFilters
          v-model:status="statusFilter"
          v-model:priority="priorityFilter"
          v-model:client="clientFilter"
          v-model:period="periodFilter"
          v-model:assignee="assigneeFilter"
          v-model:category="categoryFilter"
          v-model:source="sourceFilter"
          v-model:show-snoozed="showSnoozed"
          :client-options="clientOptions"
          :period-options="periodOptions"
          :assignee-options="assigneeOptions"
        />

        <!-- Kanban view -->
        <AdvisorKanbanView
          v-if="view === 'kanban'"
          :recommendations="recommendations"
          @open="openDrawer"
          @move="moveStatus"
          @add="() => (createModalOpen = true)"
        />

        <!-- Table view -->
        <UCard v-else>
          <UTable
            :data="recommendations"
            :columns="columns"
            :loading="pending"
            class="cursor-pointer"
            @select="(_e: any, row: any) => openDrawer(row.original)"
          >
            <template #select-header>
              <span class="sr-only">Select</span>
            </template>

            <template #select-cell="{ row }">
              <UCheckbox
                :model-value="isSelected(row.original.id)"
                @update:model-value="toggleSelect(row.original.id)"
                @click.stop
              />
            </template>

            <template #priority-cell="{ row }">
              <UBadge :color="priorityColor(row.original.priority)" variant="subtle" size="sm">
                {{ priorityLabel(row.original.priority) }}
              </UBadge>
            </template>

            <template #category-cell="{ row }">
              <AdvisorCategoryBadge :category="row.original.category" size="sm" />
            </template>

            <template #title-cell="{ row }">
              <div class="space-y-0.5">
                <p class="font-medium text-sm">{{ row.original.title }}</p>
                <p class="text-sm text-muted truncate max-w-md">{{ row.original.action }}</p>
              </div>
            </template>

            <template #client-cell="{ row }">
              <span class="text-sm">{{ row.original.client_name ?? 'Agency' }}</span>
            </template>

            <template #period-cell="{ row }">
              <span class="text-sm text-muted">{{ row.original.period_label ?? '—' }}</span>
            </template>

            <template #assignee-cell="{ row }">
              <div v-if="row.original.assignee_name" class="flex items-center gap-2">
                <UAvatar
                  :src="row.original.assignee_avatar_url ?? undefined"
                  :alt="row.original.assignee_name"
                  size="xs"
                />
                <span class="text-sm">{{ row.original.assignee_name }}</span>
              </div>
              <span v-else class="text-sm text-muted">—</span>
            </template>

            <template #due_date-cell="{ row }">
              <div class="flex items-center gap-1.5">
                <span class="text-sm">{{ formatDate(row.original.due_date) }}</span>
                <UTooltip
                  v-if="row.original.snoozed_until"
                  :text="`Snoozed until ${formatDate(row.original.snoozed_until)}`"
                >
                  <UIcon name="i-lucide-bell-off" class="size-4 text-amber-500" />
                </UTooltip>
              </div>
            </template>

            <template #status-cell="{ row }">
              <UBadge :color="statusColor(row.original.status)" variant="subtle" size="sm">
                {{ statusLabel(row.original.status) }}
              </UBadge>
            </template>

            <template #empty>
              <div class="py-12 text-center text-sm text-muted">
                <UIcon name="i-lucide-sparkles" class="size-8 mx-auto text-muted mb-2" />
                <p>No recommendations match these filters.</p>
                <p class="text-sm mt-1">Generate an advisor report on <ULink to="/reports">/reports</ULink> to populate this backlog.</p>
              </div>
            </template>
          </UTable>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Manual create modal -->
  <AdvisorCreateModal
    v-model:open="createModalOpen"
    :clients="clientsData ?? []"
    :team-members="teamData?.members ?? []"
    :metric-keys="METRIC_KEYS"
    @created="onCreated"
  />

  <!-- Bulk action bar -->
  <AdvisorBulkActionBar
    :count="selection.size"
    :loading="bulkLoading"
    :team-members="teamData?.members ?? []"
    @apply="applyBulk"
    @clear="clearSelection"
  />

  <!-- Detail drawer (extracted to component) -->
  <AdvisorDrawer
    v-model:open="drawerOpen"
    :loading="drawerLoading"
    :rec="drawerRec"
    :events="drawerEvents"
    :outcomes="drawerOutcomes"
    :similar="drawerSimilar"
    :graph="drawerGraph"
    :team-members="teamData?.members ?? []"
    :comments="drawerComments"
    :current-user-id="currentUserId"
    :can-privileged-edit="canPrivilegedEdit"
    @patch="patchRec"
    @open-similar="openDrawer"
    @graph-select="onGraphNodeSelect"
    @comments-changed="onCommentsChanged"
  />
</template>
