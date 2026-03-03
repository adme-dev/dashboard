<script setup lang="ts">
// Fetch from the new analytics daily-spend endpoint which supports all 8 platforms
const now = new Date()
const sevenDaysAgo = new Date(now)
sevenDaysAgo.setDate(now.getDate() - 7)
const startDate = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`
const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const { data: analyticsData, status: analyticsStatus } = await useFetch('/api/agency/analytics/daily-spend', {
  query: { startDate, endDate },
})

// Fallback to the old per-platform fetch if the new endpoint isn't available
const { data: metaData, status: metaStatus } = await useFetch('/api/agency/social/daily-spend', { query: { platform: 'meta' } })
const { data: googleData, status: googleStatus } = await useFetch('/api/agency/social/daily-spend', { query: { platform: 'google' } })

const status = computed(() => {
  if (analyticsStatus.value === 'pending') return 'pending'
  if (metaStatus.value === 'pending' || googleStatus.value === 'pending') return 'pending'
  return 'success'
})

// Merge all platforms by date
const data = computed(() => {
  // Try the new endpoint first
  const analyticsResult = analyticsData.value as any
  if (analyticsResult?.days?.length) {
    return { days: analyticsResult.days }
  }

  // Fallback: merge Meta + Google
  const metaDays = (metaData.value as any) || []
  const googleDays = (googleData.value as any) || []
  const byDate: Record<string, any> = {}
  for (const d of [...metaDays, ...googleDays]) {
    if (!byDate[d.date]) byDate[d.date] = { date: d.date, spend: 0, impressions: 0, clicks: 0 }
    byDate[d.date].spend += d.spend || 0
    byDate[d.date].impressions += d.impressions || 0
    byDate[d.date].clicks += d.clicks || 0
  }
  return { days: Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date)) }
})

const dailyData = computed(() => (data.value as any)?.data || (data.value as any)?.days || [])

const last7Days = computed(() => dailyData.value.slice(-7))

const totalSpend = computed(() => last7Days.value.reduce((sum: number, d: any) => sum + (d.spend || 0), 0))
const totalImpressions = computed(() => last7Days.value.reduce((sum: number, d: any) => sum + (d.impressions || 0), 0))
const totalClicks = computed(() => last7Days.value.reduce((sum: number, d: any) => sum + (d.clicks || 0), 0))

const ctr = computed(() => totalImpressions.value > 0 ? ((totalClicks.value / totalImpressions.value) * 100).toFixed(2) : '0.00')
const cpc = computed(() => totalClicks.value > 0 ? (totalSpend.value / totalClicks.value).toFixed(2) : '0.00')
const cpm = computed(() => totalImpressions.value > 0 ? ((totalSpend.value / totalImpressions.value) * 1000).toFixed(2) : '0.00')

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

// Simple sparkline as CSS bars
const maxSpend = computed(() => Math.max(...last7Days.value.map((d: any) => d.spend || 0), 1))
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bar-chart-2" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Platform Performance</h3>
        </div>
        <UButton to="/agency/analytics" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Details
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton class="h-20 w-full rounded" />
      <USkeleton class="h-10 w-full rounded" />
    </div>
    <div v-else-if="!last7Days.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-bar-chart-2" class="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p class="text-sm">No performance data</p>
    </div>
    <div v-else>
      <!-- Mini bar chart (last 7 days) -->
      <div class="flex items-end gap-1 h-16 mb-4">
        <div
          v-for="(day, i) in last7Days"
          :key="i"
          class="flex-1 bg-blue-500 dark:bg-blue-400 rounded-t transition-all duration-300 min-h-[2px]"
          :style="{ height: `${((day.spend || 0) / maxSpend) * 100}%` }"
        />
      </div>

      <!-- Summary metrics -->
      <div class="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--ui-border)]">
        <div class="text-center">
          <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ ctr }}%</p>
          <p class="text-xs text-[var(--ui-text-muted)]">CTR</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">${{ cpc }}</p>
          <p class="text-xs text-[var(--ui-text-muted)]">CPC</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-semibold text-[var(--ui-text-highlighted)]">${{ cpm }}</p>
          <p class="text-xs text-[var(--ui-text-muted)]">CPM</p>
        </div>
      </div>

      <p class="text-xs text-[var(--ui-text-muted)] mt-2 text-center">
        Last 7 days &middot; {{ formatCurrency(totalSpend) }} total spend &middot; All platforms
      </p>
    </div>
  </UCard>
</template>
