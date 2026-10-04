<script setup lang="ts">
import type { ExportJob } from '~/utils/bannerExportPoll'
import { FORMATS } from '~/utils/banner-constants'
import { createBannerSocialDraftSession } from '~/utils/bannerSocialDraftSession'

const props = defineProps<{ projectId: string; clientId?: string | null; completed: ExportJob[]; open: boolean }>()
const toast = useToast()
const history = ref<ExportJob[]>([])
const loading = ref(false)
const loadError = ref(false)
const creating = ref<string | null>(null)
const drafts = reactive<Record<string, string>>({})
const sessions = new Map<string, ReturnType<typeof createBannerSocialDraftSession>>()
const videos = computed(() => {
  const seen = new Set<string>()
  return [...props.completed, ...history.value].filter(job => {
    if (!job.url || seen.has(job.jobId)) return false
    seen.add(job.jobId)
    return true
  }).slice(0, 10)
})
let loadVersion = 0
async function loadHistory() {
  const version = ++loadVersion
  history.value = []
  if (!props.open) return
  loading.value = true
  loadError.value = false
  try {
    const rows = await $fetch<Array<{ renderJobId?: string; exportType?: string; formatKey: string; url: string | null; fileSize: number | null }>>('/api/agency/banner-studio/exports', { query: { projectId: props.projectId } })
    if (version !== loadVersion) return
    history.value = rows.filter(row => row.exportType === 'mp4' && row.renderJobId && row.url).map(row => ({
      jobId: row.renderJobId!, formatKey: row.formatKey, status: 'done', url: row.url, fileSize: row.fileSize, error: null
    }))
  } catch {
    if (version === loadVersion) loadError.value = true
  } finally {
    if (version === loadVersion) loading.value = false
  }
}
watch([() => props.open, () => props.projectId], loadHistory, { immediate: true })

async function createDraft(job: ExportJob) {
  if (creating.value || !props.clientId) return
  if (drafts[job.jobId]) {
    await navigateTo({ path: '/agency/social/publishing/compose', query: { edit: drafts[job.jobId] } })
    return
  }
  creating.value = job.jobId
  const session = sessions.get(job.jobId) || createBannerSocialDraftSession()
  sessions.set(job.jobId, session)
  try {
    const draft = await session.attempt(headers => $fetch<{ postId: string; clientId: string }>('/api/agency/banner-studio/social-draft', {
      method: 'POST', headers, body: { renderJobId: job.jobId }
    }))
    drafts[job.jobId] = draft.postId
    toast.add({ title: 'Social draft ready', description: 'Add your caption and choose an account before requesting approval.', color: 'success' })
    await navigateTo({ path: '/agency/social/publishing/compose', query: { edit: draft.postId } })
  } catch (error: any) {
    toast.add({ title: 'Could not open social draft', description: error?.data?.statusMessage || 'Try again. An existing draft will be reused.', color: 'error' })
  } finally {
    creating.value = null
  }
}
</script>

<template>
  <section class="mb-4 space-y-3 border-t border-default pt-4" aria-label="Completed video exports">
    <div class="flex items-center justify-between gap-3">
      <h4 class="text-sm font-semibold">Ready videos</h4>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" variant="ghost" size="xs" :loading="loading" @click="loadHistory" />
    </div>
    <UAlert v-if="loadError" color="warning" variant="subtle" title="Previous exports could not be loaded" description="Refresh to try again. New exports will still appear here." />
    <p v-if="!clientId" class="text-xs text-muted">Assign a client in project settings to create a social draft.</p>
    <p v-if="!videos.length && !loading && !loadError" class="text-xs text-muted">Completed MP4s will appear here for preview, download and social publishing.</p>
    <article v-for="job in videos" :key="job.jobId" class="rounded-lg border border-default overflow-hidden">
      <video :src="job.url!" controls playsinline preload="none" class="w-full max-h-64 object-contain bg-black" :aria-label="`${FORMATS[job.formatKey]?.name || job.formatKey} export preview`" />
      <div class="p-3 space-y-3">
        <div class="text-xs font-medium">{{ FORMATS[job.formatKey]?.name || job.formatKey }} <span class="text-muted">{{ FORMATS[job.formatKey]?.w }} × {{ FORMATS[job.formatKey]?.h }}</span></div>
        <div class="flex flex-wrap gap-2">
          <UButton label="Download MP4" icon="i-lucide-download" :href="job.url!" download variant="outline" size="sm" />
          <UButton :label="drafts[job.jobId] ? 'Open social draft' : 'Create social draft'" icon="i-lucide-send" size="sm" :disabled="!clientId || !!creating" :loading="creating === job.jobId" @click="createDraft(job)" />
        </div>
        <p class="text-xs text-muted">Creates a draft for review. Nothing is posted automatically.</p>
      </div>
    </article>
  </section>
</template>
