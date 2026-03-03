<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const route = useRoute()
const { filters, apiQuery, updateFilters } = useAnalytics()

// Sync clientId with URL — clear it if not in current query params
// (prevents stale filter from client detail page persisting)
const urlClientId = (route.query.clientId as string) || null
if (filters.value.clientId !== urlClientId) {
  filters.value.clientId = urlClientId
}

// Overview data
const { data: overviewData, status: overviewStatus } = useFetch('/api/agency/analytics/overview', {
  query: apiQuery,
  watch: [apiQuery],
})

const overview = computed(() => overviewData.value as any)
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
  groupBy: trendGroupBy.value,
}))

const { data: trendData, status: trendStatus } = useFetch('/api/agency/analytics/trends', {
  query: trendQuery,
  watch: [trendQuery],
})

const trendPoints = computed(() => (trendData.value as any)?.dataPoints || [])

// Metric options for trend chart
const metricOptions = [
  { label: 'Spend', value: 'spend' },
  { label: 'Impressions', value: 'impressions' },
  { label: 'Clicks', value: 'clicks' },
  { label: 'CPC', value: 'cpc' },
  { label: 'CPM', value: 'cpm' },
  { label: 'CTR', value: 'ctr' },
  { label: 'ROAS', value: 'roas' },
]

const groupByOptions = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
]

const loading = computed(() => overviewStatus.value === 'pending')

// ─── Sync ───────────────────────────────────────────
const toast = useToast()
const syncing = ref(false)

const SYNC_PLATFORMS = [
  { key: 'meta', label: 'Meta', endpoint: '/api/agency/social/meta/sync-spend' },
  { key: 'google', label: 'Google', endpoint: '/api/agency/social/google/sync-spend' },
  { key: 'microsoft_ads', label: 'Microsoft', endpoint: '/api/agency/social/microsoft_ads/sync-spend' },
  { key: 'pinterest', label: 'Pinterest', endpoint: '/api/agency/social/pinterest/sync-spend' },
  { key: 'tiktok', label: 'TikTok', endpoint: '/api/agency/social/tiktok/sync-spend' },
  { key: 'linkedin', label: 'LinkedIn', endpoint: '/api/agency/social/linkedin/sync-spend' },
  { key: 'snapchat', label: 'Snapchat', endpoint: '/api/agency/social/snapchat/sync-spend' },
  { key: 'twitter', label: 'X/Twitter', endpoint: '/api/agency/social/twitter/sync-spend' },
]

async function syncAll() {
  syncing.value = true
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  let successCount = 0
  let errorCount = 0

  for (const platform of SYNC_PLATFORMS) {
    try {
      await $fetch(platform.endpoint, { method: 'POST', body: { month, year } })
      successCount++
    } catch {
      errorCount++
    }
  }

  syncing.value = false

  if (successCount > 0) {
    toast.add({ title: 'Sync complete', description: `${successCount} platform${successCount > 1 ? 's' : ''} synced${errorCount > 0 ? `, ${errorCount} failed` : ''}`, color: errorCount > 0 ? 'warning' : 'success' })
  } else {
    toast.add({ title: 'Sync failed', description: 'No platforms could be synced. Check your connections in Social Hub.', color: 'error' })
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6 max-w-[1400px] mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-default">Analytics</h1>
        <p class="text-sm text-muted mt-1">Cross-platform marketing performance</p>
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
      <h3 class="text-sm font-semibold text-default mb-3">Spend by Platform</h3>
      <AnalyticsPlatformChart
        :data="trendPoints"
        :loading="trendStatus === 'pending'"
      />
    </div>

    <!-- Platform Table -->
    <div>
      <h3 class="text-sm font-semibold text-default mb-3">Platform Breakdown</h3>
      <AnalyticsPlatformTable
        :platforms="byPlatform"
        :loading="loading"
      />
    </div>

    <!-- Trend Chart -->
    <div class="border border-default rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-default">Performance Trends</h3>
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
    />

    <!-- Client Breakdown -->
    <div>
      <h3 class="text-sm font-semibold text-default mb-3">Client Breakdown</h3>
      <AnalyticsClientBreakdown
        :clients="byClient"
        :loading="loading"
        :start-date="filters.startDate"
        :end-date="filters.endDate"
      />
    </div>
  </div>
</template>
