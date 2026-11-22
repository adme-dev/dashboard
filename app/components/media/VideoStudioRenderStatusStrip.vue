<script setup lang="ts">
import { computed } from 'vue'
import type { MediaRenderJob } from '~~/app/types'
import {
  parseRenderFailure,
  renderStageMeter,
  renderVariantFormats,
  renderDownloadUrl,
  renderFormatLabel,
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
const failedJobs = computed(() => props.jobs
  .filter(job => job.status === 'failed')
  .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  .map(job => ({ job, failure: parseRenderFailure(job.error) })))
const activeJob = computed(() => latestJob(job => job.status === 'queued' || job.status === 'rendering'))
const stageMeter = computed(() => renderStageMeter(activeJob.value))
const completedFormats = computed(() => renderVariantFormats(latestCompleted.value))

function latestJob(predicate: (job: MediaRenderJob) => boolean) {
  return props.jobs
    .filter(predicate)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
}

const statusLabel = computed(() => {
  if (props.rendering) return 'Queueing render'
  if (summary.value.active) return `${summary.value.active} active`
  if (summary.value.completed) return `${summary.value.completed} completed`
  return 'No renders'
})

const statusColor = computed(() => {
  if (props.rendering || summary.value.active) return 'primary'
  if (summary.value.completed) return 'success'
  return 'neutral'
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
    label: `${label} ${renderFormatLabel(format)}`,
    icon,
    onSelect: () => emitVariant(event, job, format),
  }))]
}

function emitVariant(event: 'publish' | 'send-to-portal' | 'save-asset', job: MediaRenderJob, format: string) {
  if (event === 'publish') emit('publish', job, format)
  else if (event === 'send-to-portal') emit('send-to-portal', job, format)
  else emit('save-asset', job, format)
}

</script>

<template>
  <section class="flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-2">
    <div class="flex min-w-0 items-center gap-2">
      <UIcon
        :name="summary.active || props.rendering ? 'i-lucide-loader-circle' : 'i-lucide-clapperboard'"
        class="size-4 shrink-0"
        :class="summary.active || props.rendering ? 'animate-spin text-primary' : 'text-muted'"
      />
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-1.5">
          <p class="text-xs font-medium text-highlighted">Render queue</p>
          <UBadge
            v-if="!summary.failed || summary.active || summary.completed || props.rendering"
            :label="statusLabel"
            size="xs"
            variant="subtle"
            :color="statusColor"
          />
          <UProgress
            v-if="stageMeter"
            :model-value="stageMeter.value ?? undefined"
            :max="stageMeter.max"
            size="xs"
            class="w-24"
            :aria-label="[stageMeter.label, stageMeter.detail].filter(Boolean).join(': ')"
          />
          <UPopover v-if="failedJobs.length">
            <UButton
              :label="`${summary.failed} failed`"
              trailing-icon="i-lucide-chevron-down"
              size="xs"
              variant="soft"
              color="error"
              :aria-label="`Show ${summary.failed} failed renders`"
            />
            <template #content>
              <div class="max-h-64 w-80 max-w-[90vw] divide-y divide-default overflow-y-auto" aria-label="Failed renders">
                <div v-for="{ job, failure } in failedJobs" :key="job.id" class="space-y-1 p-3">
                  <p class="text-xs font-medium text-error">
                    {{ failure.label }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ dateLabel(job.createdAt) }}
                  </p>
                  <p class="whitespace-pre-wrap break-words text-sm">
                    {{ failure.details || 'No failure reason was recorded.' }}
                  </p>
                  <UButton
                    label="Retry render"
                    icon="i-lucide-refresh-cw"
                    size="xs"
                    variant="soft"
                    :loading="props.rendering"
                    @click="emit('retry', job)"
                  />
                </div>
              </div>
            </template>
          </UPopover>
        </div>
        <p class="text-[11px] text-muted">
          <span v-if="summary.active && stageMeter">
            {{ stageMeter.label }}<template v-if="stageMeter.detail"> · {{ stageMeter.detail }}</template><template v-if="activeJob?.progress?.total"> · {{ activeJob.progress.done }} of {{ activeJob.progress.total }} formats ready</template> — you can keep editing.
          </span>
          <span v-else-if="summary.active">{{ activeJob?.status === 'queued' ? 'Queued' : 'Rendering now' }} — started {{ dateLabel(activeJob?.createdAt) }}. You can keep editing.</span>
          <span v-else-if="summary.latest">Latest {{ summary.latest.status }} · {{ dateLabel(summary.latest.createdAt) }}</span>
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
        :label="`Download ${renderFormatLabel(format)}`"
        :to="renderDownloadUrl(props.projectId, latestCompleted.id, format)"
        external
        download
      />
      <UDropdownMenu :items="variantItems(latestCompleted, 'Publish', 'i-lucide-share-2', 'publish')">
        <UButton icon="i-lucide-share-2" size="xs" variant="ghost" color="primary" label="Publish" />
      </UDropdownMenu>
      <UDropdownMenu :items="variantItems(latestCompleted, 'Send', 'i-lucide-send', 'send-to-portal')">
        <UButton icon="i-lucide-send" size="xs" variant="ghost" color="neutral" label="Portal" />
      </UDropdownMenu>
      <UDropdownMenu :items="variantItems(latestCompleted, 'Save', 'i-lucide-bookmark', 'save-asset')">
        <UButton
          icon="i-lucide-bookmark"
          size="xs"
          variant="ghost"
          color="neutral"
          label="Save to library"
        />
      </UDropdownMenu>
    </div>
  </section>
</template>
