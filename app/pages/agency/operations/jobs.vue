<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Job Operations — XeroFlow' })

interface JobItem {
  id: string
  jobType: string
  clientId: string | null
  status: string
  attemptCount: number
  maxAttempts: number
  replayable: boolean
  updatedAt: string
}

interface QueueHealth {
  generatedAt: string
  healthy: boolean
  metrics: {
    total24h: number
    succeeded24h: number
    failed24h: number
    successRate: number
    queued: number
    running: number
    retrying: number
    deadLettered: number
    staleRunning: number
    p95DurationMs: number
    maxQueueLagSeconds: number
  }
  recent: JobItem[]
}

const data = ref<QueueHealth | null>(null)
const pending = ref(false)
const error = ref('')
const retrying = ref<string | null>(null)
const toast = useToast()

const statusColor = (status: string) => ({
  succeeded: 'success',
  running: 'info',
  queued: 'neutral',
  retrying: 'warning',
  failed: 'error',
  dead_lettered: 'error'
}[status] || 'neutral') as 'success' | 'info' | 'neutral' | 'warning' | 'error'

const label = (value: string) => value.replaceAll('_', ' ')

async function refresh() {
  pending.value = true
  error.value = ''
  try {
    data.value = await $fetch<QueueHealth>('/api/agency/operations/queue-health')
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || 'Job operations are unavailable'
  } finally {
    pending.value = false
  }
}

async function retry(job: JobItem) {
  retrying.value = job.id
  try {
    await $fetch(`/api/agency/operations/jobs/${job.id}/retry`, { method: 'POST' })
    toast.add({ title: 'Job queued for retry', color: 'success' })
    await refresh()
  } catch (cause: any) {
    toast.add({
      title: 'Retry failed',
      description: cause?.data?.statusMessage || 'The job could not be queued.',
      color: 'error'
    })
  } finally {
    retrying.value = null
  }
}

onMounted(refresh)
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Operations</p>
        <h1 class="mt-1 text-2xl font-semibold text-highlighted">Background job control</h1>
        <p class="mt-1 text-sm text-muted">Queue latency, retries, dead letters, and safe operator replay.</p>
      </div>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="pending" @click="refresh">
        Refresh
      </UButton>
    </header>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="error" />

    <template v-else>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <UCard v-for="item in [
          ['Success', `${((data?.metrics.successRate ?? 0) * 100).toFixed(1)}%`],
          ['24h jobs', data?.metrics.total24h ?? 0],
          ['Queued', data?.metrics.queued ?? 0],
          ['Running', data?.metrics.running ?? 0],
          ['Retrying', data?.metrics.retrying ?? 0],
          ['Dead letters', data?.metrics.deadLettered ?? 0],
          ['P95 duration', `${Math.round((data?.metrics.p95DurationMs ?? 0) / 1000)}s`],
          ['Max lag', `${Math.round(data?.metrics.maxQueueLagSeconds ?? 0)}s`]
        ]" :key="String(item[0])" :ui="{ body: 'p-4' }">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted">{{ item[0] }}</p>
          <p class="mt-1 text-xl font-semibold text-highlighted">{{ item[1] }}</p>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Recent jobs</h2>
              <p class="text-xs text-muted">Payloads are never displayed or persisted.</p>
            </div>
            <UBadge :color="data?.healthy ? 'success' : 'warning'" variant="soft">
              {{ data?.healthy ? 'SLO healthy' : 'SLO attention' }}
            </UBadge>
          </div>
        </template>
        <div v-if="!data?.recent.length" class="py-10 text-center text-sm text-muted">No jobs recorded.</div>
        <div v-else class="divide-y divide-default">
          <div v-for="job in data.recent" :key="job.id" class="flex flex-wrap items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted">{{ label(job.jobType) }}</p>
              <p class="text-xs text-muted">
                {{ job.clientId || 'Agency-wide' }} · attempt {{ job.attemptCount }}/{{ job.maxAttempts }} ·
                {{ new Date(job.updatedAt).toLocaleString() }}
              </p>
            </div>
            <UBadge :color="statusColor(job.status)" variant="soft">{{ label(job.status) }}</UBadge>
            <UButton
              v-if="['failed', 'dead_lettered'].includes(job.status)"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-rotate-ccw"
              :disabled="!job.replayable"
              :loading="retrying === job.id"
              @click="retry(job)"
            >
              {{ job.replayable ? 'Retry' : 'Manual review' }}
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
