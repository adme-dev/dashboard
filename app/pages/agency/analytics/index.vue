<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })

const route = useRoute()
const { filters, apiQuery } = useAnalytics()

interface AnalyticsOverview {
  totals: Record<string, number | null>
  previousPeriod: Record<string, number | null>
  byPlatform: Array<Record<string, unknown>>
  byClient: Array<Record<string, unknown>>
}

interface TrendResponse {
  dataPoints: Array<Record<string, unknown>>
}

// Sync clientId with URL — clear it if not in current query params
// (prevents stale filter from client detail page persisting)
const urlClientId = (route.query.clientId as string) || null
if (filters.value.clientId !== urlClientId) {
  filters.value.clientId = urlClientId
}

// Overview data
const { data: overviewData, status: overviewStatus, refresh: refreshOverview } = useFetch<AnalyticsOverview>('/api/agency/analytics/overview', {
  query: apiQuery,
  watch: [apiQuery]
})

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

const { data: trendData, status: trendStatus, refresh: refreshTrends } = useFetch<TrendResponse>('/api/agency/analytics/trends', {
  query: trendQuery,
  watch: [trendQuery]
})

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
    const res = await $fetch<{ results: Record<string, { error?: unknown }> }>('/api/agency/analytics/sync', {
      method: 'POST',
      signal: controller.signal
    })
    clearTimeout(timeout)

    // Refresh dashboard data after sync
    refreshOverview()
    refreshTrends()

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
      toast.add({ title: 'Sync failed', description: 'All platforms had errors. Check your connections in Social Hub.', color: 'error' })
    }
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    toast.add({
      title: isTimeout ? 'Sync timed out' : 'Sync failed',
      description: isTimeout
        ? 'The sync took too long. Some platforms may have synced — try refreshing.'
        : 'Could not sync platforms. Check your connections in Social Hub.',
      color: 'error'
    })
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-default">
          Analytics
        </h1>
        <p class="text-sm text-muted mt-1">
          Cross-platform marketing performance
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        label="Sync All Platforms"
        size="sm"
        variant="outline"
        :loading="syncing"
        @click="syncAll"
      />
    </div>

    <!-- Filter Bar -->
    <AnalyticsFilterBar />

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

    <!-- Website & Funnel (GA4) — requires a specific client; self-hides without GA4 -->
    <PortalFunnelChart
      v-if="filters.clientId"
      :start-date="filters.startDate"
      :end-date="filters.endDate"
      :client-id="filters.clientId"
      api-base="/api/agency/analytics/funnel"
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
  </div>
</template>
