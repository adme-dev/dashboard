<script setup lang="ts">
import { createExportJobPoller, exportFormatLabel, summarizeExportJobs, type ExportJob } from '~/utils/bannerExportPoll'
import { apiErrorDescription } from '~/utils/apiError'
import { FORMATS } from '~/utils/banner-constants'
import { createBannerSocialDraftSession } from '~/utils/bannerSocialDraftSession'
import { bannerRenderSuggestions } from '~/utils/bannerRenderSuggestions'

const props = defineProps<{ projectId: string, clientId?: string | null, completed: ExportJob[], open: boolean, socialSuggestion?: { caption?: string, suggestedSchedule?: string } }>()
const emit = defineEmits<{ 'blocked': [value: boolean], 'pending-formats': [value: string[]] }>()
const toast = useToast()
const history = ref<ExportJob[]>([])
const loading = ref(false)
const loadError = ref(false)
const creating = ref<string | null>(null)
const retrying = ref<string | null>(null)
let mounted = true
const drafts = reactive<Record<string, string>>({})
const sessions = new Map<string, ReturnType<typeof createBannerSocialDraftSession>>()
const checked = ref(false)
const jobs = computed(() => {
  const byId = new Map(props.completed.map(job => [job.jobId, job]))
  for (const job of history.value) byId.set(job.jobId, job)
  return [...byId.values()]
})
const summary = computed(() => summarizeExportJobs(jobs.value))
const videos = computed(() => jobs.value.filter(job => job.status === 'done' && job.url).slice(0, 20))
const pendingJobs = computed(() => jobs.value.filter(job => job.status !== 'done'))
const poller = createExportJobPoller({
  fetchJobs: async () => {
    const response = await $fetch<{ jobs: ExportJob[] }>('/api/agency/banner-studio/export-video/jobs', { query: { projectId: props.projectId }, timeout: 15000 })
    return response.jobs
  },
  onJobs: (rows) => {
    history.value = rows
    checked.value = true
    loadError.value = false
  },
  onError: () => { loadError.value = true },
  onLoading: (value) => { loading.value = value }
})
function loadHistory() {
  void poller.refresh()
}
watch([() => props.open, () => props.projectId], ([open], previous) => {
  poller.stop()
  if (!previous || previous[1] !== props.projectId) {
    history.value = []
    checked.value = false
  }
  if (open) {
    checked.value = false
    void poller.start()
  }
}, { immediate: true })
watch(() => props.completed, () => {
  if (props.open) void poller.refresh()
})
watch(() => !checked.value || loadError.value || !!retrying.value, value => emit('blocked', value), { immediate: true })
watch(() => [...new Set(jobs.value.filter(job => !['done', 'failed'].includes(job.status)).map(job => job.formatKey))], value => emit('pending-formats', value), { immediate: true })
onBeforeUnmount(() => {
  mounted = false
  poller.stop()
})

function canRetry(job: ExportJob) {
  return job.canRetry === true && ['failed', 'queued'].includes(job.status)
}
async function retryJob(job: ExportJob) {
  if (retrying.value || !canRetry(job)) return
  const projectId = props.projectId
  retrying.value = job.jobId
  try {
    await $fetch(`/api/agency/banner-studio/export-video/jobs/${encodeURIComponent(job.jobId)}/retry`, { method: 'POST' })
    if (mounted && props.projectId === projectId) {
      toast.add({ title: 'Render retry requested', description: 'The existing render job will be refreshed below.', color: 'success' })
    }
  } catch (error: unknown) {
    if (mounted && props.projectId === projectId) {
      toast.add({ title: 'Could not confirm render retry', description: apiErrorDescription(error, 'Refresh this job before trying again.'), color: 'error' })
    }
  } finally {
    // A failed response can still mean the queue accepted the same job.
    // Keep its existing status until the authoritative history read returns.
    if (mounted && props.projectId === projectId) await poller.refresh()
    retrying.value = null
  }
}

async function createDraft(job: ExportJob) {
  if (creating.value || !props.clientId) return
  if (drafts[job.jobId]) {
    await navigateTo({ path: '/agency/social/publishing/compose', query: { edit: drafts[job.jobId] } })
    return
  }
  const socialSuggestion = bannerRenderSuggestions.get(props.projectId, props.clientId, job.jobId)
  creating.value = job.jobId
  const session = sessions.get(job.jobId) || createBannerSocialDraftSession()
  sessions.set(job.jobId, session)
  try {
    const draft = await session.attempt(headers => $fetch<{ postId: string, clientId: string }>('/api/agency/banner-studio/social-draft', {
      method: 'POST', headers, body: { renderJobId: job.jobId, socialSuggestion }
    }))
    drafts[job.jobId] = draft.postId
    toast.add({ title: 'Social draft ready', description: 'Review the caption and choose an account before requesting approval.', color: 'success' })
    await navigateTo({ path: '/agency/social/publishing/compose', query: { edit: draft.postId } })
  } catch (error: unknown) {
    toast.add({ title: 'Could not open social draft', description: apiErrorDescription(error, 'Try again. An existing draft will be reused.'), color: 'error' })
  } finally {
    creating.value = null
  }
}
</script>

<template>
  <section class="mb-4 space-y-3 border-t border-default pt-4" aria-label="Video exports">
    <div class="flex items-center justify-between gap-3">
      <h4 class="text-sm font-semibold">
        Video exports
      </h4>
      <UButton
        label="Refresh"
        icon="i-lucide-refresh-cw"
        variant="ghost"
        size="xs"
        :loading="loading"
        @click="loadHistory"
      />
    </div>
    <UAlert
      v-if="loadError"
      color="warning"
      variant="subtle"
      title="Render status temporarily unavailable"
      description="Your jobs are saved. We will keep checking; you can also refresh or reopen this dialog. No replacement jobs have been queued."
    />
    <p
      v-if="jobs.length"
      role="status"
      aria-live="polite"
      class="text-xs text-muted"
    >
      {{ summary.done }} ready · {{ summary.queued }} queued · {{ summary.rendering }} rendering · {{ summary.failed }} failed
      <span v-if="summary.pending > summary.queued + summary.rendering"> · {{ summary.pending - summary.queued - summary.rendering }} processing</span>
    </p>
    <p v-if="summary.pending" class="text-xs text-muted">
      Rendering continues if you close this dialog. Reopen it to recover the latest status.
    </p>
    <article v-for="job in pendingJobs" :key="job.jobId" class="rounded-lg border border-default p-3 space-y-1">
      <div class="flex justify-between gap-3 text-xs">
        <span>{{ exportFormatLabel(job.formatKey, FORMATS[job.formatKey]?.name) }}</span>
        <UBadge :color="job.status === 'failed' ? 'error' : 'neutral'" variant="subtle">
          {{ job.status }}
        </UBadge>
      </div>
      <UButton
        v-if="canRetry(job)"
        label="Retry render"
        icon="i-lucide-rotate-cw"
        variant="outline"
        size="sm"
        :disabled="!!retrying"
        :loading="retrying === job.jobId"
        @click="retryJob(job)"
      />
      <p v-if="job.error" class="text-xs text-muted">
        {{ job.error }}
      </p>
    </article>
    <p v-if="!clientId" class="text-xs text-muted">
      Assign a client in project settings to create a social draft.
    </p>
    <p v-if="!jobs.length && !loading && !loadError" class="text-xs text-muted">
      Completed MP4s will appear here for preview, download and social publishing.
    </p>
    <article v-for="job in videos" :key="job.jobId" class="rounded-lg border border-default overflow-hidden">
      <video
        :src="job.url!"
        controls
        playsinline
        preload="none"
        class="w-full max-h-64 object-contain bg-black"
        :aria-label="`${exportFormatLabel(job.formatKey, FORMATS[job.formatKey]?.name)} export preview`"
      />
      <div class="p-3 space-y-3">
        <div class="text-xs font-medium">
          {{ exportFormatLabel(job.formatKey, FORMATS[job.formatKey]?.name) }} <span class="text-muted">{{ FORMATS[job.formatKey]?.w }} × {{ FORMATS[job.formatKey]?.h }}</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Download MP4"
            icon="i-lucide-download"
            :href="job.url!"
            download
            variant="outline"
            size="sm"
          />
          <UButton
            :label="drafts[job.jobId] ? 'Open social draft' : 'Create social draft'"
            icon="i-lucide-send"
            size="sm"
            :disabled="!clientId || !!creating"
            :loading="creating === job.jobId"
            @click="createDraft(job)"
          />
        </div>
        <p class="text-xs text-muted">
          Creates a draft for review. Nothing is posted automatically.
        </p>
      </div>
    </article>
  </section>
</template>
