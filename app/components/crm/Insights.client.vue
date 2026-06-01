<script setup lang="ts">
import { VisXYContainer, VisStackedBar, VisAxis, VisTooltip } from '@unovis/vue'

const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')

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
const { data: summary, pending } = useFetch<Summary>('/api/crm/analytics/summary', {
  query: summaryQuery, watch: [summaryQuery],
  default: () => ({ counts: { total: 0 }, funnel: [], winRate: { won: 0, lost: 0, open: 0, winRate: 0 }, weightedForecast: 0, openPipelineValue: 0, avgCycleDays: null, timeInStage: [] }),
})

interface PerfRow { owner_id: string | null, count: number, won: number, winRate: number, weightedForecast: number, wonValue: number }
const { data: perf } = useFetch<{ items: PerfRow[] }>('/api/crm/analytics/performance', {
  query: computed(() => ({ client_id: clientId.value })), watch: [clientId],
  default: () => ({ items: [] }),
})

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

    <CrmLeaderboard :client-id="clientId" />

    <div v-if="pending" class="text-xs text-muted">Loading…</div>
  </div>
</template>
