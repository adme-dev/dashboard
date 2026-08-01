<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })
useHead({ title: 'Analytics - XeroFlow Agency' })

if (import.meta.client) {
  onMounted(() => {
    document.title = 'Analytics - XeroFlow Agency'
  })
}

const route = useRoute()
const router = useRouter()
const { filters, apiQuery } = useAnalytics()

const activeTab = ref<'overview' | 'insights'>('overview')
const tabItems = [
  { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
  { label: 'Insights', value: 'insights', icon: 'i-lucide-gauge' }
] as const

interface AnalyticsOverview {
  totals: AnalyticsTotals
  previousPeriod: AnalyticsTotals
  byPlatform: AnalyticsPlatformRow[]
  byClient: AnalyticsClientRow[]
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

interface AnalyticsClientRow {
  clientId: string
  clientName: string
  spend: number
  budget?: number
  rollingCount?: number
  platforms: string[]
  campaignCount: number
  cpc: number | null
  ctr: number | null
}

interface CampaignResponse {
  filters: {
    startDate: string
    endDate: string
    platforms: string[]
    clientId?: string | null
  }
  campaign: {
    activeCampaignCount: number
    rawCampaignCount: number
    campaignsByPlatform: { platform: string; campaignCount: number }[]
  }
  connections: {
    active: number
    total: number
    activePlatforms: string[]
    inactive: number
    inactivePlatforms: string[]
  }
  sync: {
    lastSyncedAt: string | null
    hasRecentSync: boolean
    syncAgeMinutes: number | null
    rawRowsInWindow: number
  }
  mapping: {
    directClientCampaignRows: boolean
    socialClientLinks: boolean
    campaignAccountMappings: boolean
  }
  ga4: {
    hasPropertyMap: boolean
    rowsInWindow: number
  }
  issues: {
    severity: 'error' | 'warning' | 'info'
    code: string
    message: string
  }[]
}

// Backward-compatible route normalisation:
// old bookmarks/shared links often use ?clientId=... on /agency/analytics.
// Move those to /agency/analytics/client/:clientId so each client has a dedicated canonical route.
if (import.meta.client && typeof route.query.clientId === 'string' && route.query.clientId.trim().length > 0) {
  const clientId = route.query.clientId.trim()
  const nextQuery: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === 'string') {
      if (key === 'clientId') continue
      nextQuery[key] = value
    }
  }

  void router.replace({
    path: `/agency/analytics/client/${clientId}`,
    query: nextQuery
  })
}

// Sync clientId with URL — clear it if not in current query params
// (prevents stale filter from client detail page persisting)
const urlClientId = (route.query.clientId as string) || null
if (filters.value.clientId !== urlClientId) {
  filters.value.clientId = urlClientId
}

// Overview data
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; query?: Record<string, unknown>; signal?: AbortSignal }
) => Promise<T>
const overviewData = ref<AnalyticsOverview | null>(null)
const overviewStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshOverview() {
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
const byClient = computed(() => overview.value?.byClient || [])

// Trend data
const trendMetric = ref('spend')
const trendGroupBy = ref<'day' | 'week' | 'month'>('day')

const trendQuery = computed(() => ({
  ...apiQuery.value,
  metric: trendMetric.value,
  groupBy: trendGroupBy.value
}))

const trendData = ref<TrendResponse | null>(null)
const trendStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshTrends() {
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

// Metric options for trend chart
const metricOptions = [
  { label: 'Spend', value: 'spend' },
  { label: 'Impressions', value: 'impressions' },
  { label: 'Clicks', value: 'clicks' },
  { label: 'Leads', value: 'leads' },
  { label: 'CPC', value: 'cpc' },
  { label: 'CPM', value: 'cpm' },
  { label: 'CTR', value: 'ctr' },
  { label: 'ROAS', value: 'roas' },
  { label: 'Cost / Lead', value: 'costPerLead' }
]

const groupByOptions = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' }
]

const loading = computed(() => overviewStatus.value === 'pending')

// ─── Sync ───────────────────────────────────────────
const toast = useToast()
const syncing = ref(false)

async function syncAll() {
  syncing.value = true
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000) // 5 min total
    const res = await apiFetch<{ results: Record<string, { error?: unknown }> }>('/api/agency/analytics/sync', {
      method: 'POST',
      signal: controller.signal
    })
    clearTimeout(timeout)

    // Refresh dashboard data after sync
    await refreshOverview()
    await refreshTrends()
    await refreshCampaignDiagnostics()

    // Check if any platforms had errors
    const errors = Object.entries(res.results || {}).filter(([, v]) => 'error' in v)
    if (errors.length > 0 && errors.length < 8) {
      toast.add({
        title: 'Sync partially complete',
        description: `${8 - errors.length} platforms synced. ${errors.length} had errors.`,
        color: 'warning'
      })
    } else if (errors.length === 0) {
      toast.add({ title: 'Sync complete', description: 'All platforms synced successfully', color: 'success' })
    } else {
      toast.add({ title: 'Sync failed', description: 'All platforms had errors. Check platform connections and analytics data sources.', color: 'error' })
    }
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    toast.add({
      title: isTimeout ? 'Sync timed out' : 'Sync failed',
      description: isTimeout
        ? 'The sync took too long. Some platforms may have synced — try refreshing.'
        : 'Could not sync platforms. Check platform connections and analytics data sources.',
      color: 'error'
    })
  } finally {
    syncing.value = false
  }
}

// ─── Campaign health diagnostics (source-of-truth root cause probe) ─────────────────────────
const campaignDiagnosticQuery = computed(() => ({
  ...apiQuery.value
}))

const campaignDiagnosticsStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const campaignDiagnosticsError = ref<string | null>(null)
const campaignHealth = ref<CampaignResponse | null>(null)

const hasCampaignData = computed(() => (campaignHealth.value?.campaign.activeCampaignCount ?? 0) > 0)
const campaignDiagnosticsTitle = computed(() => {
  if (campaignDiagnosticsStatus.value === 'error') {
    return 'Campaign load failed'
  }
  if (!hasCampaignData.value) {
    const clientHint = filters.value.clientId ? 'for the selected client' : 'for the selected filters'
    return `No active campaign rows ${clientHint}`
  }
  return `Active campaign rows found: ${campaignHealth.value?.campaign.activeCampaignCount ?? 0}`
})

const campaignDiagnosticsDescription = computed(() => {
  if (campaignDiagnosticsStatus.value === 'error') {
    return campaignDiagnosticsError.value || 'Could not load campaign-level data.'
  }
  if (!hasCampaignData.value) {
    const causes = campaignHealth.value?.issues?.map((issue) => `• ${issue.message}`) ?? []
    if (causes.length === 0) {
      return [
        'No campaign rows for this filter set.',
        'Try widening the date range and clicking Sync All Platforms.'
      ].join('\n')
    }
    return [
      'Likely causes:',
      ...causes,
      '',
      'Try widening the date range and clicking Sync All Platforms.'
    ].join('\n')
  }
  const campaignCount = campaignHealth.value?.campaign.activeCampaignCount ?? 0
  if (campaignCount === 0) {
    return 'Campaign rows are not yet available for this filter set.'
  }
  return 'Campaign rows are present for this query window.'
})

const campaignDiagnosticsColor = computed(() => {
  if (campaignDiagnosticsStatus.value === 'error') {
    return 'error'
  }
  if (campaignDiagnosticsStatus.value === 'pending' || campaignDiagnosticsStatus.value === 'idle') {
    return 'neutral'
  }
  if (!hasCampaignData.value) {
    return campaignHealth.value?.issues?.some((item) => item.severity === 'error') ? 'error' : 'warning'
  }
  return 'success'
})

async function refreshCampaignDiagnostics() {
  campaignDiagnosticsStatus.value = 'pending'
  campaignDiagnosticsError.value = null
  try {
    const res = await apiFetch<CampaignResponse>('/api/agency/analytics/health', {
      query: campaignDiagnosticQuery.value
    })
    campaignHealth.value = res
    campaignDiagnosticsStatus.value = 'success'
  } catch (err: unknown) {
    campaignDiagnosticsStatus.value = 'error'
    if (err instanceof Error) {
      campaignDiagnosticsError.value = err.message
    } else {
      campaignDiagnosticsError.value = 'Failed to load campaign diagnostics.'
    }
  }
}

watch(campaignDiagnosticQuery, () => {
  void refreshCampaignDiagnostics()
}, { immediate: true })
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-default">
          Analytics
        </h1>
        <p class="text-sm text-muted mt-1">
          Cross-platform marketing performance
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          to="/agency/analytics/connections"
          icon="i-lucide-plug"
          label="Data Sources"
          size="sm"
          color="neutral"
          variant="soft"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="Sync All Platforms"
          size="sm"
          variant="outline"
          :loading="syncing"
          @click="syncAll"
        />
      </div>
    </div>

    <AnalyticsSectionNav active="performance" />

    <!-- Filter Bar -->
    <AnalyticsFilterBar />

    <UAlert
      icon="i-lucide-search-check"
      :color="campaignDiagnosticsColor"
      variant="subtle"
      :title="campaignDiagnosticsTitle"
      :description="campaignDiagnosticsDescription"
    />

    <!-- Tabs (filter bar above stays shared across both) -->
    <div
      class="inline-flex w-full sm:w-auto items-center gap-1 rounded-lg border border-default bg-elevated p-1"
      role="tablist"
      aria-label="Analytics sections"
    >
      <UButton
        v-for="item in tabItems"
        :id="`analytics-${item.value}-tab`"
        :key="item.value"
        :icon="item.icon"
        :label="item.label"
        :color="activeTab === item.value ? 'primary' : 'neutral'"
        :variant="activeTab === item.value ? 'solid' : 'ghost'"
        size="sm"
        class="flex-1 justify-center sm:flex-none"
        role="tab"
        :aria-selected="activeTab === item.value"
        :aria-controls="`analytics-${item.value}-panel`"
        @click="activeTab = item.value"
      />
    </div>

    <div
      v-show="activeTab === 'overview'"
      id="analytics-overview-panel"
      class="space-y-6"
      role="tabpanel"
      aria-labelledby="analytics-overview-tab"
    >
      <!-- Ask box -->
      <AgencyAnalyticsAskBox
        :start-date="filters.startDate"
        :end-date="filters.endDate"
        :client-id="filters.clientId"
      />

      <!-- KPI Cards -->
      <AnalyticsKPICards
        :totals="totals"
        :previous-period="previousPeriod"
        :loading="loading"
      />

      <!-- Platform Chart -->
      <div class="border border-default rounded-lg p-4">
        <h3 class="text-sm font-semibold text-default mb-3">
          Spend by Platform
        </h3>
        <AnalyticsPlatformChart
          :data="trendPoints"
          :loading="trendStatus === 'pending'"
        />
      </div>

      <!-- Platform Table -->
      <div>
        <h3 class="text-sm font-semibold text-default mb-3">
          Platform Breakdown
        </h3>
        <AnalyticsPlatformTable
          :platforms="byPlatform"
          :loading="loading"
        />
      </div>

      <!-- Trend Chart -->
      <div class="border border-default rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-default">
            Performance Trends
          </h3>
          <div class="flex items-center gap-2">
            <USelectMenu
              v-model="trendMetric"
              :items="metricOptions"
              value-key="value"
              size="xs"
              class="w-32"
            />
            <USelectMenu
              v-model="trendGroupBy"
              :items="groupByOptions"
              value-key="value"
              size="xs"
              class="w-28"
            />
          </div>
        </div>
        <AnalyticsTrendChart
          :data="trendPoints"
          :metric="trendMetric"
          :loading="trendStatus === 'pending'"
        />
      </div>

      <!-- Campaigns Table -->
      <AnalyticsCampaignTable
        :start-date="filters.startDate"
        :end-date="filters.endDate"
        :platforms="filters.platforms"
        :client-id="filters.clientId"
        columns-storage-key="analytics:campaign-cols:agency"
        show-lead-columns
        lead-link-base="/agency/leads"
      />

      <!-- GA4 website funnel (per-client agency view) — wrapper prompts for a
           client when none is selected, and self-hides without GA4 data. -->
      <AnalyticsFunnelChart
        :client-id="filters.clientId"
        :start-date="filters.startDate"
        :end-date="filters.endDate"
      />

      <!-- Blended channels — works agency-wide or per client; self-hides when no data -->
      <AgencyBlendedPanel
        :start-date="filters.startDate"
        :end-date="filters.endDate"
        :client-id="filters.clientId"
      />

      <!-- Client Breakdown -->
      <div>
        <h3 class="text-sm font-semibold text-default mb-3">
          Client Breakdown
        </h3>
        <AnalyticsClientBreakdown
          :clients="byClient"
          :loading="loading"
          :start-date="filters.startDate"
          :end-date="filters.endDate"
        />
      </div>
    </div><!-- /Overview tab -->

    <!-- Insights tab -->
    <div
      v-show="activeTab === 'insights'"
      id="analytics-insights-panel"
      class="space-y-6"
      role="tabpanel"
      aria-labelledby="analytics-insights-tab"
    >
      <AgencyAnalyticsBenchmarks
        :start-date="filters.startDate"
        :end-date="filters.endDate"
        :client-id="filters.clientId"
      />
    </div>
  </div>
</template>
