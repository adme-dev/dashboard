<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const route = useRoute()
const clientId = computed(() => route.params.id as string)

const { filters, fmtCurrency, fmtCompact, fmtPercent, getPlatformIcon, getPlatformColor, getPlatformLabel } = useAnalytics()

// Override apiQuery with this client's ID
const apiQuery = computed(() => {
  const q: Record<string, string> = {
    startDate: filters.value.startDate,
    endDate: filters.value.endDate,
    clientId: clientId.value,
  }
  if (filters.value.platforms.length > 0) q.platform = filters.value.platforms.join(',')
  return q
})

// Overview
const { data: overviewData, status: overviewStatus } = useFetch('/api/agency/analytics/overview', {
  query: apiQuery,
  watch: [apiQuery],
})

const overview = computed(() => overviewData.value as any)
const totals = computed(() => overview.value?.totals || null)
const previousPeriod = computed(() => overview.value?.previousPeriod || null)
const byPlatform = computed(() => overview.value?.byPlatform || [])

// Trends
const trendMetric = ref('spend')
const trendQuery = computed(() => ({
  ...apiQuery.value,
  metric: trendMetric.value,
  groupBy: 'day',
}))

const { data: trendData, status: trendStatus } = useFetch('/api/agency/analytics/trends', {
  query: trendQuery,
  watch: [trendQuery],
})
const trendPoints = computed(() => (trendData.value as any)?.dataPoints || [])

// Client name from overview data
const clientName = computed(() => {
  const clients = overview.value?.byClient || []
  return clients[0]?.clientName || 'Client'
})

const metricOptions = [
  { label: 'Spend', value: 'spend' },
  { label: 'Impressions', value: 'impressions' },
  { label: 'Clicks', value: 'clicks' },
  { label: 'CPC', value: 'cpc' },
  { label: 'CTR', value: 'ctr' },
  { label: 'ROAS', value: 'roas' },
]

const loading = computed(() => overviewStatus.value === 'pending')
</script>

<template>
  <div class="p-6 space-y-6 max-w-[1400px] mx-auto">
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
        <h1 class="text-2xl font-bold text-default">{{ clientName }}</h1>
        <p class="text-sm text-muted">Client analytics</p>
      </div>
    </div>

    <!-- Filter Bar -->
    <AnalyticsFilterBar />

    <!-- KPI Cards -->
    <AnalyticsKPICards
      :totals="totals"
      :previous-period="previousPeriod"
      :loading="loading"
    />

    <!-- Platform breakdown + Cross-sell -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Platform Table -->
      <div class="lg:col-span-2">
        <h3 class="text-sm font-semibold text-default mb-3">Platform Performance</h3>
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
        <h3 class="text-sm font-semibold text-default">Spend Trend</h3>
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

    <!-- Campaign Table -->
    <AnalyticsCampaignTable
      :start-date="filters.startDate"
      :end-date="filters.endDate"
      :platforms="filters.platforms"
      :client-id="clientId"
    />
  </div>
</template>
