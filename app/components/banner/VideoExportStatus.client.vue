<script setup lang="ts">
import { createExportJobPoller, exportElapsed, exportJobTiming, summarizeExportJobs, type ExportJob } from '~/utils/bannerExportPoll'

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ open: [] }>()
const jobs = ref<ExportJob[]>([])
const visible = ref(false)
const dismissed = ref(false)
const loadError = ref(false)
const now = ref(Date.now())
const summary = computed(() => summarizeExportJobs(jobs.value))
const current = computed(() => jobs.value.find(job => job.status === 'rendering') ?? jobs.value.find(job => job.status === 'queued'))
const latestDone = computed(() => jobs.value.find(job => job.status === 'done' && job.url))
const poller = createExportJobPoller({
  fetchJobs: async () => {
    const response = await $fetch<{ jobs: ExportJob[] }>('/api/agency/banner-studio/export-video/jobs', {
      query: { projectId: props.projectId }, timeout: 15000
    })
    return response.jobs
  },
  onJobs: (rows) => {
    jobs.value = rows
    if (!dismissed.value && rows.some(job => job.status === 'queued' || job.status === 'rendering')) visible.value = true
    loadError.value = false
  },
  onError: () => { loadError.value = true }
})
let clock: ReturnType<typeof setInterval> | undefined
function dismiss() {
  dismissed.value = true
  visible.value = false
}
onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  void poller.start()
})
onBeforeUnmount(() => {
  clearInterval(clock)
  poller.stop()
})
</script>

<template>
  <aside
    v-if="visible"
    class="fixed bottom-5 right-5 z-40 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-default bg-default p-4 shadow-xl"
    aria-label="MP4 export status"
  >
    <div class="flex items-start gap-3">
      <UIcon
        :name="summary.pending ? 'i-lucide-loader-circle' : summary.failed ? 'i-lucide-circle-alert' : 'i-lucide-circle-check'"
        class="mt-0.5 size-5 shrink-0"
        :class="summary.pending ? 'animate-spin text-primary motion-reduce:animate-none' : summary.failed ? 'text-error' : 'text-success'"
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-highlighted">
          MP4 export
        </p>
        <p class="text-xs text-muted" aria-live="polite">
          <template v-if="summary.pending">
            {{ summary.done }} ready · {{ summary.rendering }} rendering · {{ summary.queued }} queued
          </template>
          <template v-else-if="summary.failed">
            {{ summary.done }} ready · {{ summary.failed }} failed
          </template>
          <template v-else>
            {{ summary.done }} ready to download
          </template>
        </p>
      </div>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="xs"
        aria-label="Dismiss MP4 export status"
        @click="dismiss"
      />
    </div>
    <UProgress
      v-if="summary.pending"
      size="xs"
      class="mt-3"
      aria-label="MP4 export in progress"
    />
    <p v-if="current" class="mt-2 text-xs text-muted">
      {{ exportJobTiming(current, now) }}
    </p>
    <p v-else-if="latestDone?.startedAt" class="mt-2 text-xs text-muted">
      Latest video rendered in {{ exportElapsed(latestDone.startedAt, Date.parse(latestDone.updatedAt || '')) ?? 'a few minutes' }}.
    </p>
    <p v-if="loadError" class="mt-2 text-xs text-warning">
      Status temporarily unavailable. Checking again.
    </p>
    <div class="mt-3 flex gap-2">
      <UButton
        label="View exports"
        size="xs"
        variant="soft"
        @click="emit('open')"
      />
      <UButton
        v-if="!summary.pending && latestDone?.url"
        label="Download latest"
        icon="i-lucide-download"
        size="xs"
        variant="outline"
        :href="latestDone.url"
        download
      />
    </div>
  </aside>
</template>
