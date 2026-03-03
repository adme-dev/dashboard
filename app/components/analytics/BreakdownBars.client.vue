<script setup lang="ts">
/**
 * Horizontal bar chart for a single breakdown dimension (age, gender, device, geo).
 * Canvas-free — uses pure CSS bars for simplicity and accessibility.
 */
const props = defineProps<{
  title: string
  icon: string
  items: Array<{
    dimensionValue: string
    spend: number
    impressions: number
    clicks: number
    ctr: number | null
    cpc: number | null
  }>
}>()

const { fmtCurrency, fmtCompact, fmtPercent } = useAnalytics()

const maxSpend = computed(() => {
  if (!props.items.length) return 1
  return Math.max(...props.items.map(i => i.spend), 1)
})

function barWidth(spend: number): string {
  return `${Math.max((spend / maxSpend.value) * 100, 2)}%`
}

function formatLabel(val: string): string {
  // Capitalize and format dimension values nicely
  if (val === 'unknown') return 'Unknown'
  if (val.length === 2 && val === val.toUpperCase()) return val // ISO country codes
  return val.charAt(0).toUpperCase() + val.slice(1)
}
</script>

<template>
  <div class="min-w-0">
    <div class="flex items-center gap-1.5 mb-2">
      <UIcon :name="icon" class="w-3.5 h-3.5 text-muted" />
      <h4 class="text-xs font-semibold text-default">{{ title }}</h4>
    </div>

    <div v-if="!items.length" class="text-xs text-muted italic py-2">
      No data
    </div>

    <div v-else class="space-y-1.5">
      <div v-for="item in items.slice(0, 6)" :key="item.dimensionValue" class="group">
        <div class="flex items-center justify-between text-xs mb-0.5">
          <span class="text-default font-medium truncate mr-2">{{ formatLabel(item.dimensionValue) }}</span>
          <span class="text-muted tabular-nums shrink-0">{{ fmtCurrency(item.spend) }}</span>
        </div>
        <div class="h-4 bg-elevated/50 rounded-sm overflow-hidden relative">
          <div
            class="h-full bg-primary/20 rounded-sm transition-all duration-300"
            :style="{ width: barWidth(item.spend) }"
          />
          <div class="absolute inset-0 flex items-center px-1.5 text-[10px] text-muted">
            <span class="tabular-nums">{{ fmtCompact(item.impressions) }} impr</span>
            <span class="mx-1">·</span>
            <span class="tabular-nums">{{ item.ctr != null ? fmtPercent(item.ctr, 1) : '-' }} CTR</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
