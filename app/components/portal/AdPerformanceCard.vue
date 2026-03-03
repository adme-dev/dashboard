<script setup lang="ts">
const { fmtCurrency, fmtCompact, fmtPercent, getPlatformColor, PLATFORM_ICONS } = useAnalytics()

// Last 30 days
const now = new Date()
const thirtyDaysAgo = new Date(now)
thirtyDaysAgo.setDate(now.getDate() - 30)

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const { data, status } = useFetch('/api/portal/analytics/overview', {
  query: { startDate: toISO(thirtyDaysAgo), endDate: toISO(now) },
})

const totals = computed(() => (data.value as any)?.totals || null)
const prev = computed(() => (data.value as any)?.previousPeriod || null)
const byPlatform = computed(() => (data.value as any)?.byPlatform || [])

function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / previous) * 100
}
</script>

<template>
  <div v-if="status === 'pending'" class="space-y-3">
    <USkeleton class="h-8 w-full rounded" />
    <USkeleton class="h-8 w-3/4 rounded" />
    <USkeleton class="h-8 w-1/2 rounded" />
  </div>

  <div v-else-if="!totals" class="text-sm text-muted text-center py-4">
    No ad data yet
  </div>

  <div v-else class="space-y-4">
    <!-- Key metrics grid -->
    <div class="grid grid-cols-2 gap-3">
      <div v-for="m in [
        { label: 'Spend', value: fmtCurrency(totals.spend), change: pctChange(totals.spend, prev?.spend), invert: false },
        { label: 'Clicks', value: fmtCompact(totals.clicks), change: pctChange(totals.clicks, prev?.clicks), invert: false },
        { label: 'CTR', value: fmtPercent(totals.ctr), change: pctChange(totals.ctr, prev?.ctr), invert: false },
        { label: 'Conversions', value: fmtCompact(totals.conversions), change: pctChange(totals.conversions, prev?.conversions), invert: false },
      ]" :key="m.label">
        <p class="text-xs text-muted">{{ m.label }}</p>
        <p class="text-sm font-semibold tabular-nums">{{ m.value }}</p>
        <div v-if="m.change !== null" class="flex items-center gap-0.5 mt-0.5">
          <UIcon
            :name="m.change > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
            class="w-3 h-3"
            :class="(m.invert ? m.change < 0 : m.change > 0) ? 'text-green-500' : 'text-red-500'"
          />
          <span class="text-xs tabular-nums" :class="(m.invert ? m.change < 0 : m.change > 0) ? 'text-green-500' : 'text-red-500'">
            {{ m.change > 0 ? '+' : '' }}{{ m.change.toFixed(1) }}%
          </span>
        </div>
      </div>
    </div>

    <!-- Platform mini-bars -->
    <div v-if="byPlatform.length" class="space-y-1.5 pt-3 border-t border-default">
      <div v-for="p in byPlatform.slice(0, 4)" :key="p.platform" class="flex items-center gap-2">
        <UIcon :name="PLATFORM_ICONS[p.platform] || 'i-lucide-globe'" class="w-3.5 h-3.5 text-muted shrink-0" />
        <div class="flex-1 h-1.5 bg-default rounded-full overflow-hidden">
          <div class="h-full rounded-full" :style="{ width: `${Math.min(100, p.pctOfTotal)}%`, backgroundColor: getPlatformColor(p.platform) }" />
        </div>
        <span class="text-xs tabular-nums text-muted w-14 text-right">{{ fmtCurrency(p.spend) }}</span>
      </div>
    </div>
  </div>
</template>
