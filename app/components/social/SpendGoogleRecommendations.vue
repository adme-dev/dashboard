<script setup lang="ts">
interface Rec {
  type: string
  campaignId: string | null
  title: string
  currentDailyMajor: number | null
  recommendedDailyMajor: number | null
  impactSummary: string | null
  resourceName: string
  applyability: 'budget_guardrailed' | 'review_only'
  trackingHealth: boolean
  deepLink: string
}
const props = defineProps<{
  optimizationScore: number | null
  recommendations: Rec[]
  campaignId: string | null
  armed: boolean
  applying?: string | null
}>()
const emit = defineEmits<{ (e: 'apply', rec: Rec): void }>()

const scorePct = computed(() => props.optimizationScore == null ? null : Math.round(props.optimizationScore * 100))
// Only THIS campaign's budget rec is applyable from the slideover.
const applyable = computed(() => props.recommendations.filter(r => r.applyability === 'budget_guardrailed' && r.campaignId === props.campaignId))
const trackingRecs = computed(() => props.recommendations.filter(r => r.trackingHealth))
const otherRecs = computed(() => props.recommendations.filter(r => !r.trackingHealth && !(r.applyability === 'budget_guardrailed' && r.campaignId === props.campaignId)))
const fmt = (n: number | null) => n == null ? '—' : `$${n.toFixed(2)}`
</script>

<template>
  <div v-if="recommendations.length || optimizationScore != null" class="rounded-lg border border-default p-3 space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="text-primary" />
        <span class="text-xs font-medium">Google optimization recommendations</span>
      </div>
      <UBadge v-if="scorePct != null" :color="scorePct >= 80 ? 'success' : scorePct >= 60 ? 'warning' : 'error'" variant="soft" size="xs">
        Score {{ scorePct }}%
      </UBadge>
    </div>

    <div v-for="rec in applyable" :key="rec.resourceName" class="flex items-center justify-between rounded-lg bg-default/40 px-3 py-2">
      <div class="min-w-0">
        <p class="text-xs font-medium truncate">{{ rec.title }}</p>
        <p class="text-[11px] text-muted">{{ fmt(rec.currentDailyMajor) }} → {{ fmt(rec.recommendedDailyMajor) }}/day<span v-if="rec.impactSummary"> · {{ rec.impactSummary }}</span></p>
      </div>
      <UButton size="xs" :color="armed ? 'primary' : 'neutral'" :variant="armed ? 'solid' : 'soft'" :loading="applying === rec.resourceName" :disabled="!armed" @click="emit('apply', rec)">
        {{ armed ? 'Apply (guardrailed)' : 'Recommend only' }}
      </UButton>
    </div>

    <div v-if="trackingRecs.length" class="space-y-1">
      <p class="text-[10px] uppercase text-muted font-medium">Tracking health</p>
      <div v-for="rec in trackingRecs" :key="rec.resourceName" class="flex items-center justify-between rounded-lg bg-warning/5 px-3 py-2">
        <p class="text-xs truncate">{{ rec.title }}</p>
        <UButton size="xs" variant="ghost" :to="rec.deepLink" target="_blank" trailing-icon="i-lucide-external-link">Review</UButton>
      </div>
    </div>

    <div v-if="otherRecs.length" class="space-y-1">
      <p class="text-[10px] uppercase text-muted font-medium">Other (review in Google Ads)</p>
      <div v-for="rec in otherRecs" :key="rec.resourceName" class="flex items-center justify-between rounded-lg bg-default/40 px-3 py-2">
        <p class="text-xs truncate">{{ rec.title }}<span v-if="rec.impactSummary" class="text-muted"> · {{ rec.impactSummary }}</span></p>
        <UButton size="xs" variant="ghost" :to="rec.deepLink" target="_blank" trailing-icon="i-lucide-external-link">Review</UButton>
      </div>
    </div>
  </div>
</template>
