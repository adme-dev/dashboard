<script setup lang="ts">
type OperationsResponse = {
  generatedAt: string
  status: 'healthy' | 'degraded' | 'critical'
  slos: {
    queueStartMinutes: number
    runningCompletionMinutes: number
    providerAcknowledgementHours: number
  }
  metrics: {
    total30d: number
    queued: number
    running: number
    submitted: number
    succeeded30d: number
    partial30d: number
    failed30d: number
    failed24h: number
    staleQueued: number
    staleRunning: number
    staleSubmitted: number
    attemptedAdditions: number
    attemptedRemovals: number
    successfulAdditions: number
    successfulRemovals: number
    terminalSuccessRate: number
    p95CompletionSeconds: number
  }
  providers: Array<{
    provider: 'google_ads' | 'meta'
    total30d: number
    succeeded30d: number
    failed30d: number
    lastCompletedAt: string | null
    lastErrorAt: string | null
  }>
  recent: Array<{
    provider: 'google_ads' | 'meta'
    operation: 'sync' | 'remove'
    status: string
    attemptCount: number
    attemptedAdditions: number
    attemptedRemovals: number
    successfulAdditions: number
    successfulRemovals: number
    errorCode: string | null
    queuedAt: string
    completedAt: string | null
    updatedAt: string
  }>
}

const apiFetch = $fetch as (request: string, options?: Record<string, any>) => Promise<any>
const data = ref<OperationsResponse | null>(null)
const loading = ref(false)
const error = ref('')

const fmtNumber = (value: number) => new Intl.NumberFormat('en-AU').format(value || 0)
const fmtDuration = (seconds: number) => seconds < 60
  ? `${Math.round(seconds)}s`
  : seconds < 3600
    ? `${Math.round(seconds / 60)}m`
    : `${(seconds / 3600).toFixed(1)}h`
const fmtDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Not completed'
const providerLabel = (provider: 'google_ads' | 'meta') => provider === 'google_ads' ? 'Google Ads' : 'Meta'
const statusColor = computed(() => data.value?.status === 'critical'
  ? 'error'
  : data.value?.status === 'degraded'
    ? 'warning'
    : 'success')

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    data.value = await apiFetch('/api/portal/analytics/audiences/operations', {
      credentials: 'include',
    }) as OperationsResponse
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'Audience export operations are unavailable'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-default">Audience delivery operations</h2>
        <p class="mt-1 text-sm text-muted">
          Queue, provider acknowledgement and privacy-safe membership reconciliation health.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UBadge v-if="data" :color="statusColor" variant="subtle" class="capitalize">{{ data.status }}</UBadge>
        <UButton
          type="button"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="refresh"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

    <template v-if="data">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UCard>
          <p class="text-xs text-muted">30-day success rate</p>
          <p class="mt-2 text-2xl font-semibold text-highlighted">{{ data.metrics.terminalSuccessRate.toFixed(1) }}%</p>
          <p class="mt-1 text-xs text-muted">{{ fmtNumber(data.metrics.total30d) }} exports</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">P95 completion</p>
          <p class="mt-2 text-2xl font-semibold text-highlighted">{{ fmtDuration(data.metrics.p95CompletionSeconds) }}</p>
          <p class="mt-1 text-xs text-muted">Queue to completion</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">Current pipeline</p>
          <p class="mt-2 text-2xl font-semibold text-highlighted">
            {{ fmtNumber(data.metrics.queued + data.metrics.running + data.metrics.submitted) }}
          </p>
          <p class="mt-1 text-xs text-muted">Queued, running or provider-submitted</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">Stale operations</p>
          <p class="mt-2 text-2xl font-semibold" :class="data.metrics.staleQueued + data.metrics.staleRunning + data.metrics.staleSubmitted ? 'text-rose-500' : 'text-emerald-500'">
            {{ fmtNumber(data.metrics.staleQueued + data.metrics.staleRunning + data.metrics.staleSubmitted) }}
          </p>
          <p class="mt-1 text-xs text-muted">{{ fmtNumber(data.metrics.failed24h) }} failed in 24h</p>
        </UCard>
      </div>

      <UAlert
        v-if="data.status !== 'healthy'"
        :color="data.status === 'critical' ? 'error' : 'warning'"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="`SLO: start within ${data.slos.queueStartMinutes}m, complete within ${data.slos.runningCompletionMinutes}m, provider acknowledgement within ${data.slos.providerAcknowledgementHours}h. Agency operators have been given the detailed retry state.`"
      />

      <div class="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <UCard>
          <template #header>
            <h3 class="text-sm font-semibold text-highlighted">Provider delivery</h3>
          </template>
          <div v-if="data.providers.length" class="space-y-3">
            <div v-for="provider in data.providers" :key="provider.provider" class="rounded-lg border border-default p-3">
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm font-medium text-highlighted">{{ providerLabel(provider.provider) }}</span>
                <UBadge :color="provider.failed30d ? 'warning' : 'success'" variant="subtle">
                  {{ provider.failed30d ? `${provider.failed30d} failed` : 'Healthy' }}
                </UBadge>
              </div>
              <p class="mt-2 text-xs text-muted">
                {{ provider.succeeded30d }}/{{ provider.total30d }} completed · Last {{ fmtDate(provider.lastCompletedAt) }}
              </p>
            </div>
          </div>
          <p v-else class="py-8 text-center text-sm text-muted">No provider exports have run.</p>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="text-sm font-semibold text-highlighted">Recent delivery activity</h3>
          </template>
          <div v-if="data.recent.length" class="divide-y divide-default">
            <div v-for="(item, index) in data.recent.slice(0, 10)" :key="`${item.queuedAt}:${index}`" class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  {{ providerLabel(item.provider) }} · {{ item.operation === 'remove' ? 'Removal' : 'Sync' }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ fmtDate(item.completedAt || item.updatedAt) }} · Attempt {{ item.attemptCount }}
                </p>
              </div>
              <UBadge
                :color="item.status === 'succeeded' ? 'success' : item.status === 'failed' ? 'error' : item.status === 'partial' ? 'warning' : 'neutral'"
                variant="subtle"
                class="capitalize"
              >
                {{ item.status }}
              </UBadge>
            </div>
          </div>
          <p v-else class="py-8 text-center text-sm text-muted">No delivery activity yet.</p>
        </UCard>
      </div>
    </template>
  </section>
</template>

