<script setup lang="ts">
// Last 30 days mini-summary for portal dashboard
const now = new Date()
const thirtyDaysAgo = new Date(now)
thirtyDaysAgo.setDate(now.getDate() - 30)

const startDate = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`
const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const { data, status } = useFetch('/api/portal/analytics/overview', {
  query: { startDate, endDate },
})

const totals = computed(() => (data.value as any)?.totals || null)
const previousPeriod = computed(() => (data.value as any)?.previousPeriod || null)

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

const fmtCompact = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(0)
}

function pctChange(current: number | null, prev: number | null): number | null {
  if (current == null || prev == null || prev === 0) return null
  return ((current - prev) / prev) * 100
}

const spendChange = computed(() => totals.value && previousPeriod.value ? pctChange(totals.value.spend, previousPeriod.value.spend) : null)
</script>

<template>
  <div v-if="status === 'pending'" class="space-y-3">
    <USkeleton class="h-10 w-full rounded" />
    <USkeleton class="h-6 w-3/4 rounded" />
  </div>
  <div v-else-if="!totals" class="text-center py-4 text-muted text-sm">
    No ad performance data
  </div>
  <div v-else class="space-y-3">
    <div class="grid grid-cols-3 gap-3">
      <div class="text-center">
        <p class="text-lg font-bold tabular-nums">{{ fmtCurrency(totals.spend) }}</p>
        <p class="text-xs text-muted">Spend</p>
      </div>
      <div class="text-center">
        <p class="text-lg font-bold tabular-nums">{{ fmtCompact(totals.clicks) }}</p>
        <p class="text-xs text-muted">Clicks</p>
      </div>
      <div class="text-center">
        <p class="text-lg font-bold tabular-nums">{{ totals.ctr != null ? totals.ctr.toFixed(2) + '%' : '-' }}</p>
        <p class="text-xs text-muted">CTR</p>
      </div>
    </div>
    <div v-if="spendChange !== null" class="flex items-center justify-center gap-1.5">
      <UIcon
        :name="spendChange > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
        class="w-3.5 h-3.5"
        :class="spendChange > 0 ? 'text-blue-500' : 'text-green-500'"
      />
      <span class="text-xs text-muted">
        Spend {{ spendChange > 0 ? 'up' : 'down' }} {{ Math.abs(spendChange).toFixed(1) }}% vs previous 30 days
      </span>
    </div>
  </div>
</template>
