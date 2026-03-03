<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const { filters, apiQuery, updateFilters } = useAnalytics()

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
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6 max-w-[1400px] mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-default">Analytics</h1>
        <p class="text-sm text-muted mt-1">Cross-platform marketing performance</p>
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

    <!-- Platform Mix + Platform Table -->
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <!-- Platform Chart (3/5) -->
      <div class="lg:col-span-3 border border-default rounded-lg p-4">
        <h3 class="text-sm font-semibold text-default mb-3">Spend by Platform</h3>
        <AnalyticsPlatformChart
          :data="trendPoints"
          :loading="trendStatus === 'pending'"
        />
      </div>

      <!-- Platform Table (2/5) -->
      <div class="lg:col-span-2">
        <h3 class="text-sm font-semibold text-default mb-3">Platform Breakdown</h3>
        <AnalyticsPlatformTable
          :platforms="byPlatform"
          :loading="loading"
        />
      </div>
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
      />
    </div>
  </div>
</template>
