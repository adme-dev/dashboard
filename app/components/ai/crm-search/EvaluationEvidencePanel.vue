<script setup lang="ts">
const props = defineProps<{ evaluationRunId: string | null, pending?: boolean }>()
const endpoint = computed(() => `/api/admin/crm-search/evaluations/${props.evaluationRunId ?? '00000000-0000-4000-8000-000000000000'}`)
const { data: evidence, status, error: fetchError, refresh } = await useFetch<{
  id: string
  gatePassed: boolean
  expiresAt?: string
  metricBundle?: Record<string, unknown>
}>(endpoint, { immediate: false, watch: false, default: () => null })
const error = computed(() => fetchError.value ? 'Evaluation evidence could not be loaded.' : null)
const loading = computed(() => status.value === 'pending')

async function load() {
  if (!props.evaluationRunId) {
    evidence.value = null
    fetchError.value = null
    return
  }
  await refresh()
}

watch(() => props.evaluationRunId, load, { immediate: true })
</script>

<template>
  <UCard>
    <template #header><div><h3 class="text-sm font-semibold text-highlighted">Evaluation evidence</h3><p class="text-xs text-muted">Accepted Task15 gate output for assist readiness.</p></div></template>
    <div v-if="loading || pending" aria-busy="true" aria-label="Loading evaluation evidence"><USkeleton class="h-16 w-full" /></div>
    <UAlert v-else-if="error" color="error" variant="soft" title="Evaluation evidence unavailable" :description="error"><template #actions><UButton size="xs" color="error" variant="soft" @click="load">Try again</UButton></template></UAlert>
    <div v-else-if="evidence" class="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><p class="text-xs text-muted">Gate</p><UBadge :color="evidence.gatePassed ? 'success' : 'error'" variant="subtle">{{ evidence.gatePassed ? 'Passed' : 'Did not pass' }}</UBadge></div><div><p class="text-xs text-muted">Expires</p><p class="text-sm text-default">{{ evidence.expiresAt ?? 'Not available' }}</p></div></div>
    <UAlert v-else color="neutral" variant="soft" icon="i-lucide-circle-dashed" title="No evaluation evidence" description="Select an assist-ready client to inspect its exact evidence run." />
  </UCard>
</template>
