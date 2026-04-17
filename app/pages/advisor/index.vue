<script setup lang="ts">
definePageMeta({ layout: 'agency' })

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

const { data: teamData } = await useFetch<{ members: Array<{ id: string; name: string }> }>(
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
  { accessorKey: 'title', header: 'Recommendation' },
  { accessorKey: 'client', header: 'Client' },
  { accessorKey: 'period', header: 'Period' },
  { accessorKey: 'assignee', header: 'Assignee' },
  { accessorKey: 'due_date', header: 'Due' },
  { accessorKey: 'status', header: 'Status' },
]

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

// Mirrors the unit/label set in server/utils/advisorMetrics.ts so we can
// format metric values consistently in the UI without a round-trip.
const METRIC_META: Record<string, { label: string; unit: 'percent' | 'days' | 'currency' | 'ratio' | 'count' }> = {
  netMarginMonth: { label: 'Net margin (month)', unit: 'percent' },
  netProfitMonth: { label: 'Net profit (month)', unit: 'currency' },
  netProfitYtd: { label: 'Net profit (YTD)', unit: 'currency' },
  revenueMonth: { label: 'Revenue (month)', unit: 'currency' },
  debtorDays: { label: 'Debtor days', unit: 'days' },
  creditorDays: { label: 'Creditor days', unit: 'days' },
  grossProfitPercent: { label: 'Gross profit %', unit: 'percent' },
  netProfitPercent: { label: 'Net profit %', unit: 'percent' },
  currentRatio: { label: 'Current ratio', unit: 'ratio' },
  top1Share: { label: 'Top-1 client share', unit: 'percent' },
  top3Share: { label: 'Top-3 client share', unit: 'percent' },
  mrr: { label: 'MRR', unit: 'currency' },
  outstandingTotal: { label: 'Outstanding A/R', unit: 'currency' },
  overdueAmount: { label: 'Overdue A/R', unit: 'currency' },
  totalUnearned: { label: 'Unearned revenue', unit: 'currency' },
}

function formatMetric(value: number | null | undefined, metric: string | null | undefined): string {
  if (value == null) return '—'
  const n = Number(value)
  const unit = (metric && METRIC_META[metric]?.unit) || 'count'
  if (unit === 'currency') return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
  if (unit === 'percent') return `${n.toFixed(1)}%`
  if (unit === 'days') return `${Math.round(n)} days`
  if (unit === 'ratio') return n.toFixed(2)
  return n.toLocaleString()
}

function formatDelta(delta: number | null | undefined, metric: string | null | undefined): string {
  if (delta == null) return '—'
  const n = Number(delta)
  const sign = n > 0 ? '+' : ''
  const unit = (metric && METRIC_META[metric]?.unit) || 'count'
  if (unit === 'currency') return `${sign}${n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}`
  if (unit === 'percent') return `${sign}${n.toFixed(1)} pts`
  if (unit === 'days') return `${sign}${Math.round(n)} d`
  if (unit === 'ratio') return `${sign}${n.toFixed(2)}`
  return `${sign}${n.toLocaleString()}`
}

function deltaDirection(delta: number | null | undefined, direction: 'up' | 'down' | null | undefined): 'good' | 'bad' | 'neutral' {
  if (delta == null || delta === 0) return 'neutral'
  if (!direction) return delta > 0 ? 'good' : 'bad'
  if (direction === 'up') return delta > 0 ? 'good' : 'bad'
  return delta < 0 ? 'good' : 'bad'
}

// ── Detail drawer ──
type SimilarMatch = Recommendation & { score: number }

type GraphNode = {
  id: string
  type: 'recommendation' | 'client' | 'report' | 'metric' | 'outcome' | 'event' | 'assignee' | 'similar'
  label: string
  sublabel?: string
  meta?: Record<string, any>
}
type GraphData = { nodes: GraphNode[]; edges: Array<{ from: string; to: string; type: string; label?: string }> }

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

const outcomeNotesDraft = ref('')
watch(drawerRec, (v) => { outcomeNotesDraft.value = v?.outcome_notes ?? '' }, { immediate: true })

const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Done', value: 'done' },
  { label: 'Dismissed', value: 'dismissed' },
]

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
]

const UNASSIGNED = '__unassigned__'
const assigneeDrawerOptions = computed(() => ([
  { label: 'Unassigned', value: UNASSIGNED },
  ...(teamData.value?.members ?? []).map((m) => ({ label: m.name, value: m.id })),
]))

function prettyEvent(e: RecommendationEvent) {
  if (e.event_type === 'updated' && e.payload) {
    const keys = Object.keys(e.payload)
    if (keys.length === 1) {
      const k = keys[0]!
      const change = e.payload[k]
      return `${k.replace(/_/g, ' ')}: ${change.from ?? '—'} → ${change.to ?? '—'}`
    }
    return `Updated ${keys.length} fields`
  }
  return e.event_type
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
        <UCard>
          <div class="flex flex-wrap gap-2 items-center">
            <UButtonGroup>
              <UButton
                v-for="o in [
                  { label: 'Active', value: 'active' },
                  { label: 'Open', value: 'open' },
                  { label: 'In progress', value: 'in_progress' },
                  { label: 'Done', value: 'done' },
                  { label: 'Dismissed', value: 'dismissed' },
                  { label: 'All', value: 'all' },
                ]"
                :key="o.value"
                :color="statusFilter === o.value ? 'primary' : 'neutral'"
                :variant="statusFilter === o.value ? 'solid' : 'outline'"
                size="sm"
                @click="statusFilter = o.value as any"
              >{{ o.label }}</UButton>
            </UButtonGroup>

            <div class="grow" />

            <USelectMenu
              v-model="priorityFilter"
              :items="[{ label: 'All priorities', value: 'all' }, ...priorityOptions]"
              value-key="value"
              size="sm"
              class="w-40"
            />
            <USelectMenu
              v-model="clientFilter"
              :items="clientOptions"
              value-key="value"
              size="sm"
              class="w-52"
            />
            <USelectMenu
              v-model="periodFilter"
              :items="periodOptions"
              value-key="value"
              size="sm"
              class="w-44"
            />
            <USelectMenu
              v-model="assigneeFilter"
              :items="assigneeOptions"
              value-key="value"
              size="sm"
              class="w-48"
            />
          </div>
        </UCard>

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
              <span class="text-xs">{{ formatDate(row.original.due_date) }}</span>
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

  <!-- Detail drawer -->
  <USlideover v-model:open="drawerOpen" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div v-if="drawerRec" class="flex flex-col h-full">
        <div class="flex items-start justify-between p-5 border-b border-default">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <UBadge :color="priorityColor(drawerRec.priority)" variant="subtle" size="xs">{{ drawerRec.priority }}</UBadge>
              <UBadge :color="statusColor(drawerRec.status)" variant="subtle" size="xs">{{ statusLabel(drawerRec.status) }}</UBadge>
              <span class="text-xs text-muted">{{ drawerRec.period_label ?? 'Unlinked' }}</span>
            </div>
            <h3 class="font-semibold text-lg mt-1">{{ drawerRec.title }}</h3>
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="drawerOpen = false" />
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-5">
          <!-- Action & impact -->
          <div class="space-y-2">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider">Recommended action</p>
            <p class="text-sm leading-relaxed">{{ drawerRec.action }}</p>
            <p v-if="drawerRec.impact" class="text-sm text-primary">Impact: {{ drawerRec.impact }}</p>
          </div>

          <!-- Controls grid -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs text-muted mb-1">Status</p>
              <USelectMenu
                :model-value="drawerRec.status"
                :items="statusOptions"
                value-key="value"
                size="sm"
                @update:model-value="(v: string) => patchRec({ status: v as any })"
              />
            </div>
            <div>
              <p class="text-xs text-muted mb-1">Priority</p>
              <USelectMenu
                :model-value="drawerRec.priority"
                :items="priorityOptions"
                value-key="value"
                size="sm"
                @update:model-value="(v: string) => patchRec({ priority: v as any })"
              />
            </div>
            <div>
              <p class="text-xs text-muted mb-1">Assignee</p>
              <USelectMenu
                :model-value="drawerRec.assigned_to ?? UNASSIGNED"
                :items="assigneeDrawerOptions"
                value-key="value"
                size="sm"
                @update:model-value="(v: string) => patchRec({ assigned_to: (v === UNASSIGNED ? null : v) as any })"
              />
            </div>
            <div>
              <p class="text-xs text-muted mb-1">Due date</p>
              <UInput
                :model-value="drawerRec.due_date ?? ''"
                type="date"
                size="sm"
                @change="(e: Event) => patchRec({ due_date: (e.target as HTMLInputElement).value || null as any })"
              />
            </div>
          </div>

          <!-- Outcome notes -->
          <div>
            <p class="text-xs text-muted mb-1">Outcome notes</p>
            <UTextarea
              v-model="outcomeNotesDraft"
              :rows="5"
              size="sm"
              placeholder="What happened after acting on this?"
            />
            <div class="flex justify-end mt-2">
              <UButton
                size="xs"
                :disabled="outcomeNotesDraft === (drawerRec.outcome_notes ?? '')"
                @click="patchRec({ outcome_notes: outcomeNotesDraft })"
              >Save notes</UButton>
            </div>
          </div>

          <!-- Relationship graph -->
          <div v-if="drawerGraph && drawerGraph.nodes.length > 1">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-2">Relationships</p>
            <AdvisorGraph :data="drawerGraph" @select="onGraphNodeSelect" />
          </div>

          <!-- Related past advice -->
          <div v-if="drawerSimilar.length">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-2">Related past advice</p>
            <div class="space-y-2">
              <div
                v-for="m in drawerSimilar"
                :key="m.id"
                class="p-3 rounded-lg border border-default space-y-1 cursor-pointer hover:bg-elevated/60 transition-colors"
                @click="openDrawer(m)"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium text-sm truncate">{{ m.title }}</p>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <UBadge :color="statusColor(m.status)" variant="subtle" size="xs">{{ statusLabel(m.status) }}</UBadge>
                    <span class="text-[10px] text-muted font-mono">{{ (m.score * 100).toFixed(0) }}%</span>
                  </div>
                </div>
                <p class="text-xs text-muted truncate">{{ m.action }}</p>
                <div class="flex items-center gap-2 text-[10px] text-muted">
                  <span v-if="m.period_label">{{ m.period_label }}</span>
                  <span v-if="m.client_name">· {{ m.client_name }}</span>
                  <span v-if="m.assignee_name">· {{ m.assignee_name }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Outcomes / impact attribution -->
          <div v-if="drawerRec.target_metric || drawerOutcomes.length">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-2">Impact attribution</p>

            <div v-if="drawerRec.target_metric" class="flex items-center justify-between p-3 rounded-lg border border-default mb-2">
              <div>
                <p class="text-xs text-muted">Tracking</p>
                <p class="text-sm font-medium">{{ METRIC_META[drawerRec.target_metric]?.label ?? drawerRec.target_metric }}</p>
              </div>
              <div class="text-right">
                <p class="text-xs text-muted flex items-center gap-1 justify-end">
                  Target <UIcon :name="drawerRec.target_direction === 'up' ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'" class="size-3" />
                </p>
                <p class="text-sm font-mono">Baseline: {{ formatMetric(drawerRec.baseline_metric_value, drawerRec.target_metric) }}</p>
              </div>
            </div>

            <div v-if="drawerOutcomes.length" class="space-y-2">
              <div
                v-for="o in drawerOutcomes"
                :key="o.id"
                class="p-3 rounded-lg border border-default"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <UBadge color="neutral" variant="subtle" size="xs">Day {{ o.days_after_action ?? '—' }}</UBadge>
                    <span class="text-[10px] text-muted">{{ formatDate(o.measured_at) }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-xs text-muted font-mono">{{ formatMetric(drawerRec.baseline_metric_value, drawerRec.target_metric) }}</span>
                    <UIcon name="i-lucide-arrow-right" class="size-3 text-muted" />
                    <span class="text-sm font-semibold font-mono">{{ formatMetric(o.metric_value, drawerRec.target_metric) }}</span>
                  </div>
                </div>
                <div
                  v-if="o.metric_delta != null"
                  class="mt-1 text-right text-xs font-medium"
                  :class="{
                    'text-emerald-500': deltaDirection(o.metric_delta, drawerRec.target_direction) === 'good',
                    'text-red-500': deltaDirection(o.metric_delta, drawerRec.target_direction) === 'bad',
                    'text-muted': deltaDirection(o.metric_delta, drawerRec.target_direction) === 'neutral',
                  }"
                >
                  {{ formatDelta(o.metric_delta, drawerRec.target_metric) }}
                  <span v-if="deltaDirection(o.metric_delta, drawerRec.target_direction) === 'good'" class="ml-1">✓ target direction</span>
                  <span v-else-if="deltaDirection(o.metric_delta, drawerRec.target_direction) === 'bad'" class="ml-1">✗ wrong direction</span>
                </div>
                <p v-if="o.notes" class="mt-1 text-[11px] text-muted italic">{{ o.notes }}</p>
              </div>
            </div>

            <div
              v-else-if="drawerRec.target_metric && drawerRec.status === 'done' && drawerRec.acted_at"
              class="p-3 rounded-lg border border-dashed border-default text-xs text-muted text-center"
            >
              Pending measurement — first checkpoint 30 days after action.
            </div>
          </div>

          <!-- Event log -->
          <div v-if="drawerEvents.length">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-2">Activity</p>
            <div class="space-y-2">
              <div v-for="e in drawerEvents" :key="e.id" class="flex gap-2 items-start text-xs">
                <UAvatar v-if="e.actor_name" :alt="e.actor_name" :src="e.actor_avatar_url ?? undefined" size="2xs" />
                <UIcon v-else name="i-lucide-bot" class="size-4 mt-0.5 text-muted" />
                <div class="flex-1 min-w-0">
                  <p><span class="font-medium">{{ e.actor_name ?? 'System' }}</span> <span class="text-muted">{{ prettyEvent(e) }}</span></p>
                  <p class="text-[10px] text-muted">{{ formatDate(e.created_at) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Metadata footer -->
          <div class="pt-4 border-t border-default space-y-1 text-xs text-muted">
            <p>Created {{ formatDate(drawerRec.created_at) }}</p>
            <p v-if="drawerRec.acted_at">Acted {{ formatDate(drawerRec.acted_at) }}</p>
            <p v-if="drawerRec.client_name">Client: {{ drawerRec.client_name }}</p>
          </div>
        </div>
      </div>
      <div v-else-if="drawerLoading" class="p-5 space-y-3">
        <USkeleton class="h-4 w-2/3" />
        <USkeleton class="h-20" />
      </div>
    </template>
  </USlideover>
</template>
