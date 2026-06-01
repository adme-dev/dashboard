<script setup lang="ts">
// Lead-score breakdown for a person/company. Agency-only: scoring endpoints live
// under /api/crm — self-guard so this renders nothing in the client portal.
const props = defineProps<{
  clientId: string
  targetType: 'person' | 'company'
  targetId: string
}>()

const base = inject<string>('crmApiBase', '/api/crm')
const isAgency = base === '/api/crm'

interface ScoreRow {
  target_id: string
  total_score: number
  grade: 'Hot' | 'Warm' | 'Cold'
  engagement_score: number
  intent_score: number
  fit_score: number
  recency_score: number
}
const query = computed(() => ({ client_id: props.clientId, target_type: props.targetType }))
const { data, refresh } = useFetch<{ byTarget: Record<string, ScoreRow> }>('/api/crm/scoring', {
  query, watch: [query], immediate: isAgency, default: () => ({ byTarget: {} }),
})
const score = computed(() => data.value?.byTarget?.[props.targetId] ?? null)

const gradeColor: Record<string, string> = { Hot: 'success', Warm: 'warning', Cold: 'neutral' }
const components = computed(() => score.value ? [
  { label: 'Engagement', value: score.value.engagement_score, max: 30 },
  { label: 'Intent', value: score.value.intent_score, max: 30 },
  { label: 'Fit', value: score.value.fit_score, max: 20 },
  { label: 'Recency', value: score.value.recency_score, max: 20 },
] : [])

const toast = useToast()
const recomputing = ref(false)
async function recompute() {
  recomputing.value = true
  try {
    await $fetch('/api/crm/scoring/compute', {
      method: 'POST',
      body: { client_id: props.clientId, target_type: props.targetType, target_id: props.targetId },
    })
    await refresh()
  } catch (e: unknown) {
    toast.add({ title: 'Could not recompute score', description: (e as Error)?.message, color: 'error' })
  } finally {
    recomputing.value = false
  }
}
</script>

<template>
  <div v-if="isAgency">
    <div class="flex items-center justify-between gap-2 mb-3">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-semibold text-highlighted">Lead score</h3>
        <UBadge v-if="score" :color="(gradeColor[score.grade] as any)" variant="subtle" size="sm">
          {{ score.grade }} · {{ score.total_score }}
        </UBadge>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="ghost"
        color="neutral"
        :loading="recomputing"
        @click="recompute"
      >Recompute</UButton>
    </div>

    <div v-if="!score" class="rounded-lg border border-dashed border-default py-4 text-center text-sm text-muted">
      Not scored yet — click Recompute.
    </div>
    <div v-else class="space-y-2">
      <div v-for="c in components" :key="c.label" class="flex items-center gap-3">
        <span class="w-24 shrink-0 text-xs text-muted">{{ c.label }}</span>
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
          <div class="h-full rounded-full bg-primary" :style="{ width: `${(c.value / c.max) * 100}%` }" />
        </div>
        <span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{{ c.value }}/{{ c.max }}</span>
      </div>
    </div>
  </div>
</template>
