<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { fmtCurrency, fmtCompact, fmtPercent, getPlatformLabel, getPlatformIcon } = useAnalytics()

const route = useRoute()
const router = useRouter()
function canonicalizePlatform(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'google' || value === 'google_ads') {
    return 'google_ads'
  }
  if (value === 'meta' || value === 'meta_ads' || value === 'facebook' || value === 'instagram' || value === 'fb') {
    return 'meta'
  }
  return value
}
const platform = computed(() => canonicalizePlatform(route.params.platform as string))
const now = new Date()
const thirtyDaysAgo = new Date(now)
thirtyDaysAgo.setDate(now.getDate() - 30)

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function queryString(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function validDateString(value: unknown, fallback: string) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
}

interface AnalyticsOverview {
  totals: AnalyticsTotals
}

interface TrendResponse {
  dataPoints: AnalyticsTrendPoint[]
  resolution?: 'day' | 'week' | 'month'
}

interface AnalyticsTotals {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  cpc: number | null
  cpm: number | null
  ctr: number | null
  roas: number | null
  budget?: number
  rollingCount?: number
  leads?: number
  costPerLead?: number | null
}

interface AnalyticsTrendPoint {
  date: string
  value: number
  byPlatform: Record<string, number>
}
const startDate = ref(validDateString(queryString(route.query.startDate), formatDateISO(thirtyDaysAgo)))
const endDate = ref(validDateString(queryString(route.query.endDate), formatDateISO(now)))

const apiQuery = computed(() => ({
  startDate: startDate.value,
  endDate: endDate.value,
  platform: platform.value
}))

const exportUrl = computed(() => {
  const params = new URLSearchParams(apiQuery.value)
  return `/api/portal/analytics/export?${params.toString()}`
})

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

// Overview
type FetchStatus = 'idle' | 'pending' | 'success' | 'error'

const overviewData = ref<AnalyticsOverview | null>(null)
const overviewStatus = ref<FetchStatus>('idle')
const overviewError = ref<unknown>(null)

async function refreshOverview() {
  overviewStatus.value = 'pending'
  overviewError.value = null

  try {
    overviewData.value = await apiFetch<AnalyticsOverview>('/api/portal/analytics/overview', {
      query: apiQuery.value
    })
    overviewStatus.value = 'success'
  } catch (error) {
    overviewError.value = error
    overviewStatus.value = 'error'
    throw error
  }
}

const overview = computed(() => overviewData.value)
const totals = computed(() => overview.value?.totals || null)

// Trend
const allowedTrendMetrics = new Set(['spend', 'impressions', 'clicks', 'leads', 'cpc', 'ctr', 'costPerLead'])
const initialMetric = queryString(route.query.metric)
const trendMetric = ref(typeof initialMetric === 'string' && allowedTrendMetrics.has(initialMetric) ? initialMetric : 'spend')
const trendQuery = computed(() => ({
  ...apiQuery.value,
  metric: trendMetric.value,
  groupBy: 'day'
}))
const trendData = ref<TrendResponse | null>(null)
const trendStatus = ref<FetchStatus>('idle')
const trendError = ref<unknown>(null)

async function refreshTrend() {
  trendStatus.value = 'pending'
  trendError.value = null

  try {
    trendData.value = await apiFetch<TrendResponse>('/api/portal/analytics/trends', {
      query: trendQuery.value
    })
    trendStatus.value = 'success'
  } catch (error) {
    trendError.value = error
    trendStatus.value = 'error'
    throw error
  }
}

const trendPoints = computed(() => trendData.value?.dataPoints || [])
const trendResolution = computed(() => trendData.value?.resolution || (trendPoints.value.length > 0 && trendPoints.value.every((p) => p.date.length === 7) ? 'month' : undefined))

watch(apiQuery, () => {
  refreshOverview()
})

watch(trendQuery, () => {
  refreshTrend()
})

watch([startDate, endDate, trendMetric], () => {
  const preservedQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === 'string') preservedQuery[key] = value
  }
  preservedQuery.platform = platform.value
  preservedQuery.startDate = startDate.value
  preservedQuery.endDate = endDate.value
  preservedQuery.metric = trendMetric.value

  const current = new URLSearchParams(route.query as Record<string, string>).toString()
  const next = new URLSearchParams(preservedQuery).toString()
  if (current !== next) {
    router.replace({ query: preservedQuery })
  }
}, { deep: true })

watch(
  () => route.query.metric,
  () => {
    const metric = queryString(route.query.metric)
    if (typeof metric === 'string' && allowedTrendMetrics.has(metric)) {
      trendMetric.value = metric
    } else if (route.query.metric) {
      trendMetric.value = 'spend'
    }
  },
  { deep: true }
)

watch(
  () => route.query,
  () => {
    startDate.value = validDateString(queryString(route.query.startDate), formatDateISO(thirtyDaysAgo))
    endDate.value = validDateString(queryString(route.query.endDate), formatDateISO(now))
  },
  { deep: true }
)

const metricOptions = [
  { label: 'Spend', value: 'spend' },
  { label: 'Impressions', value: 'impressions' },
  { label: 'Clicks', value: 'clicks' },
  { label: 'Leads', value: 'leads' },
  { label: 'CPC', value: 'cpc' },
  { label: 'CTR', value: 'ctr' },
  { label: 'Cost / Lead', value: 'costPerLead' }
]

const loading = computed(() => overviewStatus.value === 'pending')

await Promise.all([refreshOverview(), refreshTrend()])
</script>

<template>
  <div class="p-6 space-y-6 w-full">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <UButton
        to="/portal/analytics"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        size="sm"
      />
      <UIcon :name="getPlatformIcon(platform)" class="w-5 h-5 text-muted" />
      <div>
        <h1 class="text-2xl font-bold text-default">
          {{ getPlatformLabel(platform) }}
        </h1>
        <p class="text-sm text-muted">
          Platform-specific performance
        </p>
      </div>
    </div>

    <!-- Date Range -->
    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="startDate"
        type="date"
        size="sm"
        class="w-36"
      />
      <span class="text-muted text-sm">to</span>
      <UInput
        v-model="endDate"
        type="date"
        size="sm"
        class="w-36"
      />
      <UButton
        :to="exportUrl"
        target="_blank"
        icon="i-lucide-download"
        label="Export CSV"
        size="sm"
        variant="outline"
        color="neutral"
        class="ml-auto"
      />
    </div>

    <!-- KPI Summary -->
    <div v-if="loading" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <USkeleton v-for="i in 6" :key="i" class="h-20 rounded-lg" />
    </div>
    <div v-else-if="totals" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <div
        v-for="kpi in [
          { label: 'Spend', value: fmtCurrency(totals.spend), icon: 'i-lucide-wallet' },
          { label: 'Clicks', value: fmtCompact(totals.clicks), icon: 'i-lucide-mouse-pointer-click' },
          { label: 'Leads', value: fmtCompact(totals.leads || 0), icon: 'i-lucide-inbox' },
          { label: 'CTR', value: fmtPercent(totals.ctr), icon: 'i-lucide-percent' },
          { label: 'CPC', value: fmtCurrency(totals.cpc, 2), icon: 'i-lucide-hand-coins' },
          { label: 'Cost / Lead', value: totals.costPerLead != null ? fmtCurrency(totals.costPerLead, 2) : '-', icon: 'i-lucide-user-round-check' }
        ]"
        :key="kpi.label"
        class="p-4 rounded-lg border border-default bg-elevated/30"
      >
        <div class="flex items-center gap-2 mb-1">
          <UIcon :name="kpi.icon" class="w-4 h-4 text-muted" />
          <span class="text-xs text-muted">{{ kpi.label }}</span>
        </div>
        <p class="text-xl font-bold tabular-nums">
          {{ kpi.value }}
        </p>
      </div>
    </div>

    <!-- Trend -->
    <div class="border border-default rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold">
          Trend
        </h3>
        <USelectMenu
          v-model="trendMetric"
          :items="metricOptions"
          value-key="value"
          size="xs"
          class="w-32"
        />
      </div>
      <AnalyticsTrendChart
        :data="trendPoints"
        :metric="trendMetric"
        :resolution="trendResolution"
        :loading="trendStatus === 'pending'"
      />
    </div>

    <!-- Campaign Table -->
    <AnalyticsCampaignTable
      :start-date="startDate"
      :end-date="endDate"
      :platforms="[platform]"
      api-base="/api/portal/analytics"
      :hide-columns="['budget', 'variance']"
      columns-storage-key="analytics:campaign-cols:portal-platform"
      show-lead-columns
      lead-link-base="/portal/leads"
    />
  </div>
</template>
