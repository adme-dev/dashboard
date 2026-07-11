<script setup lang="ts">
import { computed } from 'vue'
import type { MediaRenderJob, MediaRenderJobStatus } from '~~/app/types'
import {
  parseRenderFailure,
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

const emit = defineEmits<{
  (event: 'retry', job: MediaRenderJob): void
  (event: 'publish', job: MediaRenderJob, format: string): void
  (event: 'send-to-portal', job: MediaRenderJob, format: string): void
  (event: 'save-asset', job: MediaRenderJob, format: string): void
}>()

const summary = computed(() => summarizeVideoRenderJobs(props.jobs))
const latestCompleted = computed(() => latestJob(job => job.status === 'done' && renderVariantFormats(job).length > 0))
const latestFailed = computed(() => latestJob(job => job.status === 'failed'))
const completedFormats = computed(() => renderVariantFormats(latestCompleted.value))

function latestJob(predicate: (job: MediaRenderJob) => boolean) {
  return props.jobs
    .filter(predicate)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
}

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

function variantItems(job: MediaRenderJob, label: string, icon: string, event: 'publish' | 'send-to-portal' | 'save-asset') {
  return [renderVariantFormats(job).map(format => ({
    label: `${label} ${format}`,
    icon,
    onSelect: () => emitVariant(event, job, format),
  }))]
}

function emitVariant(event: 'publish' | 'send-to-portal' | 'save-asset', job: MediaRenderJob, format: string) {
  if (event === 'publish') emit('publish', job, format)
  else if (event === 'send-to-portal') emit('send-to-portal', job, format)
  else emit('save-asset', job, format)
}

const latestFailure = computed(() => latestFailed.value ? parseRenderFailure(latestFailed.value.error) : null)
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
      <UDropdownMenu :items="variantItems(latestCompleted, 'Publish', 'i-lucide-share-2', 'publish')">
        <UButton icon="i-lucide-share-2" size="xs" variant="ghost" color="primary" label="Publish" />
      </UDropdownMenu>
      <UDropdownMenu :items="variantItems(latestCompleted, 'Send', 'i-lucide-send', 'send-to-portal')">
        <UButton icon="i-lucide-send" size="xs" variant="ghost" color="neutral" label="Portal" />
      </UDropdownMenu>
      <UDropdownMenu :items="variantItems(latestCompleted, 'Save', 'i-lucide-bookmark', 'save-asset')">
        <UButton icon="i-lucide-bookmark" size="xs" variant="ghost" color="neutral" label="Library" />
      </UDropdownMenu>
    </div>
    <div v-else-if="latestFailed" class="ml-auto flex min-w-0 max-w-xl items-center gap-2">
      <div v-if="latestFailed.error" class="min-w-0 rounded-md border border-error/30 bg-error/5 px-2 py-1">
        <div class="flex items-center gap-1.5 text-[11px] font-medium text-error">
          <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" />
          <span class="shrink-0">{{ latestFailure?.label }}</span>
          <span class="truncate font-normal">{{ latestFailure?.details }}</span>
        </div>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="soft"
        :color="latestFailure?.retryable ? 'primary' : 'neutral'"
        label="Retry"
        :loading="props.rendering"
        @click="emit('retry', latestFailed)"
      />
    </div>
  </section>
</template>
