<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })

const route = useRoute()
const clientId = computed(() => route.params.id as string)

// Guard against invalid clientId (e.g. "null")
const validId = computed(() => clientId.value && clientId.value !== 'null' && clientId.value !== 'undefined')

if (!validId.value) {
  navigateTo('/agency/analytics')
}

const { filters } = useAnalytics()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

interface AnalyticsOverview {
  totals: AnalyticsTotals
  previousPeriod: AnalyticsTotals
  byPlatform: AnalyticsPlatformRow[]
  byClient?: Array<{ clientName?: string | null }>
}

interface TrendResponse {
  dataPoints: AnalyticsTrendPoint[]
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

interface AnalyticsPlatformRow extends AnalyticsTotals {
  platform: string
  displayName: string
  color: string
  campaignCount: number
  pctOfTotal: number
}

interface AnalyticsTrendPoint {
  date: string
  value: number
  byPlatform: Record<string, number>
}

// Override apiQuery with this client's ID
const apiQuery = computed(() => {
  const q: Record<string, string> = {
    startDate: filters.value.startDate,
    endDate: filters.value.endDate,
    clientId: clientId.value
  }
  if (filters.value.platforms.length > 0) q.platform = filters.value.platforms.join(',')
  return q
})

// Overview
const overviewData = ref<AnalyticsOverview | null>(null)
const overviewStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshOverview() {
  if (!validId.value) return
  overviewStatus.value = 'pending'
  try {
    overviewData.value = await apiFetch<AnalyticsOverview>('/api/agency/analytics/overview', { query: apiQuery.value })
    overviewStatus.value = 'success'
  } catch {
    overviewStatus.value = 'error'
  }
}

watch(apiQuery, () => {
  void refreshOverview()
}, { immediate: true })

const overview = computed(() => overviewData.value)
const totals = computed(() => overview.value?.totals || null)
const previousPeriod = computed(() => overview.value?.previousPeriod || null)
const byPlatform = computed(() => overview.value?.byPlatform || [])

// Trends
const trendMetric = ref('spend')
const trendQuery = computed(() => ({
  ...apiQuery.value,
  metric: trendMetric.value,
  groupBy: 'day'
}))

const trendData = ref<TrendResponse | null>(null)
const trendStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshTrends() {
  if (!validId.value) return
  trendStatus.value = 'pending'
  try {
    trendData.value = await apiFetch<TrendResponse>('/api/agency/analytics/trends', { query: trendQuery.value })
    trendStatus.value = 'success'
  } catch {
    trendStatus.value = 'error'
  }
}

watch(trendQuery, () => {
  void refreshTrends()
}, { immediate: true })
const trendPoints = computed(() => trendData.value?.dataPoints || [])

// Client name from overview data
const clientName = computed(() => {
  const clients = overview.value?.byClient || []
  return clients[0]?.clientName || 'Client'
})

useHead(() => ({ title: `${clientName.value} Analytics - XeroFlow Agency` }))

if (import.meta.client) {
  watch(clientName, (name) => {
    document.title = `${name} Analytics - XeroFlow Agency`
  }, { immediate: true })
}

const metricOptions = [
  { label: 'Spend', value: 'spend' },
  { label: 'Impressions', value: 'impressions' },
  { label: 'Clicks', value: 'clicks' },
  { label: 'Leads', value: 'leads' },
  { label: 'CPC', value: 'cpc' },
  { label: 'CTR', value: 'ctr' },
  { label: 'Cost / Lead', value: 'costPerLead' },
  { label: 'ROAS', value: 'roas' }
]

const loading = computed(() => overviewStatus.value === 'pending')
</script>

<template>
  <div class="w-full p-4 sm:p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <UButton
        to="/agency/analytics"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        size="sm"
      />
      <div>
        <h1 class="text-2xl font-bold text-default">
          {{ clientName }}
        </h1>
        <p class="text-sm text-muted">
          Client analytics
        </p>
      </div>
    </div>

    <!-- Filter Bar -->
    <AnalyticsFilterBar :locked-client-id="clientId" />

    <!-- KPI Cards -->
    <AnalyticsKPICards
      :totals="totals"
      :previous-period="previousPeriod"
      :loading="loading"
    />

    <AnalyticsGoogleCallsSummary
      endpoint="/api/agency/analytics/google-calls"
      :query="{
        startDate: filters.startDate,
        endDate: filters.endDate,
        clientId
      }"
    />

    <!-- Platform breakdown + Cross-sell -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Platform Table -->
      <div class="lg:col-span-2">
        <h3 class="text-sm font-semibold text-default mb-3">
          Platform Performance
        </h3>
        <AnalyticsPlatformTable
          :platforms="byPlatform"
          :loading="loading"
        />
      </div>

      <!-- Cross-Sell Panel -->
      <div>
        <AnalyticsCrossSellPanel :client-id="clientId" />
      </div>
    </div>

    <!-- Trend Chart -->
    <div class="border border-default rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-default">
          Spend Trend
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
        :loading="trendStatus === 'pending'"
      />
    </div>

    <PortalPersonaInsights
      api-base="/api/agency/analytics"
      :client-id="clientId"
      :start-date="filters.startDate"
      :end-date="filters.endDate"
      :platform="filters.platforms.length === 1 ? filters.platforms[0] : undefined"
    />

    <AnalyticsPersonaActivationPanel
      :client-id="clientId"
      :start-date="filters.startDate"
      :end-date="filters.endDate"
      :platform="filters.platforms.length === 1 ? filters.platforms[0] : undefined"
    />

    <!-- Campaign Table -->
    <AnalyticsCampaignTable
      :start-date="filters.startDate"
      :end-date="filters.endDate"
      :platforms="filters.platforms"
      :client-id="clientId"
      columns-storage-key="analytics:campaign-cols:agency-client"
      show-lead-columns
      lead-link-base="/agency/leads"
    />
  </div>
</template>
