<script setup lang="ts">
interface JobItem {
  id: string
  jobType: string
  status: string
  attemptCount: number
  maxAttempts: number
  updatedAt: string
}

interface JobHealth {
  generatedAt: string
  healthy: boolean
  metrics: {
    total24h: number
    succeeded24h: number
    queued: number
    running: number
    retrying: number
    deadLettered: number
    oldestQueuedSeconds: number
  }
  recent: JobItem[]
}

const data = ref<JobHealth | null>(null)
const pending = ref(false)
const error = ref('')

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
    data.value = await $fetch<JobHealth>('/api/portal/operations/jobs')
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || 'Synchronization health is unavailable'
  } finally {
    pending.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">Synchronization health</h2>
          <p class="mt-0.5 text-xs text-muted">Background audience, campaign, and CRM data operations for this account.</p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :color="data?.healthy ? 'success' : 'warning'" variant="soft">
            {{ data?.healthy ? 'Healthy' : 'Attention' }}
          </UBadge>
          <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="pending" @click="refresh" />
        </div>
      </div>
    </template>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="error" />
    <div v-else class="space-y-5">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div v-for="item in [
          ['24h jobs', data?.metrics.total24h ?? 0],
          ['Succeeded', data?.metrics.succeeded24h ?? 0],
          ['Queued', data?.metrics.queued ?? 0],
          ['Running', data?.metrics.running ?? 0],
          ['Retrying', data?.metrics.retrying ?? 0],
          ['Dead-lettered', data?.metrics.deadLettered ?? 0]
        ]" :key="String(item[0])" class="rounded-lg border border-default bg-elevated/40 p-3">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted">{{ item[0] }}</p>
          <p class="mt-1 text-xl font-semibold text-highlighted">{{ item[1] }}</p>
        </div>
      </div>

      <div>
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Recent operations</h3>
        <div v-if="!data?.recent.length" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
          No client-scoped background operations recorded yet.
        </div>
        <div v-else class="divide-y divide-default rounded-lg border border-default">
          <div v-for="job in data.recent" :key="job.id" class="flex items-center justify-between gap-3 px-3 py-2.5">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">{{ label(job.jobType) }}</p>
              <p class="text-xs text-muted">Attempt {{ job.attemptCount }} of {{ job.maxAttempts }} · {{ new Date(job.updatedAt).toLocaleString() }}</p>
            </div>
            <UBadge :color="statusColor(job.status)" variant="soft" size="sm">{{ label(job.status) }}</UBadge>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
