<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { fmtCurrency, fmtCompact, fmtPercent, getPlatformLabel, getPlatformIcon } = useAnalytics()

const route = useRoute()
const platform = computed(() => route.params.platform as string)

interface AnalyticsOverview {
  totals: Record<string, number | null>
}

interface TrendResponse {
  dataPoints: Array<Record<string, unknown>>
}

const now = new Date()
const thirtyDaysAgo = new Date(now)
thirtyDaysAgo.setDate(now.getDate() - 30)

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const startDate = ref(formatDateISO(thirtyDaysAgo))
const endDate = ref(formatDateISO(now))

const apiQuery = computed(() => ({
  startDate: startDate.value,
  endDate: endDate.value,
  platform: platform.value
}))

const exportUrl = computed(() => {
  const params = new URLSearchParams(apiQuery.value)
  return `/api/portal/analytics/export?${params.toString()}`
})

// Overview
const { data: overviewData, status: overviewStatus } = useFetch<AnalyticsOverview>('/api/portal/analytics/overview', {
  query: apiQuery,
  watch: [apiQuery]
})
const overview = computed(() => overviewData.value)
const totals = computed(() => overview.value?.totals || null)

// Trend
const trendMetric = ref('spend')
const trendQuery = computed(() => ({
  ...apiQuery.value,
  metric: trendMetric.value,
  groupBy: 'day'
}))
const { data: trendData, status: trendStatus } = useFetch<TrendResponse>('/api/portal/analytics/trends', {
  query: trendQuery,
  watch: [trendQuery]
})
const trendPoints = computed(() => trendData.value?.dataPoints || [])

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
</script>

<template>
  <div class="p-6 space-y-6 max-w-[1200px] mx-auto">
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
