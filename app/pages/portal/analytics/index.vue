<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { fmtCurrency, fmtCompact, fmtPercent, getPlatformIcon } = useAnalytics()
const route = useRoute()
const router = useRouter()

interface AnalyticsOverview {
  totals: Record<string, number | null>
  previousPeriod: Record<string, number | null>
  byPlatform: Array<Record<string, unknown>>
}

interface TrendResponse {
  dataPoints: Array<Record<string, unknown>>
}

// Date range state
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

const startDate = ref(validDateString(queryString(route.query.startDate), formatDateISO(thirtyDaysAgo)))
const endDate = ref(validDateString(queryString(route.query.endDate), formatDateISO(now)))
const selectedPlatforms = ref<string[]>(
  typeof queryString(route.query.platform) === 'string'
    ? String(queryString(route.query.platform)).split(',').map(platform => platform.trim()).filter(Boolean)
    : []
)

const apiQuery = computed(() => {
  const q: Record<string, string> = { startDate: startDate.value, endDate: endDate.value }
  if (selectedPlatforms.value.length) q.platform = selectedPlatforms.value.join(',')
  return q
})

const exportUrl = computed(() => {
  const params = new URLSearchParams(apiQuery.value)
  return `/api/portal/analytics/export?${params.toString()}`
})

// Overview data
const { data: overviewData, status: overviewStatus } = useFetch<AnalyticsOverview>('/api/portal/analytics/overview', {
  query: apiQuery,
  watch: [apiQuery]
})

const overview = computed(() => overviewData.value)
const totals = computed(() => overview.value?.totals || null)
const previousPeriod = computed(() => overview.value?.previousPeriod || null)
const byPlatform = computed(() => overview.value?.byPlatform || [])

// Trend data
const allowedTrendMetrics = new Set(['spend', 'impressions', 'clicks', 'leads', 'cpc', 'ctr', 'costPerLead'])
const initialMetric = queryString(route.query.metric)
const trendMetric = ref(typeof initialMetric === 'string' && allowedTrendMetrics.has(initialMetric) ? initialMetric : 'spend')
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

function pctChange(current: number | null, prev: number | null): number | null {
  if (current == null || prev == null || prev === 0) return null
  return ((current - prev) / prev) * 100
}

const loading = computed(() => overviewStatus.value === 'pending')

const datePresets = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' }
]

function setPreset(preset: string) {
  const today = new Date()
  let start: Date
  if (preset === '7d') {
    start = new Date(today)
    start.setDate(today.getDate() - 7)
  } else if (preset === '90d') {
    start = new Date(today)
    start.setDate(today.getDate() - 90)
  } else {
    start = new Date(today)
    start.setDate(today.getDate() - 30)
  }
  startDate.value = formatDateISO(start)
  endDate.value = formatDateISO(today)
}

const metricOptions = [
  { label: 'Spend', value: 'spend' },
  { label: 'Impressions', value: 'impressions' },
  { label: 'Clicks', value: 'clicks' },
  { label: 'Leads', value: 'leads' },
  { label: 'CPC', value: 'cpc' },
  { label: 'CTR', value: 'ctr' },
  { label: 'Cost / Lead', value: 'costPerLead' }
]

watch([startDate, endDate, selectedPlatforms, trendMetric], () => {
  const query: Record<string, string> = {
    startDate: startDate.value,
    endDate: endDate.value
  }
  if (selectedPlatforms.value.length) query.platform = selectedPlatforms.value.join(',')
  if (trendMetric.value !== 'spend') query.metric = trendMetric.value

  const current = new URLSearchParams(route.query as Record<string, string>).toString()
  const next = new URLSearchParams(query).toString()
  if (current !== next) {
    router.replace({ query })
  }
}, { deep: true })

watch(
  () => [route.query.startDate, route.query.endDate, route.query.platform, route.query.metric],
  () => {
    startDate.value = validDateString(queryString(route.query.startDate), formatDateISO(thirtyDaysAgo))
    endDate.value = validDateString(queryString(route.query.endDate), formatDateISO(now))
    const platform = queryString(route.query.platform)
    selectedPlatforms.value = typeof platform === 'string'
      ? platform.split(',').map(item => item.trim()).filter(Boolean)
      : []
    const metric = queryString(route.query.metric)
    trendMetric.value = typeof metric === 'string' && allowedTrendMetrics.has(metric) ? metric : 'spend'
  }
)

const leadFunnel = computed(() => {
  const current = totals.value
  if (!current) return []

  return [
    { label: 'New', value: current.leadNew || 0, color: 'bg-info' },
    { label: 'Contacted', value: current.leadContacted || 0, color: 'bg-primary' },
    { label: 'Qualified', value: current.leadQualified || 0, color: 'bg-warning' },
    { label: 'Won', value: current.leadWon || 0, color: 'bg-success' },
    { label: 'Lost', value: current.leadLost || 0, color: 'bg-muted' }
  ]
})

const leadFunnelMax = computed(() => Math.max(...leadFunnel.value.map(stage => Number(stage.value)), 1))

const campaignOutcome = computed(() => {
  const current = totals.value
  if (!current) return null

  const leads = Number(current.leads || 0)
  const contacted = Number(current.leadContactedAt || current.leadContacted || 0)
  const won = Number(current.leadWon || 0)
  const spend = Number(current.spend || 0)

  return {
    contactedRate: leads > 0 ? Math.round((contacted / leads) * 100) : 0,
    winRate: leads > 0 ? Math.round((won / leads) * 100) : 0,
    uncontacted: Number(current.leadUncontacted || 0),
    avgResponseMinutes: current.avgResponseMinutes == null ? null : Math.round(Number(current.avgResponseMinutes)),
    spendPerWonLead: won > 0 ? spend / won : null
  }
})

function formatResponseTime(minutes: number | null | undefined) {
  if (minutes == null || Number.isNaN(minutes)) return '-'
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-[1400px] mx-auto">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-default">
        Ad Performance
      </h1>
      <p class="text-sm text-muted mt-1">
        Your advertising performance across all platforms
      </p>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 p-4 bg-elevated/50 rounded-lg border border-default">
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
      <div class="flex items-center gap-1">
        <UButton
          v-for="p in datePresets"
          :key="p.value"
          :label="p.label"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="setPreset(p.value)"
        />
      </div>
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

    <!-- KPI Cards — top row -->
    <div v-if="loading" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      <USkeleton v-for="i in 8" :key="i" class="h-24 rounded-lg" />
    </div>
    <div v-else-if="totals" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      <div
        v-for="kpi in [
          { label: 'Total Spend', value: fmtCurrency(totals.spend), change: pctChange(totals.spend, previousPeriod?.spend), icon: 'i-lucide-wallet' },
          { label: 'Impressions', value: fmtCompact(totals.impressions), change: pctChange(totals.impressions, previousPeriod?.impressions), icon: 'i-lucide-eye' },
          { label: 'Clicks', value: fmtCompact(totals.clicks), change: pctChange(totals.clicks, previousPeriod?.clicks), icon: 'i-lucide-mouse-pointer-click' },
          { label: 'Leads', value: fmtCompact(totals.leads || 0), change: pctChange(totals.leads, previousPeriod?.leads), icon: 'i-lucide-inbox' },
          { label: 'CTR', value: fmtPercent(totals.ctr), change: pctChange(totals.ctr, previousPeriod?.ctr), icon: 'i-lucide-percent' },
          { label: 'CPC', value: fmtCurrency(totals.cpc, 2), change: pctChange(totals.cpc, previousPeriod?.cpc), icon: 'i-lucide-hand-coins', invert: true },
          { label: 'Cost / Lead', value: totals.costPerLead != null ? fmtCurrency(totals.costPerLead, 2) : '-', change: pctChange(totals.costPerLead, previousPeriod?.costPerLead), icon: 'i-lucide-user-round-check', invert: true },
          { label: 'Conversions', value: fmtCompact(totals.conversions), change: pctChange(totals.conversions, previousPeriod?.conversions), icon: 'i-lucide-target' }
        ]"
        :key="kpi.label"
        class="p-4 rounded-lg border border-default bg-elevated/30"
      >
        <div class="flex items-center gap-2 mb-2">
          <UIcon :name="kpi.icon" class="w-4 h-4 text-muted" />
          <span class="text-xs text-muted font-medium">{{ kpi.label }}</span>
        </div>
        <p class="text-xl font-bold tabular-nums text-default">
          {{ kpi.value }}
        </p>
        <div v-if="kpi.change !== null" class="flex items-center gap-1 mt-1">
          <UIcon
            :name="kpi.change > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
            class="w-3.5 h-3.5"
            :class="(kpi.invert ? kpi.change < 0 : kpi.change > 0) ? 'text-green-500' : 'text-red-500'"
          />
          <span class="text-xs font-medium tabular-nums" :class="(kpi.invert ? kpi.change < 0 : kpi.change > 0) ? 'text-green-500' : 'text-red-500'">
            {{ kpi.change > 0 ? '+' : '' }}{{ kpi.change.toFixed(1) }}%
          </span>
          <span class="text-xs text-muted">vs prev</span>
        </div>
      </div>
    </div>

    <!-- Main content + Sidebar -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: charts + campaigns (2/3) -->
      <div class="lg:col-span-2 space-y-6">
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

        <!-- Campaign Table (with expand for breakdowns, creatives, AI) -->
        <AnalyticsCampaignTable
          :start-date="startDate"
          :end-date="endDate"
          :platforms="selectedPlatforms"
          api-base="/api/portal/analytics"
          :hide-columns="['budget', 'variance']"
          show-lead-columns
          lead-link-base="/portal/leads"
        />
      </div>

      <!-- Right: Performance Insights sidebar (1/3) -->
      <div class="space-y-6">
        <!-- Key Performance Metrics -->
        <div class="border border-default rounded-lg p-4">
          <h3 class="text-sm font-semibold text-default mb-4">
            Performance Insights
          </h3>

          <div v-if="loading" class="space-y-4">
            <USkeleton v-for="i in 5" :key="i" class="h-12 w-full rounded" />
          </div>
          <div v-else-if="totals" class="space-y-4">
            <div
              v-for="metric in [
                { label: 'CPM', description: 'Cost per 1,000 views', value: totals.cpm != null ? fmtCurrency(totals.cpm, 2) : '-', change: pctChange(totals.cpm, previousPeriod?.cpm), invert: true, icon: 'i-lucide-eye' },
                { label: 'Cost / Lead', description: 'Spend per portal-visible lead', value: totals.costPerLead != null ? fmtCurrency(totals.costPerLead, 2) : '-', change: pctChange(totals.costPerLead, previousPeriod?.costPerLead), invert: true, icon: 'i-lucide-user-round-check' },
                { label: 'Cost / Conversion', description: 'Spend per lead or sale', value: totals.costPerConversion != null ? fmtCurrency(totals.costPerConversion, 2) : '-', change: pctChange(totals.costPerConversion, previousPeriod?.costPerConversion), invert: true, icon: 'i-lucide-receipt' },
                { label: 'Conversion Rate', description: 'Clicks that convert', value: totals.conversionRate != null ? fmtPercent(totals.conversionRate) : '-', change: pctChange(totals.conversionRate, previousPeriod?.conversionRate), invert: false, icon: 'i-lucide-funnel' },
                { label: 'ROAS', description: 'Revenue per $1 spent', value: totals.roas != null ? totals.roas.toFixed(2) + 'x' : '-', change: pctChange(totals.roas, previousPeriod?.roas), invert: false, icon: 'i-lucide-trending-up' }
              ]"
              :key="metric.label"
              class="flex items-start gap-3"
            >
              <div class="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center shrink-0 mt-0.5">
                <UIcon :name="metric.icon" class="w-4 h-4 text-muted" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted font-medium">{{ metric.label }}</span>
                  <div v-if="metric.change !== null" class="flex items-center gap-0.5">
                    <UIcon
                      :name="metric.change > 0 ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'"
                      class="w-3 h-3"
                      :class="(metric.invert ? metric.change < 0 : metric.change > 0) ? 'text-green-500' : 'text-red-500'"
                    />
                    <span class="text-xs tabular-nums" :class="(metric.invert ? metric.change < 0 : metric.change > 0) ? 'text-green-500' : 'text-red-500'">
                      {{ Math.abs(metric.change).toFixed(1) }}%
                    </span>
                  </div>
                </div>
                <p class="text-lg font-bold tabular-nums text-default">
                  {{ metric.value }}
                </p>
                <p class="text-xs text-muted">
                  {{ metric.description }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div v-if="campaignOutcome" class="border border-default rounded-lg p-4">
          <div class="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 class="text-sm font-semibold text-default">
                Campaign Outcome Health
              </h3>
              <p class="text-xs text-muted mt-1">
                Lead follow-up and conversion from shared advertising activity.
              </p>
            </div>
            <UButton
              to="/portal/leads"
              icon="i-lucide-inbox"
              size="xs"
              color="neutral"
              variant="outline"
            >
              Leads
            </UButton>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-lg border border-default bg-default p-3">
              <p class="text-xs text-muted">
                Contacted rate
              </p>
              <p class="mt-1 text-lg font-semibold">
                {{ campaignOutcome.contactedRate }}%
              </p>
            </div>
            <div class="rounded-lg border border-default bg-default p-3">
              <p class="text-xs text-muted">
                Win rate
              </p>
              <p class="mt-1 text-lg font-semibold">
                {{ campaignOutcome.winRate }}%
              </p>
            </div>
            <div class="rounded-lg border border-default bg-default p-3">
              <p class="text-xs text-muted">
                Avg response
              </p>
              <p class="mt-1 text-lg font-semibold">
                {{ formatResponseTime(campaignOutcome.avgResponseMinutes) }}
              </p>
            </div>
            <div class="rounded-lg border border-default bg-default p-3">
              <p class="text-xs text-muted">
                Uncontacted
              </p>
              <p class="mt-1 text-lg font-semibold" :class="campaignOutcome.uncontacted > 0 ? 'text-warning' : ''">
                {{ campaignOutcome.uncontacted }}
              </p>
            </div>
          </div>

          <div class="mt-3 rounded-lg border border-default bg-default p-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-muted">Spend per won lead</span>
              <span class="text-sm font-semibold">
                {{ campaignOutcome.spendPerWonLead == null ? '-' : fmtCurrency(campaignOutcome.spendPerWonLead, 2) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Lead Funnel -->
        <div class="border border-default rounded-lg p-4">
          <div class="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 class="text-sm font-semibold text-default">
                Lead Progression
              </h3>
              <p class="text-xs text-muted mt-1">
                Portal-visible leads attributed to shared campaigns.
              </p>
            </div>
            <UBadge color="neutral" variant="subtle">
              {{ fmtCompact(totals?.leads || 0) }} leads
            </UBadge>
          </div>

          <div v-if="loading" class="space-y-3">
            <USkeleton v-for="i in 5" :key="i" class="h-8 w-full rounded" />
          </div>
          <div v-else-if="leadFunnel.length" class="space-y-3">
            <div
              v-for="stage in leadFunnel"
              :key="stage.label"
              class="space-y-1"
            >
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">{{ stage.label }}</span>
                <span class="font-medium tabular-nums">{{ fmtCompact(stage.value) }}</span>
              </div>
              <div class="h-2 rounded-full bg-default overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :class="stage.color"
                  :style="{ width: `${Math.max(4, Math.round((Number(stage.value) / leadFunnelMax) * 100))}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Platform Breakdown -->
        <div v-if="byPlatform.length" class="border border-default rounded-lg p-4">
          <h3 class="text-sm font-semibold text-default mb-4">
            By Platform
          </h3>
          <div class="space-y-3">
            <div v-for="p in byPlatform" :key="p.platform" class="space-y-2">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: p.color }" />
                <UIcon :name="getPlatformIcon(p.platform)" class="w-3.5 h-3.5 text-muted shrink-0" />
                <span class="text-sm font-medium flex-1">{{ p.displayName }}</span>
                <span class="text-sm tabular-nums font-medium">{{ fmtCurrency(p.spend) }}</span>
              </div>
              <!-- Platform spend bar -->
              <div class="ml-5">
                <div class="w-full h-1.5 bg-default rounded-full overflow-hidden">
                  <div class="h-full rounded-full" :style="{ width: `${Math.min(100, p.pctOfTotal)}%`, backgroundColor: p.color }" />
                </div>
              </div>
              <!-- Platform mini-metrics -->
              <div class="ml-5 flex items-center gap-3 text-xs text-muted">
                <span class="tabular-nums">{{ fmtCompact(p.impressions) }} impr.</span>
                <span class="tabular-nums">{{ fmtCompact(p.leads || 0) }} leads</span>
                <span v-if="p.leadUncontacted" class="tabular-nums text-warning">{{ fmtCompact(p.leadUncontacted) }} uncontacted</span>
                <span v-if="p.costPerLead != null" class="tabular-nums">{{ fmtCurrency(p.costPerLead, 2) }} CPL</span>
                <span class="tabular-nums">{{ fmtPercent(p.ctr) }} CTR</span>
                <span class="tabular-nums">{{ fmtCurrency(p.cpc, 2) }} CPC</span>
                <span v-if="p.conversions > 0" class="tabular-nums">{{ fmtCompact(p.conversions) }} conv.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Explainer -->
        <div class="border border-default rounded-lg p-4 bg-elevated/20">
          <h4 class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Glossary
          </h4>
          <dl class="space-y-1.5 text-xs text-muted">
            <div>
              <dt class="font-medium text-default inline">
                CPC
              </dt> <dd class="inline">
                — Cost per click
              </dd>
            </div>
            <div>
              <dt class="font-medium text-default inline">
                CPM
              </dt> <dd class="inline">
                — Cost per 1,000 impressions
              </dd>
            </div>
            <div>
              <dt class="font-medium text-default inline">
                CTR
              </dt> <dd class="inline">
                — Click-through rate (clicks / impressions)
              </dd>
            </div>
            <div>
              <dt class="font-medium text-default inline">
                ROAS
              </dt> <dd class="inline">
                — Return on ad spend (revenue / spend)
              </dd>
            </div>
            <div>
              <dt class="font-medium text-default inline">
                Conv. Rate
              </dt> <dd class="inline">
                — Conversions / clicks
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </div>
</template>
