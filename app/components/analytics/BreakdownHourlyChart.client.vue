<script setup lang="ts">
/**
 * Hourly activity distribution chart.
 * Shows 24 vertical bars (one per hour) with spend/impressions.
 * Highlights peak hours and quiet periods.
 */
const props = defineProps<{
  items: Array<{
    dimensionValue: string
    spend: number
    impressions: number
    clicks: number
    conversions: number
  }>
}>()

const { fmtCurrency, fmtCompact } = useAnalytics()

// Fill in all 24 hours, even if some have no data
const hourlyData = computed(() => {
  const lookup = new Map<number, typeof props.items[0]>()
  for (const item of props.items) {
    const h = parseInt(item.dimensionValue, 10)
    if (!isNaN(h)) {
      const existing = lookup.get(h)
      if (existing) {
        // Aggregate if multiple rows for same hour
        existing.spend += item.spend
        existing.impressions += item.impressions
        existing.clicks += item.clicks
        existing.conversions += item.conversions
      } else {
        lookup.set(h, { ...item })
      }
    }
  }

  return Array.from({ length: 24 }, (_, i) => {
    const data = lookup.get(i)
    return {
      hour: i,
      label: formatHourLabel(i),
      spend: data?.spend || 0,
      impressions: data?.impressions || 0,
      clicks: data?.clicks || 0,
      conversions: data?.conversions || 0,
    }
  })
})

const maxImpressions = computed(() =>
  Math.max(...hourlyData.value.map(h => h.impressions), 1)
)

const totalSpend = computed(() =>
  hourlyData.value.reduce((sum, h) => sum + h.spend, 0)
)

// Find peak hours (top 3 by impressions)
const peakHours = computed(() => {
  const sorted = [...hourlyData.value].sort((a, b) => b.impressions - a.impressions)
  return new Set(sorted.slice(0, 3).filter(h => h.impressions > 0).map(h => h.hour))
})

function barHeight(impressions: number): string {
  return `${Math.max((impressions / maxImpressions.value) * 100, 1)}%`
}

function formatHourLabel(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

const hoveredHour = ref<number | null>(null)
</script>

<template>
  <div class="min-w-0">
    <div class="flex items-center gap-1.5 mb-2">
      <UIcon name="i-lucide-clock" class="w-3.5 h-3.5 text-muted" />
      <h4 class="text-xs font-semibold text-default">Activity by Hour</h4>
      <span class="text-[10px] text-muted ml-auto">{{ fmtCurrency(totalSpend) }} total</span>
    </div>

    <div v-if="!items.length" class="text-xs text-muted italic py-2">
      No hourly data available
    </div>

    <div v-else>
      <!-- Bar chart -->
      <div class="flex gap-px h-20 mb-1">
        <div
          v-for="h in hourlyData"
          :key="h.hour"
          class="flex-1 relative group cursor-pointer flex flex-col justify-end"
          @mouseenter="hoveredHour = h.hour"
          @mouseleave="hoveredHour = null"
        >
          <div
            class="w-full rounded-t-sm transition-all duration-200"
            :class="[
              peakHours.has(h.hour) ? 'bg-primary/40' : 'bg-primary/20',
              hoveredHour === h.hour ? 'bg-primary/50' : '',
            ]"
            :style="{ height: barHeight(h.impressions) }"
          />

          <!-- Tooltip -->
          <div
            v-if="hoveredHour === h.hour && h.impressions > 0"
            class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 bg-default border border-default rounded-md shadow-lg px-2 py-1.5 whitespace-nowrap pointer-events-none"
          >
            <p class="text-xs font-semibold text-default">{{ h.hour }}:00 – {{ h.hour }}:59</p>
            <div class="flex flex-col gap-0.5 mt-0.5">
              <span class="text-[10px] text-muted tabular-nums">{{ fmtCompact(h.impressions) }} impressions</span>
              <span class="text-[10px] text-muted tabular-nums">{{ fmtCompact(h.clicks) }} clicks</span>
              <span class="text-[10px] text-muted tabular-nums">{{ fmtCurrency(h.spend) }} spend</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Hour labels (show every 3rd) -->
      <div class="flex gap-px text-[9px] text-muted">
        <div
          v-for="h in hourlyData"
          :key="h.hour"
          class="flex-1 text-center"
        >
          <span v-if="h.hour % 3 === 0">{{ h.label }}</span>
        </div>
      </div>

      <!-- Peak hours summary -->
      <div v-if="peakHours.size > 0" class="mt-2 flex items-center gap-1 text-[10px] text-muted">
        <UIcon name="i-lucide-trending-up" class="w-3 h-3 text-primary shrink-0" />
        <span>Peak:
          <span class="font-medium text-default">
            {{ [...peakHours].map(h => `${formatHourLabel(h)}`).join(', ') }}
          </span>
        </span>
      </div>
    </div>
  </div>
</template>
