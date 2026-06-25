<script setup lang="ts">
import type { MediaRenderJob, MediaRenderJobStatus } from '~~/app/types'
import { creativeVersionLabelForRenderJob, parseRenderFailure, renderVariantFormats, renderVariantUrl } from '~~/app/utils/video/renderJobSummary'

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
  return renderVariantUrl(props.projectId, job.id, format)
}

function versionLabel(job: MediaRenderJob) {
  return creativeVersionLabelForRenderJob(job)
}

function variantItems(job: MediaRenderJob, label: string, icon: string, event: 'publish' | 'send-to-portal' | 'save-asset') {
  return [variantFormats(job).map(format => ({
    label: `${label} ${format}`,
    icon,
    onSelect: () => emit(event, job, format)
  }))]
}

function failureSummary(job: MediaRenderJob) {
  return parseRenderFailure(job.error)
}
</script>

<template>
  <div class="rounded-md border border-default bg-elevated p-3">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">
          Render jobs
        </p>
        <p class="mt-0.5 text-xs leading-snug text-muted">
          Export, save, send, or publish completed renders.
        </p>
      </div>
      <UButton
        icon="i-lucide-clapperboard"
        size="xs"
        color="primary"
        variant="soft"
        label="Render"
        :loading="props.rendering"
        @click="emit('render')"
      />
    </div>

    <div v-if="props.jobs.length" class="mt-3 space-y-2">
      <div
        v-for="job in props.jobs"
        :key="job.id"
        class="rounded-md border border-default bg-default/30 p-2"
      >
        <div class="flex items-start gap-2">
          <UBadge
            :label="job.status"
            size="xs"
            variant="subtle"
            :color="statusColor(job.status)"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs text-muted">
              {{ dateLabel(job.createdAt) }}
            </p>
            <p class="mt-0.5 truncate text-[11px] text-muted">
              {{ versionLabel(job) }}
            </p>
          </div>
        </div>

        <div v-if="job.status === 'failed' && job.error" class="mt-2 rounded-md border border-error/30 bg-error/5 p-2">
          <div class="flex items-center gap-1.5 text-[11px] font-medium text-error">
            <UIcon name="i-lucide-triangle-alert" class="size-3.5" />
            <span>{{ failureSummary(job).label }}</span>
          </div>
          <p class="mt-1 whitespace-pre-wrap break-words text-[11px] leading-snug text-error">
            {{ failureSummary(job).details }}
          </p>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <UButton
            v-for="format in variantFormats(job)"
            :key="format"
            :label="format"
            size="xs"
            variant="soft"
            color="neutral"
            :to="variantUrl(job, format)"
            target="_blank"
          />
          <UButton
            v-if="job.status === 'failed'"
            icon="i-lucide-refresh-cw"
            size="xs"
            variant="soft"
            :color="failureSummary(job).retryable ? 'primary' : 'neutral'"
            label="Retry"
            :loading="props.rendering"
            @click="emit('retry', job)"
          />
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
              label="Library"
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
