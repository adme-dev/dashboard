<script setup lang="ts">
const props = defineProps<{
  clientId?: string
}>()

const query = computed(() => {
  const q: Record<string, string> = { limit: '10' }
  if (props.clientId) q.clientId = props.clientId
  return q
})

const { data, status } = useFetch('/api/agency/analytics/cross-sell', {
  query,
  watch: [query],
})

const recommendations = computed(() => (data.value as any)?.recommendations || [])

const { fmtCurrency, fmtPercent, getPlatformIcon, getPlatformColor } = useAnalytics()

const confidenceColors: Record<string, string> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
}
</script>

<template>
  <div class="border border-default rounded-lg p-4">
    <div class="flex items-center gap-2 mb-4">
      <UIcon name="i-lucide-lightbulb" class="w-4 h-4 text-amber-500" />
      <h3 class="text-sm font-semibold text-default">Cross-Sell Opportunities</h3>
    </div>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-16 w-full rounded" />
    </div>
    <div v-else-if="!recommendations.length" class="text-center py-6 text-muted text-sm">
      <UIcon name="i-lucide-check-circle" class="w-6 h-6 mx-auto mb-2 opacity-40" />
      <p>No cross-sell opportunities found</p>
    </div>
    <div v-else class="space-y-3">
      <div
        v-for="rec in recommendations"
        :key="`${rec.clientId}-${rec.recommendedPlatform}`"
        class="p-3 rounded-lg bg-elevated/30 hover:bg-elevated/50 transition-colors"
      >
        <div class="flex items-start gap-3">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            :style="{ backgroundColor: getPlatformColor(rec.recommendedPlatform) + '20' }"
          >
            <UIcon
              :name="getPlatformIcon(rec.recommendedPlatform)"
              class="w-4 h-4"
              :style="{ color: getPlatformColor(rec.recommendedPlatform) }"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ rec.displayName }}</span>
              <UBadge :color="confidenceColors[rec.confidence] || 'neutral'" variant="subtle" size="xs">
                {{ rec.confidence }}
              </UBadge>
              <span class="ml-auto text-xs font-semibold tabular-nums text-primary">{{ (rec.score * 100).toFixed(0) }}%</span>
            </div>
            <p v-if="!clientId" class="text-xs text-muted mt-0.5">
              {{ rec.clientName }}
            </p>
            <p class="text-xs text-muted mt-1 leading-relaxed">{{ rec.reason }}</p>
            <div class="flex items-center gap-4 mt-2 text-xs text-muted">
              <span v-if="rec.agencyAvgCPC != null">
                Avg CPC: {{ fmtCurrency(rec.agencyAvgCPC, 2) }}
              </span>
              <span v-if="rec.agencyAvgCTR != null">
                Avg CTR: {{ fmtPercent(rec.agencyAvgCTR) }}
              </span>
              <span v-if="rec.estimatedMonthlySpend">
                Est. {{ fmtCurrency(rec.estimatedMonthlySpend) }}/mo
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
