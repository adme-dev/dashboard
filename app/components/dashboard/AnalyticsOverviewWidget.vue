<script setup lang="ts">
// Last 7 days overview across all platforms
const now = new Date()
const sevenDaysAgo = new Date(now)
sevenDaysAgo.setDate(now.getDate() - 7)

const startDate = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`
const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>
const data = ref<any | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshOverview() {
  status.value = 'pending'
  try {
    data.value = await apiFetch<any>('/api/agency/analytics/overview', {
      query: { startDate, endDate },
    })
    status.value = 'success'
  } catch {
    status.value = 'error'
  }
}

refreshOverview()

const overview = computed(() => data.value as any)
const totals = computed(() => overview.value?.totals || null)
const topPlatforms = computed(() => (overview.value?.byPlatform || []).slice(0, 3))

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

const fmtCompact = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(0)
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bar-chart-4" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Analytics Overview</h3>
        </div>
        <UButton to="/agency/analytics" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Full Dashboard
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton class="h-16 w-full rounded" />
      <USkeleton class="h-10 w-full rounded" />
    </div>
    <div v-else-if="!totals" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-bar-chart-4" class="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p class="text-sm">No analytics data</p>
    </div>
    <div v-else>
      <!-- KPI row -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="text-center">
          <p class="text-lg font-bold text-[var(--ui-text-highlighted)] tabular-nums">{{ formatCurrency(totals.spend) }}</p>
          <p class="text-xs text-[var(--ui-text-muted)]">Spend</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-bold text-[var(--ui-text-highlighted)] tabular-nums">{{ fmtCompact(totals.clicks) }}</p>
          <p class="text-xs text-[var(--ui-text-muted)]">Clicks</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-bold text-[var(--ui-text-highlighted)] tabular-nums">{{ totals.ctr != null ? totals.ctr.toFixed(2) + '%' : '-' }}</p>
          <p class="text-xs text-[var(--ui-text-muted)]">CTR</p>
        </div>
      </div>

      <!-- Top platforms -->
      <div v-if="topPlatforms.length" class="space-y-2 pt-3 border-t border-[var(--ui-border)]">
        <p class="text-xs text-[var(--ui-text-muted)] font-medium">Top Platforms (7d)</p>
        <div v-for="p in topPlatforms" :key="p.platform" class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: p.color }" />
          <span class="text-xs flex-1 truncate">{{ p.displayName }}</span>
          <span class="text-xs font-medium tabular-nums">{{ formatCurrency(p.spend) }}</span>
          <span class="text-xs text-[var(--ui-text-muted)] tabular-nums w-10 text-right">{{ p.pctOfTotal.toFixed(0) }}%</span>
        </div>
      </div>

      <p class="text-xs text-[var(--ui-text-muted)] mt-3 text-center">
        Last 7 days &middot; All platforms
      </p>
    </div>
  </UCard>
</template>
