<script setup lang="ts">
import VideoStudioRenderFailure from './VideoStudioRenderFailure.vue'
import type { MediaRenderJob, MediaRenderJobStatus } from '~~/app/types'
import { creativeVersionLabelForRenderJob, renderFailureHistoryNote, renderVariantFormats, renderFormatLabel, renderDownloadUrl } from '~~/app/utils/video/renderJobSummary'

const props = withDefaults(defineProps<{
  projectId: string
  jobs?: MediaRenderJob[]
  rendering?: boolean
}>(), {
  jobs: () => [],
  rendering: false
})

const emit = defineEmits<{
  (event: 'render'): void
  (event: 'retry', job: MediaRenderJob): void
  (event: 'publish' | 'send-to-portal' | 'save-asset', job: MediaRenderJob, format: string): void
}>()

function statusColor(status: MediaRenderJobStatus): 'primary' | 'success' | 'error' | 'neutral' {
  if (status === 'done') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'queued' || status === 'rendering') return 'primary'
  return 'neutral'
}

function dateLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function variantFormats(job: MediaRenderJob) {
  return renderVariantFormats(job)
}

function variantUrl(job: MediaRenderJob, format: string) {
  return renderDownloadUrl(props.projectId, job.id, format)
}

function versionLabel(job: MediaRenderJob) {
  return creativeVersionLabelForRenderJob(job)
}

function variantItems(job: MediaRenderJob, label: string, icon: string, event: 'publish' | 'send-to-portal' | 'save-asset') {
  return [variantFormats(job).map(format => ({
    label: `${label} ${renderFormatLabel(format)}`,
    icon,
    onSelect: () => emit(event, job, format)
  }))]
}

</script>

<template>
  <div class="min-w-0 rounded-md border border-default bg-elevated p-3">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0 flex-1 basis-40">
        <p class="break-words text-sm font-medium text-highlighted">
          Render jobs
        </p>
        <p class="mt-0.5 break-words text-xs leading-snug text-muted">
          Export, save, send, or publish completed renders.
        </p>
      </div>
      <UButton
        icon="i-lucide-clapperboard"
        size="xs"
        color="primary"
        variant="soft"
        label="Render"
        class="shrink-0"
        :loading="props.rendering"
        @click="emit('render')"
      />
    </div>

    <div v-if="props.jobs.length" class="mt-3 space-y-2">
      <div
        v-for="job in props.jobs"
        :key="job.id"
        data-render-job
        class="min-w-0 rounded-md border border-default bg-default/30 p-2"
      >
        <div class="flex min-w-0 items-start gap-2">
          <UBadge
            :label="job.status"
            size="xs"
            variant="subtle"
            :color="statusColor(job.status)"
            class="shrink-0"
          />
          <div class="min-w-0 flex-1">
            <p class="break-words text-xs text-muted">
              {{ dateLabel(job.createdAt) }}
            </p>
            <p data-render-version class="mt-0.5 break-words text-[11px] text-muted [overflow-wrap:anywhere]">
              {{ versionLabel(job) }}
            </p>
          </div>
        </div>

        <VideoStudioRenderFailure
          v-if="job.status === 'failed'"
          class="mt-2"
          :job="job"
          :history-note="renderFailureHistoryNote(job, props.jobs)"
          :rendering="props.rendering"
          history
          @retry="emit('retry', job)"
        />

        <div class="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          <!-- Default slot instead of `label`: the theme truncates labels, so long format names would be clipped. -->
          <UButton
            v-for="format in variantFormats(job)"
            :key="format"
            data-render-download
            class="max-w-full"
            size="xs"
            variant="soft"
            color="neutral"
            :to="variantUrl(job, format)"
            external
            download
          >
            <span class="min-w-0 whitespace-normal break-words text-left [overflow-wrap:anywhere]">Download {{ renderFormatLabel(format) }}</span>
          </UButton>
          <UDropdownMenu
            v-if="job.status === 'done' && variantFormats(job).length"
            :items="variantItems(job, 'Publish', 'i-lucide-share-2', 'publish')"
          >
            <UButton
              icon="i-lucide-share-2"
              size="xs"
              variant="ghost"
              color="primary"
              label="Publish"
            />
          </UDropdownMenu>
          <UDropdownMenu
            v-if="job.status === 'done' && variantFormats(job).length"
            :items="variantItems(job, 'Send', 'i-lucide-send', 'send-to-portal')"
          >
            <UButton
              icon="i-lucide-send"
              size="xs"
              variant="ghost"
              color="neutral"
              label="Portal"
            />
          </UDropdownMenu>
          <UDropdownMenu
            v-if="job.status === 'done' && variantFormats(job).length"
            :items="variantItems(job, 'Save', 'i-lucide-bookmark', 'save-asset')"
          >
            <UButton
              icon="i-lucide-bookmark"
              size="xs"
              variant="ghost"
              color="neutral"
              label="Save to library"
            />
          </UDropdownMenu>
        </div>
      </div>
    </div>

    <div v-else class="mt-3 rounded-md border border-dashed border-default px-3 py-4 text-center">
      <UIcon name="i-lucide-clapperboard" class="mx-auto size-4 text-muted" />
      <p class="mt-2 text-xs font-medium text-highlighted">
        No render jobs yet
      </p>
      <p class="mt-1 text-[11px] text-muted">
        Render the timeline to create export variants.
      </p>
    </div>
  </div>
</template>
