<script setup lang="ts">
interface ActivityJob {
  id: string
  assetLabel: string
  action: string
  modelId: string
  provider: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
  prompt: string | null
  errorMessage: string | null
  createdAt: string
}

const props = defineProps<{
  jobs: ActivityJob[]
}>()

const emit = defineEmits<{
  (event: 'refresh'): void
}>()

function jobStatusColor(status: ActivityJob['status']) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'blocked') return 'error'
  if (status === 'running') return 'primary'
  return 'neutral'
}

function fmtJobDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}
</script>

<template>
  <section>
    <div class="mb-2 flex items-center justify-between gap-2">
      <p class="text-xs font-medium uppercase text-muted">AI activity</p>
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="ghost"
        color="neutral"
        aria-label="Refresh AI activity"
        @click="emit('refresh')"
      />
    </div>
    <div v-if="props.jobs.length" class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      <div v-for="job in props.jobs.slice(0, 6)" :key="job.id" class="rounded-md border border-default bg-elevated p-2">
        <div class="flex items-start gap-2">
          <UBadge :label="job.status" size="xs" :color="jobStatusColor(job.status)" variant="subtle" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-highlighted">{{ job.assetLabel }}</p>
            <p class="mt-0.5 truncate text-[11px] text-muted">{{ job.action }} · {{ job.modelId }}</p>
          </div>
          <span class="shrink-0 text-[11px] text-muted">{{ job.provider }}</span>
        </div>
        <p v-if="job.prompt" class="mt-2 line-clamp-2 text-xs text-default">{{ job.prompt }}</p>
        <p v-if="job.errorMessage" class="mt-1 line-clamp-2 text-[11px] text-error">{{ job.errorMessage }}</p>
        <p class="mt-2 text-[11px] text-muted">{{ fmtJobDate(job.createdAt) }}</p>
      </div>
    </div>
    <div v-else class="rounded-md border border-dashed border-default px-3 py-4 text-center text-xs text-muted">
      No AI activity yet.
    </div>
  </section>
</template>
