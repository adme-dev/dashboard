<script setup lang="ts">
type OperationsResponse = {
  status: 'healthy' | 'degraded' | 'critical'
  metrics: {
    total30d: number
    terminalSuccessRate: number
    p95CompletionSeconds: number
    failed24h: number
    staleQueued: number
    staleRunning: number
    staleSubmitted: number
  }
}

const route = useRoute()
const apiFetch = $fetch as (request: string, options?: Record<string, any>) => Promise<any>
const clientId = computed(() => String(route.params.id || route.query.clientId || ''))
const data = ref<OperationsResponse | null>(null)
const loading = ref(false)
const error = ref('')

async function refresh() {
  if (!clientId.value) return
  loading.value = true
  error.value = ''
  try {
    data.value = await apiFetch('/api/agency/analytics/personas/operations', {
      query: { clientId: clientId.value },
    }) as OperationsResponse
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'Export operations are unavailable'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
watch(clientId, refresh)
</script>

<template>
  <section class="mt-6 rounded-xl border border-default bg-default p-5">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-highlighted">Audience export operations</h3>
        <p class="mt-1 text-xs text-muted">Queue and provider-delivery SLOs for this client.</p>
      </div>
      <UButton type="button" color="neutral" variant="ghost" size="xs" icon="i-lucide-refresh-cw" :loading="loading" @click="refresh">
        Refresh
      </UButton>
    </div>
    <UAlert v-if="error" class="mt-4" color="error" variant="subtle" :description="error" />
    <div v-if="data" class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg bg-elevated/50 p-3">
        <p class="text-xs text-muted">Status</p>
        <p class="mt-1 text-sm font-semibold capitalize text-highlighted">{{ data.status }}</p>
      </div>
      <div class="rounded-lg bg-elevated/50 p-3">
        <p class="text-xs text-muted">30-day success</p>
        <p class="mt-1 text-sm font-semibold text-highlighted">{{ data.metrics.terminalSuccessRate.toFixed(1) }}%</p>
      </div>
      <div class="rounded-lg bg-elevated/50 p-3">
        <p class="text-xs text-muted">Stale</p>
        <p class="mt-1 text-sm font-semibold text-highlighted">
          {{ data.metrics.staleQueued + data.metrics.staleRunning + data.metrics.staleSubmitted }}
        </p>
      </div>
      <div class="rounded-lg bg-elevated/50 p-3">
        <p class="text-xs text-muted">Failed in 24h</p>
        <p class="mt-1 text-sm font-semibold text-highlighted">{{ data.metrics.failed24h }}</p>
      </div>
    </div>
  </section>
</template>

