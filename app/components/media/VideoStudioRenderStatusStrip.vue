<script setup lang="ts">
import type { MediaRenderJob, MediaRenderJobStatus } from '~~/app/types'
import {
  renderVariantFormats,
  renderVariantUrl,
  summarizeVideoRenderJobs,
} from '~~/app/utils/video/renderJobSummary'

const props = withDefaults(defineProps<{
  projectId: string
  jobs?: MediaRenderJob[]
  rendering?: boolean
}>(), {
  jobs: () => [],
  rendering: false,
})

const summary = computed(() => summarizeVideoRenderJobs(props.jobs))
const latestCompleted = computed(() => props.jobs.find(job => job.status === 'done' && renderVariantFormats(job).length) ?? null)
const latestFailed = computed(() => props.jobs.find(job => job.status === 'failed') ?? null)
const completedFormats = computed(() => renderVariantFormats(latestCompleted.value))

function statusColor(status: MediaRenderJobStatus | 'idle'): 'primary' | 'success' | 'error' | 'neutral' {
  if (status === 'done') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'queued' || status === 'rendering') return 'primary'
  return 'neutral'
}

const statusLabel = computed(() => {
  if (props.rendering) return 'Queueing render'
  if (summary.value.active) return `${summary.value.active} active`
  if (summary.value.completed) return `${summary.value.completed} completed`
  if (summary.value.failed) return `${summary.value.failed} failed`
  return 'No renders'
})

const status = computed<MediaRenderJobStatus | 'idle'>(() => {
  if (props.rendering) return 'queued'
  return summary.value.latest?.status ?? 'idle'
})

function dateLabel(iso: string | null | undefined) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
</script>

<template>
  <section class="flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-2">
    <div class="flex min-w-0 items-center gap-2">
      <UIcon name="i-lucide-clapperboard" class="size-4 shrink-0 text-muted" />
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-1.5">
          <p class="text-xs font-medium text-highlighted">Render queue</p>
          <UBadge :label="statusLabel" size="xs" variant="subtle" :color="statusColor(status)" />
          <UBadge
            v-if="summary.failed"
            :label="`${summary.failed} failed`"
            size="xs"
            variant="subtle"
            color="error"
          />
        </div>
        <p class="truncate text-[11px] text-muted">
          <span v-if="summary.latest">Latest {{ summary.latest.status }} · {{ dateLabel(summary.latest.createdAt) }}</span>
          <span v-else>Render the timeline to create downloadable variants.</span>
        </p>
      </div>
    </div>

    <div v-if="latestCompleted && completedFormats.length" class="ml-auto flex flex-wrap items-center gap-1.5">
      <UButton
        v-for="format in completedFormats"
        :key="format"
        icon="i-lucide-download"
        size="xs"
        variant="soft"
        color="neutral"
        :label="format"
        :to="renderVariantUrl(props.projectId, latestCompleted.id, format)"
        target="_blank"
      />
    </div>
    <p v-else-if="latestFailed?.error" class="ml-auto max-w-md truncate text-[11px] text-error">
      {{ latestFailed.error }}
    </p>
  </section>
</template>
