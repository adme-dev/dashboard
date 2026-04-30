<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

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

const { data, pending, refresh } = await useFetch<{ recommendations: Recommendation[] }>(
  '/api/advisor/recommendations',
  { query, server: false, default: () => ({ recommendations: [] }) }
)

const { data: clientsData } = await useFetch<Array<{ id: string; name: string }>>(
  '/api/agency/clients',
  { server: false, default: () => [] }
)

const { data: teamData } = await useFetch<{ members: Array<{ id: string; name: string; avatar_url?: string | null }> }>(
  '/api/agency/team-members',
  { server: false, default: () => ({ members: [] }) }
)

const { data: historyData } = await useFetch<{ reports: Array<{ period_key: string; period_label: string }> }>(
  '/api/ai/financial-advisor/history',
  { server: false, default: () => ({ reports: [] }) }
)

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
  { accessorKey: 'priority', header: 'Priority' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'title', header: 'Recommendation' },
  { accessorKey: 'client', header: 'Client' },
  { accessorKey: 'period', header: 'Period' },
  { accessorKey: 'assignee', header: 'Assignee' },
  { accessorKey: 'due_date', header: 'Due' },
  { accessorKey: 'status', header: 'Status' },
]

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

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Drawer state + handlers ──────────────────────────────────────────
const drawerOpen = ref(false)
const drawerLoading = ref(false)
const drawerRec = ref<Recommendation | null>(null)
const drawerEvents = ref<RecommendationEvent[]>([])
const drawerOutcomes = ref<RecommendationOutcome[]>([])
const drawerSimilar = ref<SimilarMatch[]>([])
const drawerGraph = ref<GraphData | null>(null)

async function openDrawer(rec: Recommendation) {
  drawerOpen.value = true
  drawerLoading.value = true
  drawerRec.value = rec
  drawerSimilar.value = []
  drawerGraph.value = null
  try {
    const res = await $fetch<{ recommendation: Recommendation; events: RecommendationEvent[]; outcomes: RecommendationOutcome[] }>(
      `/api/advisor/recommendations/${rec.id}`
    )
    drawerRec.value = res.recommendation
    drawerEvents.value = res.events
    drawerOutcomes.value = res.outcomes
    // Fetch related past advice + graph in the background — don't block
    // the drawer opening if Vectorize is slow or unavailable.
    $fetch<{ matches: SimilarMatch[] }>(`/api/advisor/recommendations/similar`, {
      query: { id: rec.id, topK: 5 },
    })
      .then((r) => { drawerSimilar.value = r.matches ?? [] })
      .catch(() => { /* silent — similarity is a nice-to-have */ })
    $fetch<GraphData>(`/api/advisor/recommendations/${rec.id}/graph`)
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
        const res = await $fetch<{ recommendation: Recommendation }>(
          `/api/advisor/recommendations/${node.meta.recommendation_id}`
        )
        openDrawer(res.recommendation)
      } catch {
        /* silent */
      }
    }
  }
}

async function patchRec(patch: Partial<Recommendation>) {
  if (!drawerRec.value) return
  const id = drawerRec.value.id
  try {
    const res = await $fetch<{ recommendation: Recommendation }>(
      `/api/advisor/recommendations/${id}`,
      { method: 'PATCH', body: patch }
    )
    drawerRec.value = { ...drawerRec.value, ...res.recommendation }
    // Reload events so the new audit row shows up.
    const detail = await $fetch<{ events: RecommendationEvent[]; outcomes: RecommendationOutcome[] }>(
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
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4 p-4">
        <div v-if="clientFilter !== 'all'" class="flex items-center gap-2 text-xs text-muted">
          <UIcon name="i-lucide-focus" class="size-3.5" />
          <span>Scope:</span>
          <UBadge color="primary" variant="subtle" size="xs">{{ scopeLabel }}</UBadge>
          <button class="text-muted hover:text-default underline-offset-2 hover:underline" @click="clientFilter = 'all'">Clear</button>
        </div>

        <!-- Summary tiles -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider">Active</p>
            <p class="text-2xl font-bold mt-1">{{ summary.total }}</p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider">High priority</p>
            <p class="text-2xl font-bold mt-1 text-red-500">{{ summary.high }}</p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider">In progress</p>
            <p class="text-2xl font-bold mt-1 text-primary">{{ summary.inProgress }}</p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider">Overdue</p>
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

        <!-- Table -->
        <UCard>
          <UTable
            :data="recommendations"
            :columns="columns"
            :loading="pending"
            class="cursor-pointer"
            @select="(_e: any, row: any) => openDrawer(row.original)"
          >
            <template #priority-cell="{ row }">
              <UBadge :color="priorityColor(row.original.priority)" variant="subtle" size="xs">
                {{ row.original.priority }}
              </UBadge>
            </template>

            <template #category-cell="{ row }">
              <AdvisorCategoryBadge :category="row.original.category" />
            </template>

            <template #title-cell="{ row }">
              <div class="space-y-0.5">
                <p class="font-medium text-sm">{{ row.original.title }}</p>
                <p class="text-xs text-muted truncate max-w-md">{{ row.original.action }}</p>
              </div>
            </template>

            <template #client-cell="{ row }">
              <span class="text-xs">{{ row.original.client_name ?? 'Agency' }}</span>
            </template>

            <template #period-cell="{ row }">
              <span class="text-xs text-muted">{{ row.original.period_label ?? '—' }}</span>
            </template>

            <template #assignee-cell="{ row }">
              <div v-if="row.original.assignee_name" class="flex items-center gap-2">
                <UAvatar
                  :src="row.original.assignee_avatar_url ?? undefined"
                  :alt="row.original.assignee_name"
                  size="2xs"
                />
                <span class="text-xs">{{ row.original.assignee_name }}</span>
              </div>
              <span v-else class="text-xs text-muted">—</span>
            </template>

            <template #due_date-cell="{ row }">
              <div class="flex items-center gap-1.5">
                <span class="text-xs">{{ formatDate(row.original.due_date) }}</span>
                <UTooltip
                  v-if="row.original.snoozed_until"
                  :text="`Snoozed until ${formatDate(row.original.snoozed_until)}`"
                >
                  <UIcon name="i-lucide-bell-off" class="size-3.5 text-amber-500" />
                </UTooltip>
              </div>
            </template>

            <template #status-cell="{ row }">
              <UBadge :color="statusColor(row.original.status)" variant="subtle" size="xs">
                {{ statusLabel(row.original.status) }}
              </UBadge>
            </template>

            <template #empty>
              <div class="py-12 text-center text-sm text-muted">
                <UIcon name="i-lucide-sparkles" class="size-8 mx-auto text-muted mb-2" />
                <p>No recommendations match these filters.</p>
                <p class="text-xs mt-1">Generate an advisor report on <ULink to="/reports">/reports</ULink> to populate this backlog.</p>
              </div>
            </template>
          </UTable>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

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
    @patch="patchRec"
    @open-similar="openDrawer"
    @graph-select="onGraphNodeSelect"
  />
</template>
