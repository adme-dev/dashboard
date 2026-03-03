<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { fmtCurrency, fmtCompact, fmtPercent, getPlatformLabel, getPlatformIcon } = useAnalytics()

const route = useRoute()
const platform = computed(() => route.params.platform as string)

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
  platform: platform.value,
}))

// Overview
const { data: overviewData, status: overviewStatus } = useFetch('/api/portal/analytics/overview', {
  query: apiQuery,
  watch: [apiQuery],
})
const overview = computed(() => overviewData.value as any)
const totals = computed(() => overview.value?.totals || null)

// Campaigns
const campaignQuery = computed(() => ({
  ...apiQuery.value,
  limit: '50',
  sortBy: 'spend',
  sortDir: 'desc',
}))
const { data: campaignData, status: campaignStatus } = useFetch('/api/portal/analytics/campaigns', {
  query: campaignQuery,
  watch: [campaignQuery],
})
const campaigns = computed(() => (campaignData.value as any)?.campaigns || [])

// Trend
const { data: trendData, status: trendStatus } = useFetch('/api/portal/analytics/trends', {
  query: computed(() => ({ ...apiQuery.value, metric: 'spend', groupBy: 'day' })),
  watch: [apiQuery],
})
const trendPoints = computed(() => (trendData.value as any)?.dataPoints || [])

const loading = computed(() => overviewStatus.value === 'pending')
</script>

<template>
  <div class="p-6 space-y-6 max-w-[1200px] mx-auto">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <UButton to="/portal/analytics" variant="ghost" color="neutral" icon="i-lucide-arrow-left" size="sm" />
      <UIcon :name="getPlatformIcon(platform)" class="w-5 h-5 text-muted" />
      <div>
        <h1 class="text-2xl font-bold text-default">{{ getPlatformLabel(platform) }}</h1>
        <p class="text-sm text-muted">Platform-specific performance</p>
      </div>
    </div>

    <!-- Date Range -->
    <div class="flex items-center gap-3">
      <UInput v-model="startDate" type="date" size="sm" class="w-36" />
      <span class="text-muted text-sm">to</span>
      <UInput v-model="endDate" type="date" size="sm" class="w-36" />
    </div>

    <!-- KPI Summary -->
    <div v-if="loading" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <USkeleton v-for="i in 4" :key="i" class="h-20 rounded-lg" />
    </div>
    <div v-else-if="totals" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div v-for="kpi in [
        { label: 'Spend', value: fmtCurrency(totals.spend), icon: 'i-lucide-wallet' },
        { label: 'Clicks', value: fmtCompact(totals.clicks), icon: 'i-lucide-mouse-pointer-click' },
        { label: 'CTR', value: fmtPercent(totals.ctr), icon: 'i-lucide-percent' },
        { label: 'CPC', value: fmtCurrency(totals.cpc, 2), icon: 'i-lucide-hand-coins' },
      ]" :key="kpi.label" class="p-4 rounded-lg border border-default bg-elevated/30">
        <div class="flex items-center gap-2 mb-1">
          <UIcon :name="kpi.icon" class="w-4 h-4 text-muted" />
          <span class="text-xs text-muted">{{ kpi.label }}</span>
        </div>
        <p class="text-xl font-bold tabular-nums">{{ kpi.value }}</p>
      </div>
    </div>

    <!-- Trend -->
    <div class="border border-default rounded-lg p-4">
      <h3 class="text-sm font-semibold mb-3">Spend Trend</h3>
      <AnalyticsTrendChart :data="trendPoints" metric="spend" :loading="trendStatus === 'pending'" />
    </div>

    <!-- Campaign Table -->
    <div>
      <h3 class="text-sm font-semibold mb-3">Campaigns</h3>
      <div class="border border-default rounded-lg overflow-hidden">
        <div v-if="campaignStatus === 'pending'" class="p-4 space-y-3">
          <USkeleton v-for="i in 5" :key="i" class="h-10 w-full rounded" />
        </div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-default bg-elevated/30">
              <th class="px-3 py-2.5 text-left text-xs font-medium text-muted">Campaign</th>
              <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">Spend</th>
              <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">Impr.</th>
              <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">Clicks</th>
              <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">CTR</th>
              <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">CPC</th>
              <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">Conv.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in campaigns" :key="c.campaignId" class="border-b border-default/50 hover:bg-elevated/30">
              <td class="px-3 py-2.5">
                <span class="truncate max-w-[250px] block" :title="c.campaignName">{{ c.campaignName }}</span>
                <span v-if="c.campaignStatus" class="text-xs text-muted">{{ c.campaignStatus }}</span>
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums font-medium">{{ fmtCurrency(c.spend) }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCompact(c.impressions) }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCompact(c.clicks) }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtPercent(c.ctr) }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCurrency(c.cpc, 2) }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCompact(c.conversions) }}</td>
            </tr>
            <tr v-if="!campaigns.length">
              <td colspan="7" class="px-3 py-8 text-center text-muted">No campaign data</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
