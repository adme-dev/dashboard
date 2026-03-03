<script setup lang="ts">
const props = defineProps<{
  totals: {
    spend: number
    impressions: number
    clicks: number
    conversions: number
    revenue: number
    cpc: number | null
    cpm: number | null
    ctr: number | null
    roas: number | null
    budget?: number
  } | null
  previousPeriod?: {
    spend: number
    impressions: number
    clicks: number
    conversions: number
    revenue: number
    cpc: number | null
    cpm: number | null
    ctr: number | null
    roas: number | null
  } | null
  loading?: boolean
}>()

const { fmtCurrency, fmtCompact, fmtPercent } = useAnalytics()

interface KPI {
  label: string
  value: string
  change: number | null
  icon: string
  invertColor?: boolean // true = lower is better (e.g. CPC)
}

const kpis = computed<KPI[]>(() => {
  const t = props.totals
  const p = props.previousPeriod
  if (!t) return []

  function pctChange(current: number | null, prev: number | null): number | null {
    if (current == null || prev == null || prev === 0) return null
    return ((current - prev) / prev) * 100
  }

  return [
    {
      label: 'Total Spend',
      value: fmtCurrency(t.spend),
      change: pctChange(t.spend, p?.spend ?? null),
      icon: 'i-lucide-wallet',
    },
    {
      label: 'Impressions',
      value: fmtCompact(t.impressions),
      change: pctChange(t.impressions, p?.impressions ?? null),
      icon: 'i-lucide-eye',
    },
    {
      label: 'Clicks',
      value: fmtCompact(t.clicks),
      change: pctChange(t.clicks, p?.clicks ?? null),
      icon: 'i-lucide-mouse-pointer-click',
    },
    {
      label: 'CTR',
      value: fmtPercent(t.ctr),
      change: pctChange(t.ctr, p?.ctr ?? null),
      icon: 'i-lucide-percent',
    },
    {
      label: 'CPC',
      value: fmtCurrency(t.cpc, 2),
      change: pctChange(t.cpc, p?.cpc ?? null),
      icon: 'i-lucide-hand-coins',
      invertColor: true,
    },
    {
      label: 'Conversions',
      value: fmtCompact(t.conversions),
      change: pctChange(t.conversions, p?.conversions ?? null),
      icon: 'i-lucide-target',
    },
  ]
})
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
    <template v-if="loading">
      <USkeleton v-for="i in 6" :key="i" class="h-24 rounded-lg" />
    </template>
    <template v-else>
      <div
        v-for="kpi in kpis"
        :key="kpi.label"
        class="p-4 rounded-lg border border-default bg-elevated/30 hover:bg-elevated/50 transition-colors"
      >
        <div class="flex items-center gap-2 mb-2">
          <UIcon :name="kpi.icon" class="w-4 h-4 text-muted" />
          <span class="text-xs text-muted font-medium">{{ kpi.label }}</span>
        </div>
        <p class="text-xl font-bold tabular-nums text-default">{{ kpi.value }}</p>
        <div v-if="kpi.change !== null" class="flex items-center gap-1 mt-1">
          <UIcon
            :name="kpi.change > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
            class="w-3.5 h-3.5"
            :class="(kpi.invertColor ? kpi.change < 0 : kpi.change > 0) ? 'text-green-500' : 'text-red-500'"
          />
          <span
            class="text-xs font-medium tabular-nums"
            :class="(kpi.invertColor ? kpi.change < 0 : kpi.change > 0) ? 'text-green-500' : 'text-red-500'"
          >
            {{ kpi.change > 0 ? '+' : '' }}{{ kpi.change.toFixed(1) }}%
          </span>
          <span class="text-xs text-muted">vs prev</span>
        </div>
      </div>
    </template>
  </div>
</template>
