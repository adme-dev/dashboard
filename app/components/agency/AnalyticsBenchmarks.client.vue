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
const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>

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
  degraded?: boolean
  warnings?: string[]
}

const query = computed(() => {
  const q: Record<string, string> = {
    startDate: props.startDate,
    endDate: props.endDate,
  }
  if (props.clientId) q.clientId = props.clientId
  return q
})

const data = ref<BenchmarksResponse | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function fetchBenchmarks() {
  status.value = 'pending'
  try {
    data.value = await apiFetch<BenchmarksResponse>('/api/agency/analytics/internal-benchmarks', { query: query.value })
    status.value = 'success'
  } catch {
    data.value = null
    status.value = 'error'
  }
}

watch(query, () => {
  fetchBenchmarks()
}, { immediate: true })

const loading = computed(() => status.value === 'pending')
const hasError = computed(() => status.value === 'error')
const hasClient = computed(() => !!props.clientId)

interface MetricMeta {
  key: BenchmarkMetricKey
  label: string
  shortLabel: string
  kind: 'currency' | 'percent'
  icon: string
}

const ENGAGEMENT_METRIC: MetricMeta = {
  key: 'engagementRate',
  label: 'Engagement rate',
  shortLabel: 'Engagement',
  kind: 'percent',
  icon: 'i-lucide-mouse-pointer-click'
}

const METRICS: MetricMeta[] = [
  ENGAGEMENT_METRIC,
  { key: 'cvr', label: 'Conversion rate', shortLabel: 'CVR', kind: 'percent', icon: 'i-lucide-badge-check' },
  { key: 'cpl', label: 'Cost per lead', shortLabel: 'CPL', kind: 'currency', icon: 'i-lucide-user-plus' },
  { key: 'cpa', label: 'Cost per acquisition', shortLabel: 'CPA', kind: 'currency', icon: 'i-lucide-circle-dollar-sign' }
]

function fmtVal(v: number | null, kind: 'currency' | 'percent'): string {
  if (v == null) return '—'
  return kind === 'currency' ? fmtCurrency(v, 2) : fmtPercent(v * 100)
}

function metricMeta(key: BenchmarkMetricKey): MetricMeta {
  return METRICS.find(m => m.key === key) ?? ENGAGEMENT_METRIC
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
const leaderboardMetric = ref<BenchmarkMetricKey>('engagementRate')
const portfolioCards = computed(() => {
  if (!data.value || hasClient.value) return []
  return METRICS.map((m) => {
    const block = data.value!.metrics[m.key]
    return {
      ...m,
      count: block?.portfolio?.count ?? 0,
      median: block?.portfolio?.median ?? null,
      p25: block?.portfolio?.p25 ?? null,
      p75: block?.portfolio?.p75 ?? null,
      lowerIsBetter: block?.lowerIsBetter ?? false
    }
  })
})

const leaderboard = computed(() => {
  if (!data.value || hasClient.value) return []
  const block = data.value.metrics[leaderboardMetric.value]
  return leaderboardRows(data.value.clients, leaderboardMetric.value, block?.lowerIsBetter ?? false)
})
const leaderboardKind = computed(() => METRICS.find(m => m.key === leaderboardMetric.value)?.kind ?? 'currency')
const leaderboardMetricMeta = computed(() => metricMeta(leaderboardMetric.value))
const rankedCount = computed(() => leaderboard.value.filter(row => row.value != null).length)
const metricMenuItems = METRICS.map(m => ({ label: m.label, value: m.key }))

watch(data, (benchmarks) => {
  if (!benchmarks || hasClient.value) return
  const currentCount = benchmarks.metrics[leaderboardMetric.value]?.portfolio?.count ?? 0
  if (currentCount > 0) return

  const fallback = METRICS.find(m => (benchmarks.metrics[m.key]?.portfolio?.count ?? 0) > 0)
  if (fallback) leaderboardMetric.value = fallback.key
}, { immediate: true })

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

    <div v-else-if="hasError" class="py-10 text-center text-error text-sm">
      Couldn't load benchmarks. Try again shortly.
    </div>

    <UAlert
      v-else-if="data?.degraded"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Benchmark data is limited"
      :description="data.warnings?.[0] || 'Analytics source data is temporarily unavailable.'"
    />

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
    <div v-else class="space-y-5">
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div
          v-for="card in portfolioCards"
          :key="card.key"
          class="rounded-lg bg-elevated p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium text-muted">
                {{ card.shortLabel }}
              </p>
              <p class="mt-1 text-2xl font-semibold text-default">
                {{ fmtVal(card.median, card.kind) }}
              </p>
            </div>
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-default">
              <UIcon :name="card.icon" class="size-4 text-primary" />
            </div>
          </div>
          <div class="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p class="text-muted">
                Clients
              </p>
              <p class="font-medium text-default">
                {{ card.count }}
              </p>
            </div>
            <div>
              <p class="text-muted">
                Q1
              </p>
              <p class="font-medium text-default">
                {{ fmtVal(card.p25, card.kind) }}
              </p>
            </div>
            <div>
              <p class="text-muted">
                Q3
              </p>
              <p class="font-medium text-default">
                {{ fmtVal(card.p75, card.kind) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-default overflow-hidden">
        <div class="flex flex-col gap-3 border-b border-default p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-default">
              Portfolio ranking
            </p>
            <p class="text-xs text-muted mt-1">
              {{ rankedCount }} ranked of {{ data.clientCount }} clients
            </p>
          </div>
          <USelectMenu
            v-model="leaderboardMetric"
            :items="metricMenuItems"
            value-key="value"
            size="sm"
            class="w-full sm:w-56"
          />
        </div>

        <div v-if="rankedCount === 0" class="py-12 text-center">
          <UIcon :name="leaderboardMetricMeta.icon" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm font-medium text-default">
            No {{ leaderboardMetricMeta.label.toLowerCase() }} values
          </p>
          <p class="mt-1 text-xs text-muted">
            This window has no valid values for that benchmark.
          </p>
        </div>

        <UTable
          v-else
          :data="leaderboard"
          :columns="leaderboardColumns"
        >
          <template #rank-cell="{ row }">
            <span class="text-muted">{{ row.original.rank ?? '—' }}</span>
          </template>
          <template #value-cell="{ row }">
            {{ fmtVal(row.original.value, leaderboardKind) }}
          </template>
        </UTable>
      </div>
    </div>
  </UCard>
</template>
