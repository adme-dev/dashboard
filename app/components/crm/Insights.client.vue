<script setup lang="ts">
import { VisXYContainer, VisStackedBar, VisAxis, VisTooltip } from '@unovis/vue'

const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>

// Lightweight period filter -> `from` ISO date.
const period = ref<'all' | '30' | '90'>('all')
const periodItems = [
  { label: 'All time', value: 'all' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
]
const fromIso = computed(() => {
  if (period.value === 'all') return undefined
  const d = new Date()
  d.setDate(d.getDate() - Number(period.value))
  return d.toISOString()
})

interface FunnelRow { stage_id: string, name: string, count: number, value: number }
interface Summary {
  counts: { total: number }
  funnel: FunnelRow[]
  winRate: { won: number, lost: number, open: number, winRate: number }
  weightedForecast: number
  openPipelineValue: number
  avgCycleDays: number | null
  timeInStage: { stage_id: string, avgDays: number }[]
}
const summaryQuery = computed(() => ({ client_id: clientId.value, ...(fromIso.value ? { from: fromIso.value } : {}) }))
const defaultSummary = (): Summary => ({ counts: { total: 0 }, funnel: [], winRate: { won: 0, lost: 0, open: 0, winRate: 0 }, weightedForecast: 0, openPipelineValue: 0, avgCycleDays: null, timeInStage: [] })
const summary = ref<Summary>(defaultSummary())
const pending = ref(false)

async function refreshSummary() {
  pending.value = true
  try {
    summary.value = await apiFetch<Summary>('/api/crm/analytics/summary', { query: summaryQuery.value })
  } finally {
    pending.value = false
  }
}

watch(summaryQuery, () => {
  refreshSummary()
}, { immediate: true })

interface PerfRow { owner_id: string | null, count: number, won: number, winRate: number, weightedForecast: number, wonValue: number }
const perf = ref<{ items: PerfRow[] }>({ items: [] })
const clientQuery = computed(() => ({ client_id: clientId.value }))

async function refreshPerf() {
  perf.value = await apiFetch<{ items: PerfRow[] }>('/api/crm/analytics/performance', { query: clientQuery.value })
}

watch(clientQuery, () => {
  refreshPerf()
}, { immediate: true })

// CRM adoption — instruments the Phase 1–3 success metrics (P4.0b), agency-only.
interface Adoption {
  oppTaskCoveragePct: number
  peopleScoredPct: number
  savedViewsPerUser: number
  duplicateRatePct: number
  raw: { activeOpps: number, activeOppsWithOpenTask: number, people: number, peopleWithScore: number, views: number, viewUsers: number, contacts: number, merges: number }
}
const defaultAdoption = (): Adoption => ({ oppTaskCoveragePct: 0, peopleScoredPct: 0, savedViewsPerUser: 0, duplicateRatePct: 0, raw: { activeOpps: 0, activeOppsWithOpenTask: 0, people: 0, peopleWithScore: 0, views: 0, viewUsers: 0, contacts: 0, merges: 0 } })
const adoption = ref<Adoption>(defaultAdoption())

async function refreshAdoption() {
  adoption.value = await apiFetch<Adoption>('/api/crm/analytics/adoption', { query: clientQuery.value })
}

watch(clientQuery, () => {
  refreshAdoption()
}, { immediate: true })
const adoptionCards = computed(() => {
  const a = adoption.value
  return [
    { label: 'Open deals with a next step', value: `${a.oppTaskCoveragePct}%`, sub: `${a.raw.activeOppsWithOpenTask}/${a.raw.activeOpps} have an open task`, icon: 'i-lucide-list-checks' },
    { label: 'People scored', value: `${a.peopleScoredPct}%`, sub: `${a.raw.peopleWithScore}/${a.raw.people} contacts`, icon: 'i-lucide-gauge' },
    { label: 'Saved views / user', value: `${a.savedViewsPerUser}`, sub: `${a.raw.views} views · ${a.raw.viewUsers} ${a.raw.viewUsers === 1 ? 'user' : 'users'}`, icon: 'i-lucide-bookmark' },
    { label: 'Duplicate rate', value: `${a.duplicateRatePct}%`, sub: `${a.raw.merges} merged away`, icon: 'i-lucide-git-merge' },
  ]
})

// Churn risk — customers whose health score is At risk / Critical (P4.2).
interface AtRiskRow {
  target_type: 'person' | 'company'
  target_id: string
  total_score: number
  grade: 'Hot' | 'Warm' | 'Cold'
  name: string | null
}
const atRisk = ref<{ items: AtRiskRow[] }>({ items: [] })

async function refreshAtRisk() {
  atRisk.value = await apiFetch<{ items: AtRiskRow[] }>('/api/crm/health/at-risk', { query: clientQuery.value })
}

watch(clientQuery, () => {
  refreshAtRisk()
}, { immediate: true })
const healthGradeLabel: Record<string, string> = { Warm: 'At risk', Cold: 'Critical' }
const healthGradeColor: Record<string, string> = { Warm: 'warning', Cold: 'error' }

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
const pct = (n: number) => `${Math.round(n * 100)}%`

const funnelData = computed(() => (summary.value?.funnel ?? []).map((f, i) => ({ x: i, ...f })))
const stageName = (id: string) => summary.value?.funnel.find(f => f.stage_id === id)?.name ?? id

const cards = computed(() => [
  { label: 'Win rate', value: pct(summary.value?.winRate.winRate ?? 0), sub: `${summary.value?.winRate.won ?? 0}W / ${summary.value?.winRate.lost ?? 0}L`, icon: 'i-lucide-trophy' },
  { label: 'Open pipeline', value: money.format(summary.value?.openPipelineValue ?? 0), sub: `${summary.value?.winRate.open ?? 0} open`, icon: 'i-lucide-layers' },
  { label: 'Weighted forecast', value: money.format(summary.value?.weightedForecast ?? 0), sub: 'probability-adjusted', icon: 'i-lucide-trending-up' },
  { label: 'Avg cycle', value: summary.value?.avgCycleDays != null ? `${summary.value.avgCycleDays}d` : '—', sub: 'create → close', icon: 'i-lucide-timer' },
])

const perfColumns = [
  { accessorKey: 'owner_id', header: 'Owner' },
  { accessorKey: 'count', header: 'Deals' },
  { accessorKey: 'winRate', header: 'Win rate' },
  { accessorKey: 'weightedForecast', header: 'Forecast' },
  { accessorKey: 'wonValue', header: 'Won' },
]
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm text-muted">Cycle-time metrics reflect stage changes recorded from when this feature shipped.</p>
      <USelectMenu v-model="period" :items="periodItems" value-key="value" size="sm" class="w-40" />
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium">CRM adoption</span>
          <span class="text-xs text-muted">How thoroughly the team is using the CRM</span>
        </div>
      </template>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="c in adoptionCards" :key="c.label" class="flex items-start justify-between">
          <div>
            <p class="text-xs text-muted">{{ c.label }}</p>
            <p class="text-2xl font-bold tracking-tight mt-1">{{ c.value }}</p>
            <p class="text-xs text-muted mt-0.5">{{ c.sub }}</p>
          </div>
          <UIcon :name="c.icon" class="size-5 text-muted" />
        </div>
      </div>
    </UCard>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard v-for="c in cards" :key="c.label">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-xs text-muted">{{ c.label }}</p>
            <p class="text-2xl font-bold tracking-tight mt-1">{{ c.value }}</p>
            <p class="text-xs text-muted mt-0.5">{{ c.sub }}</p>
          </div>
          <UIcon :name="c.icon" class="size-5 text-muted" />
        </div>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <span class="text-sm font-medium">Pipeline by stage</span>
      </template>
      <VisXYContainer v-if="funnelData.length" :data="funnelData" :height="240">
        <VisStackedBar :x="(d: any) => d.x" :y="(d: any) => d.value" color="var(--ui-primary)" :rounded-corners="4" />
        <VisAxis type="x" :tick-format="(i: number) => funnelData[i]?.name ?? ''" />
        <VisAxis type="y" />
        <VisTooltip />
      </VisXYContainer>
      <p v-else class="text-sm text-muted text-center py-8">No opportunities in this range.</p>
    </UCard>

    <div class="grid lg:grid-cols-2 gap-4">
      <UCard>
        <template #header><span class="text-sm font-medium">Avg time in stage</span></template>
        <div v-if="summary?.timeInStage.length" class="space-y-2">
          <div v-for="t in summary.timeInStage" :key="t.stage_id" class="flex items-center justify-between text-sm">
            <span class="text-muted">{{ stageName(t.stage_id) }}</span>
            <span class="tabular-nums">{{ t.avgDays }}d</span>
          </div>
        </div>
        <p v-else class="text-sm text-muted text-center py-6">No stage history yet — accrues as deals move.</p>
      </UCard>

      <UCard>
        <template #header><span class="text-sm font-medium">By owner</span></template>
        <UTable :data="perf?.items ?? []" :columns="perfColumns">
          <template #owner_id-cell="{ row }">
            <span class="text-muted">{{ row.original.owner_id ? row.original.owner_id.slice(0, 8) : 'Unassigned' }}</span>
          </template>
          <template #winRate-cell="{ row }">{{ pct(row.original.winRate) }}</template>
          <template #weightedForecast-cell="{ row }">{{ money.format(row.original.weightedForecast) }}</template>
          <template #wonValue-cell="{ row }">{{ money.format(row.original.wonValue) }}</template>
          <template #empty><div class="py-6 text-center text-sm text-muted">No deals yet.</div></template>
        </UTable>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium">Churn risk</span>
          <span class="text-xs text-muted">Customers with declining health — worst first</span>
        </div>
      </template>
      <div v-if="(atRisk?.items ?? []).length" class="divide-y divide-default">
        <div v-for="r in atRisk!.items" :key="`${r.target_type}-${r.target_id}`" class="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <div class="flex items-center gap-2 min-w-0">
            <UIcon :name="r.target_type === 'company' ? 'i-lucide-building-2' : 'i-lucide-user'" class="size-4 shrink-0 text-muted" />
            <span class="truncate text-sm">{{ r.name || 'Unnamed' }}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xs tabular-nums text-muted">{{ r.total_score }}</span>
            <UBadge :color="(healthGradeColor[r.grade] as any)" variant="subtle" size="sm">{{ healthGradeLabel[r.grade] }}</UBadge>
          </div>
        </div>
      </div>
      <p v-else class="text-sm text-muted text-center py-6">No customers flagged at risk — health scores accrue from the hourly sweep.</p>
    </UCard>

    <CrmLeaderboard :client-id="clientId" />

    <div v-if="pending" class="text-xs text-muted">Loading…</div>
  </div>
</template>
