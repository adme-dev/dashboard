<script setup lang="ts">
import {
  benchmarkBadge,
  benchmarkMarkerPct,
  leaderboardRows,
  type BenchmarkPortfolio,
  type BenchmarkMetricKey,
  type LeaderboardClient
} from '~~/app/utils/analyticsBenchmarks'

const props = defineProps<{ startDate: string, endDate: string, clientId?: string | null }>()
const { fmtCurrency, fmtPercent } = useAnalytics()

interface MetricBlock {
  lowerIsBetter: boolean
  portfolio: BenchmarkPortfolio
  client: { value: number, percentileRank: number | null } | null
}
interface BenchmarksResponse {
  window: { startDate: string, endDate: string }
  clientCount: number
  metrics: Record<BenchmarkMetricKey, MetricBlock>
  clients: LeaderboardClient[]
}

const { data, status } = await useFetch<BenchmarksResponse>('/api/agency/analytics/internal-benchmarks', {
  query: {
    startDate: () => props.startDate,
    endDate: () => props.endDate,
    clientId: () => props.clientId ?? undefined
  },
  watch: [() => props.startDate, () => props.endDate, () => props.clientId]
})

const loading = computed(() => status.value === 'pending')
const hasClient = computed(() => !!props.clientId)

const METRICS: Array<{ key: BenchmarkMetricKey, label: string, kind: 'currency' | 'percent' }> = [
  { key: 'engagementRate', label: 'Engagement rate', kind: 'percent' },
  { key: 'cvr', label: 'Conversion rate', kind: 'percent' },
  { key: 'cpl', label: 'Cost per lead', kind: 'currency' },
  { key: 'cpa', label: 'Cost per acquisition', kind: 'currency' }
]

function fmtVal(v: number | null, kind: 'currency' | 'percent'): string {
  if (v == null) return '—'
  return kind === 'currency' ? fmtCurrency(v, 2) : fmtPercent(v * 100)
}

// Client-standing cards
const cards = computed(() => {
  if (!data.value || !hasClient.value) return []
  return METRICS.map((m) => {
    const block = data.value!.metrics[m.key]
    const badge = block?.client ? benchmarkBadge(block.client.percentileRank, block.lowerIsBetter) : null
    return {
      ...m,
      value: block?.client?.value ?? null,
      median: block?.portfolio?.median ?? null,
      badge,
      markerPct: block?.client ? benchmarkMarkerPct(block.client.value, block.portfolio) : null,
      lowerIsBetter: block?.lowerIsBetter ?? false
    }
  })
})

// Leaderboard (no client selected)
const leaderboardMetric = ref<BenchmarkMetricKey>('cpl')
const leaderboard = computed(() => {
  if (!data.value || hasClient.value) return []
  const block = data.value.metrics[leaderboardMetric.value]
  return leaderboardRows(data.value.clients, leaderboardMetric.value, block?.lowerIsBetter ?? false)
})
const leaderboardKind = computed(() => METRICS.find(m => m.key === leaderboardMetric.value)?.kind ?? 'currency')
const metricMenuItems = METRICS.map(m => ({ label: m.label, value: m.key }))

const leaderboardColumns = [
  { accessorKey: 'rank', header: '#' },
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'value', header: 'Value' }
]
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-gauge" class="text-primary" />
        <span class="font-semibold">Internal Benchmarks</span>
        <UTooltip text="How this client compares to the rest of the portfolio over the selected window. Engagement & conversion rates are higher-is-better; CPL & CPA are lower-is-better.">
          <UIcon name="i-lucide-info" class="text-muted" />
        </UTooltip>
      </div>
    </template>

    <div v-if="loading" class="py-10 text-center text-muted text-sm">
      Loading benchmarks…
    </div>

    <div v-else-if="!data || data.clientCount === 0" class="py-10 text-center text-muted text-sm">
      Not enough portfolio data to benchmark in this window.
    </div>

    <!-- Client standing -->
    <div v-else-if="hasClient" class="space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="c in cards" :key="c.key" class="rounded-lg bg-elevated p-4">
          <p class="text-xs text-muted">{{ c.label }}</p>
          <p class="text-xl font-semibold mt-1">{{ fmtVal(c.value, c.kind) }}</p>
          <div class="flex items-center gap-2 mt-2">
            <UBadge v-if="c.badge" :color="c.badge.tone" variant="subtle" size="sm">
              {{ c.badge.label }}
            </UBadge>
            <span class="text-xs text-muted">med {{ fmtVal(c.median, c.kind) }}</span>
          </div>
        </div>
      </div>

      <!-- Distribution bars -->
      <div class="space-y-4">
        <div v-for="c in cards" :key="`bar-${c.key}`">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-medium text-default">{{ c.label }}</span>
            <span class="text-xs text-muted">{{ c.lowerIsBetter ? 'lower is better' : 'higher is better' }}</span>
          </div>
          <div class="relative h-3 rounded-full" :class="c.lowerIsBetter
            ? 'bg-gradient-to-r from-emerald-500 to-red-500'
            : 'bg-gradient-to-r from-red-500 to-emerald-500'">
            <div
              v-if="c.markerPct !== null"
              class="absolute -top-1 w-2.5 h-5 rounded-sm bg-inverted border-2 border-default"
              :style="{ left: `calc(${c.markerPct}% - 5px)` }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Agency leaderboard -->
    <div v-else class="space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-muted">Ranking {{ data.clientCount }} clients</p>
        <USelectMenu
          v-model="leaderboardMetric"
          :items="metricMenuItems"
          value-key="value"
          size="xs"
          class="w-48"
        />
      </div>
      <UTable :data="leaderboard" :columns="leaderboardColumns">
        <template #rank-cell="{ row }">
          <span class="text-muted">{{ row.original.rank ?? '—' }}</span>
        </template>
        <template #value-cell="{ row }">
          {{ fmtVal(row.original.value, leaderboardKind) }}
        </template>
      </UTable>
    </div>
  </UCard>
</template>
