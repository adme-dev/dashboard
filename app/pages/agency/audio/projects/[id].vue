<script setup lang="ts">
// SP2c full multitrack editor. Extends the SP2b read-only preview by wiring every
// MediaTimeline emit to the composable actions, adding an edit toolbar (undo/redo,
// split, add-clip, save-version), and passing the reactive sources map for waveforms.
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useMediaProjectEditor } from '~~/app/composables/useMediaProjectEditor'
import type { PickedAsset } from '~~/app/components/media/MediaAssetPicker.vue'
import VideoStudioClipInspector from '~~/app/components/media/VideoStudioClipInspector.vue'
import VideoStudioInspector from '~~/app/components/media/VideoStudioInspector.vue'
import VideoStudioLibraryRail from '~~/app/components/media/VideoStudioLibraryRail.vue'
import VideoStudioOverlayComposer from '~~/app/components/media/VideoStudioOverlayComposer.vue'
import VideoStudioProducerRail from '~~/app/components/media/VideoStudioProducerRail.vue'
import VideoStudioRenderJobsPanel from '~~/app/components/media/VideoStudioRenderJobsPanel.vue'
import VideoStudioRenderStatusStrip from '~~/app/components/media/VideoStudioRenderStatusStrip.vue'
import VideoStudioReviewStatusPanel from '~~/app/components/media/VideoStudioReviewStatusPanel.vue'
import VideoStudioSelectedAssetPanel from '~~/app/components/media/VideoStudioSelectedAssetPanel.vue'
import VideoStudioVoiceComposer from '~~/app/components/media/VideoStudioVoiceComposer.vue'
import VideoStudioWorkbench from '~~/app/components/media/VideoStudioWorkbench.vue'
import { apiErrorDescription } from '~~/app/utils/apiError'
import { canReplaceVideoStudioClip } from '~~/app/utils/video/assetReplacement'
import { resolveVideoStudioClipInspector } from '~~/app/utils/video/clipInspector'
import { resolveGeneratedClipInspector } from '~~/app/utils/video/generatedClipInspector'
import { CLIP_EFFECT_PRESET_UI } from '~~/app/utils/video/clipEffectPresets'
import { effectPreviewPlan } from '~~/app/utils/video/effectPreview'
import type { CaptionStylePreset } from '~~/app/utils/audio/timelineEdit'
import type { AiAssemblyTimelinePayload } from '~~/app/utils/video/aiAssemblyTimeline'
import type { AssetDerivativeTimelinePayload } from '~~/app/utils/video/assetDerivativeTimeline'
import { audioStudioTimelinePayload } from '~~/app/utils/video/videoLibraryTimeline'
import type { VideoRenderFormatId } from '~~/app/utils/video/renderFormats'
import type { VideoStudioSelectedAssetActivity } from '~~/app/components/media/VideoStudioSelectedAssetPanel.vue'
import type { AudioAsset, MediaRenderJob } from '~~/app/types'
import { videoStudioAssetImageSource, type VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'
import type { VideoClip } from '~~/server/utils/audio/timelineSchema'
import type { VideoAsset } from '~~/server/utils/video/assets'
import { idempotencyKey } from '~~/app/utils/idempotencyKey'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()
const projectId = computed(() => String(route.params.id))
const editor = useMediaProjectEditor(projectId.value)
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; query?: Record<string, unknown>; headers?: Record<string, string> }
) => Promise<T>
type VideoClipFit = 'fit' | 'fill' | 'crop'
type VideoStudioMode = 'assets' | 'edit' | 'produce' | 'review'
type VideoStudioInspectorTab = 'details' | 'produce' | 'review'

const CLIP_FIT_OPTIONS: Array<{ id: VideoClipFit; label: string; icon: string; hint: string }> = [
  { id: 'fit', label: 'Fit', icon: 'i-lucide-minimize-2', hint: 'Keep the whole frame visible with padding when needed.' },
  { id: 'fill', label: 'Fill', icon: 'i-lucide-stretch-horizontal', hint: 'Stretch the source to the output frame.' },
  { id: 'crop', label: 'Crop', icon: 'i-lucide-scan', hint: 'Fill the frame and crop excess edges.' },
]

function resolvedClipFit(clip: VideoClip): VideoClipFit {
  if (clip.fit === 'fit' || clip.fit === 'fill' || clip.fit === 'crop') return clip.fit
  return clip.base_source === 'still_kenburns' ? 'crop' : 'fit'
}

// ─── Time format helper ───────────────────────────────────────────────────────

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// ─── Asset picker ─────────────────────────────────────────────────────────────

const pickerOpen = ref(false)

function onPickerPick(asset: PickedAsset) {
  if (!editor.timeline.value) return
  // Defensive add: if the project has no track of the asset's kind (e.g. an empty
  // timeline), addClipToKindTrackAction appends one before adding — the add never
  // silently no-ops. Track-create + clip-insert collapse into one undo step.
  editor.addClipToKindTrackAction(
    { id: asset.id, r2_key_master: asset.r2_key_master, kind: asset.kind },
    editor.currentTime.value,
    asset.streamUrl
  )
}

// ─── Save version modal ──────────────────────────────────────────────────────

const saveVersionOpen = ref(false)
const versionLabel = ref('')
const savingVersion = ref(false)
const toast = useToast()

// ─── AV (video studio) wiring ──────────────────────────────────────────────────
// Everything below is AV-only; audio projects (`!isAv`) keep the original behavior.

const config = useRuntimeConfig()
const publicConfig = config.public as {
  videoStudioEnabled?: boolean
  videoAssetHarnessEnabled?: boolean
  videoGenerationEnabled?: boolean
}
const videoStudioEnabled = computed(() => Boolean(publicConfig.videoStudioEnabled))
const videoAssetHarnessEnabled = computed(() => Boolean(publicConfig.videoAssetHarnessEnabled))
const isAv = computed(() => editor.mediaType.value === 'av')

// AV pickers
const overlayPickerOpen = ref(false)
const mediaPickerOpen = ref(false)

function onOverlayPick(p: { gsapProjectId: string; gsapFormatKey: string; durationSec?: number; startSec?: number }) {
  editor.addOverlayClipAction(p.gsapProjectId, p.gsapFormatKey, p.durationSec ?? 5, p.startSec ?? editor.currentTime.value)
}
function onMediaUploaded(p: { r2Key: string; durationSec: number; baseSource: 'uploaded_footage' | 'still_kenburns' }) {
  editor.addVideoClipAction(p.r2Key, p.durationSec, p.baseSource, editor.currentTime.value)
}

// ─── Video generation wiring ──────────────────────────────────────────────────

const videoGenerationEnabled = computed(() => Boolean(publicConfig.videoGenerationEnabled))
const videoGenerationModelsAvailable = computed(() => videoGenerationEnabled.value)
const videoGenerationReady = computed(() => videoGenerationEnabled.value && videoGenerationModelsAvailable.value)
const videoGenerationStatusLabel = computed(() => {
  if (videoGenerationReady.value) return 'AI ready'
  if (!videoGenerationEnabled.value) return 'AI disabled by policy'
  return 'No video models'
})
const videoGenerationStatusDetail = computed(() => {
  if (videoGenerationReady.value) return 'Cloudflare AI Gateway video models are available for this project.'
  if (!videoGenerationEnabled.value) return 'Video generation is disabled for this workspace. Ask an admin to enable the Video Studio generation policy.'
  return 'No runnable video models are configured for this Cloudflare account.'
})
const generatePickerOpen = ref(false)
const generationDraftPrompt = ref<string | null>(null)
const genJobs = useVideoGenerationJobs(projectId.value)
const videoAssets = ref<VideoAsset[]>([])
const selectedClipId = ref<string | null>(null)
const captionGeneratingAssetId = ref<string | null>(null)
const activeGenerationJobCount = computed(() => genJobs.jobs.value.filter(job => job.status === 'queued' || job.status === 'running').length)
const latestRenderJobStatus = computed(() => editor.renderJobs.value[0]?.status ?? null)
const selectedStudioAssetId = ref<string | null>(null)
const producerRailCollapsed = ref(false)
const videoStudioMode = ref<VideoStudioMode>('edit')
const producerBrief = ref('Create a punchy vertical social edit using the strongest project assets.')

const videoStudioInspectorTab = computed<VideoStudioInspectorTab>({
  get: () => {
    if (videoStudioMode.value === 'produce') return 'produce'
    if (videoStudioMode.value === 'review') return 'review'
    return 'details'
  },
  set: (tab) => {
    videoStudioMode.value = tab === 'details' ? 'edit' : tab
  },
})

const selectedStudioAssetModel = computed({
  get: () => selectedStudioAssetId.value,
  set: (assetId: string | null) => {
    selectedStudioAssetId.value = assetId
    // Keep the clip selection: "Replace selected clip" needs both an asset and a clip.
    if (assetId) videoStudioMode.value = 'edit'
  },
})

function selectStudioAsset(asset: VideoStudioAsset | null) {
  selectedStudioAssetModel.value = asset?.id ?? null
}

function selectTimelineClip(clipId: string | null) {
  selectedClipId.value = clipId
  if (clipId) {
    selectedStudioAssetId.value = null
    videoStudioMode.value = 'edit'
  }
}

interface StudioBannerProject {
  id: string
  name: string
  clientName?: string | null
  canvasData: Record<string, unknown>
  status?: string | null
}

const studioAudioData = ref<{ assets: AudioAsset[] } | null>(null)
const studioAudioPending = ref(false)
const studioBannerData = ref<StudioBannerProject[] | null>(null)
const studioBannerPending = ref(false)

async function refreshStudioAudioAssets() {
  studioAudioPending.value = true
  try {
    studioAudioData.value = await apiFetch<{ assets: AudioAsset[] }>('/api/agency/audio/assets', { query: { limit: 100 } })
  } finally {
    studioAudioPending.value = false
  }
}

async function refreshStudioBannerProjects() {
  studioBannerPending.value = true
  try {
    studioBannerData.value = await apiFetch<StudioBannerProject[]>('/api/agency/banner-studio/projects', { query: { limit: 100 } })
  } finally {
    studioBannerPending.value = false
  }
}

const studioAudioAssets = computed(() => studioAudioData.value?.assets ?? [])
const studioBannerProjects = computed(() => studioBannerData.value ?? [])
const studioOverlayAssets = computed(() => studioBannerProjects.value.flatMap(project =>
  Object.keys(project.canvasData ?? {}).map(formatKey => ({
    id: `${project.id}:${formatKey}`,
    title: project.name,
    formatKey,
    status: project.status ?? 'ready',
  }))
))
const { assets: studioAssets } = useVideoStudioAssets(computed(() => ({
  videoAssets: videoAssets.value,
  audioAssets: studioAudioAssets.value,
  overlays: studioOverlayAssets.value,
  generationJobs: genJobs.jobs.value,
})))
const videoStudioAssetCount = computed(() => studioAssets.value.length)
/** r2_key → library title, so timeline clips read as names rather than ids. */
const clipTitles = computed<Record<string, string | undefined>>(() => {
  const map: Record<string, string | undefined> = {}
  for (const asset of studioAssets.value) {
    if (asset.r2Key && !map[asset.r2Key]) map[asset.r2Key] = asset.title
  }
  for (const project of studioBannerProjects.value ?? []) map[project.id] = project.name
  return map
})
const selectedStudioAsset = computed(() => studioAssets.value.find(asset => asset.id === selectedStudioAssetId.value) ?? null)
const existingVoiceoverClipIds = computed(() => {
  const timeline = editor.timeline.value
  if (!timeline) return []
  return timeline.tracks
    .filter(track => track.kind === 'voiceover')
    .flatMap(track => track.clips.map(clip => clip.id))
})
const selectedGenerationSourceAsset = computed(() => videoStudioAssetImageSource(selectedStudioAsset.value))
const selectedStudioAssetActivity = computed<VideoStudioSelectedAssetActivity[]>(() => {
  const asset = selectedStudioAsset.value
  if (!asset) return []

  const ids = new Set([asset.rawId, asset.libraryAssetId, asset.id].filter(Boolean) as string[])
  const activity: VideoStudioSelectedAssetActivity[] = []

  for (const job of genJobs.jobs.value) {
    const matched = job.id === asset.rawId
      || (job.outputAssetId ? ids.has(job.outputAssetId) : false)
      || job.sourceAssetIds.some(sourceId => ids.has(sourceId))
    if (!matched) continue
    activity.push({
      id: `generation:${job.id}`,
      label: job.status === 'succeeded' ? 'Generated video asset' : 'Generation job',
      detail: job.errorMessage || job.prompt || job.modelId,
      status: job.status,
      source: job.modelId,
      createdAt: job.completedAt ?? job.startedAt ?? job.createdAt,
    })
  }

  if (asset.captionVttUrl) {
    activity.push({
      id: `caption:${asset.id}`,
      label: 'Caption file attached',
      detail: asset.captionVttKey,
      status: 'ready',
      source: 'Captions',
      createdAt: asset.createdAt,
    })
  }

  if (asset.transcript) {
    activity.push({
      id: `transcript:${asset.id}`,
      label: 'Transcript available',
      detail: asset.transcript,
      status: 'ready',
      source: 'Speech intelligence',
      createdAt: asset.createdAt,
    })
  }

  if (asset.type === 'derivative') {
    activity.push({
      id: `derivative:${asset.id}`,
      label: 'Derivative generated',
      detail: asset.r2Key,
      status: asset.status,
      source: asset.subtitle ?? 'Derivative',
      createdAt: asset.createdAt,
    })
  }

  return activity.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0
    return bt - at
  }).slice(0, 6)
})
const studioVoiceAssetCount = computed(() => studioAssets.value.filter(asset => asset.type === 'audio' && asset.role === 'voiceover').length)
const studioOverlayAssetCount = computed(() => studioAssets.value.filter(asset => asset.type === 'overlay').length)
const studioLibraryLoading = computed(() => studioAudioPending.value || studioBannerPending.value)

// Stills already on the timeline that can be registered as i2v source assets.
const timelineStills = computed(() => {
  const tl = editor.timeline.value
  if (!tl) return [] as { clipId: string; label: string }[]
  const out: { clipId: string; label: string }[] = []
  for (const t of tl.tracks) if (t.kind === 'video') for (const c of t.clips) {
    if (c.type !== 'video') continue
    if (c.base_source === 'still_kenburns' && c.r2_key) out.push({ clipId: c.id, label: `Still @ ${Math.round(c.timeline_start_sec)}s` })
  }
  return out
})
const projectAspect = computed(() => {
  const tl = editor.timeline.value
  if (!tl) return '9:16'
  return tl.width >= tl.height ? '16:9' : '9:16'
})

function onGenerationSubmitted(_jobId: string) { void genJobs.start() }
function onLibraryAddToTimeline(p: { assetId: string; r2Key: string; durationSec: number; streamUrl: string; title: string | null; format: string | null }) {
  editor.mergeSource(p.r2Key, p.streamUrl, { durationSec: p.durationSec, assetId: p.assetId, title: p.title, format: p.format })
  editor.addVideoClipAction(p.r2Key, p.durationSec, 'uploaded_footage', editor.currentTime.value, p.assetId)
  toast.add({ title: 'Added to timeline', color: 'success' })
}

function onHarnessAddToTimeline(p: AiAssemblyTimelinePayload) {
  const streamUrl = p.assetId ? `/api/agency/video/assets/${encodeURIComponent(p.assetId)}/stream` : p.r2Key
  editor.mergeSource(p.r2Key, streamUrl, { durationSec: p.durationSec, assetId: p.assetId, title: p.title, format: p.format })
  editor.addVideoClipAction(p.r2Key, p.durationSec, 'uploaded_footage', p.startSec, p.assetId)
}

function onHarnessAddDerivativeToTimeline(p: AssetDerivativeTimelinePayload) {
  editor.mergeSource(p.r2Key, p.streamUrl, { durationSec: p.durationSec, assetId: null, title: p.title, format: p.format })
  editor.addVideoClipAction(p.r2Key, p.durationSec, p.baseSource, editor.currentTime.value, null)
  toast.add({ title: 'Derivative added to timeline', color: 'success' })
}

async function refreshVideoAssets() {
  try {
    const res = await editor.listVideoAssets()
    videoAssets.value = res.assets ?? []
  } catch {
    videoAssets.value = []
  }
}

async function refreshStudioLibrary() {
  await Promise.all([
    refreshVideoAssets(),
    genJobs.refresh(),
    refreshStudioAudioAssets(),
    refreshStudioBannerProjects(),
  ])
}

function onStudioAssetAdd(asset: VideoStudioAsset) {
  if (asset.type === 'video') {
    const video = videoAssets.value.find(candidate => candidate.id === asset.rawId)
    if (!video?.r2Key) return
    onLibraryAddToTimeline({
      assetId: video.id,
      r2Key: video.r2Key,
      durationSec: video.durationSec ?? 5,
      streamUrl: `/api/agency/video/assets/${encodeURIComponent(video.id)}/stream`,
      title: video.title,
      format: video.format,
    })
    return
  }

  if (asset.type === 'job') {
    const job = genJobs.jobs.value.find(candidate => candidate.id === asset.rawId)
    if (!job?.outputAssetId || !job.outputR2Key) return
    onLibraryAddToTimeline({
      assetId: job.outputAssetId,
      r2Key: job.outputR2Key,
      durationSec: job.durationSeconds ?? 5,
      streamUrl: `/api/agency/video/assets/${encodeURIComponent(job.outputAssetId)}/stream`,
      title: job.prompt,
      format: job.aspectRatio,
    })
    return
  }

  if (asset.type === 'audio') {
    const audio = studioAudioAssets.value.find(candidate => candidate.id === asset.rawId)
    if (!audio) return
    const payload = audioStudioTimelinePayload(audio)
    if (!payload) return
    onPickerPick(payload)
    return
  }

  if (asset.type === 'overlay' && asset.format) {
    const [projectIdForOverlay] = asset.rawId.split(':')
    if (!projectIdForOverlay) return
    onOverlayPick({ gsapProjectId: projectIdForOverlay, gsapFormatKey: asset.format })
  }
}

function onStudioAssetAddCaptions(asset: VideoStudioAsset) {
  const text = asset.transcript?.trim()
  if (!text || !asset.captionVttUrl) return
  editor.addCaptionClipAction(
    text,
    editor.currentTime.value,
    asset.durationSec ?? Math.max(editor.duration.value - editor.currentTime.value, 5),
    asset.libraryAssetId ?? asset.rawId,
    asset.captionVttUrl
  )
  toast.add({ title: 'Captions added to timeline', color: 'success' })
}

function onStudioAssetGenerate(asset: VideoStudioAsset) {
  selectStudioAsset(asset)
  if (!videoStudioAssetImageSource(asset)) return
  generationDraftPrompt.value = asset.prompt
  generatePickerOpen.value = true
}

function onStudioAssetInspect(asset: VideoStudioAsset) {
  selectStudioAsset(asset)
}

async function onStudioAssetPublish(asset: VideoStudioAsset) {
  selectStudioAsset(asset)
  if (!asset.libraryAssetId) return
  try {
    const res = await editor.publishVideoAssetToSocial(asset.libraryAssetId)
    await navigateTo(`/agency/social/publishing/compose?edit=${res.postId}&client=${res.clientId}`)
  } catch (e: unknown) {
    toast.add({ title: 'Could not publish asset', description: apiErrorDescription(e, ''), color: 'error' })
  }
}

async function onGenerateCaptions(asset: VideoStudioAsset) {
  selectStudioAsset(asset)
  if (!asset.libraryAssetId || captionGeneratingAssetId.value) return
  captionGeneratingAssetId.value = asset.id
  try {
    await apiFetch(`/api/agency/video/assets/${encodeURIComponent(asset.libraryAssetId)}/captions`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('asset-captions') }
    })
    await refreshVideoAssets()
    toast.add({ title: 'Captions generated', description: 'A VTT caption track is attached to the selected asset.', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Could not generate captions', description: apiErrorDescription(e, ''), color: 'error' })
  } finally {
    captionGeneratingAssetId.value = null
  }
}

function onVoiceoverGenerated() {
  void refreshStudioAudioAssets()
}

function onVoiceoverAddToTimeline(asset: AudioAsset) {
  const payload = audioStudioTimelinePayload(asset)
  if (!payload) return
  onPickerPick(payload)
}

function onVoiceoverReplaceTimeline(asset: AudioAsset) {
  for (const clipId of existingVoiceoverClipIds.value) editor.deleteClipAction(clipId)
  onVoiceoverAddToTimeline(asset)
}

function onReusePrompt(p: { prompt: string; modelId: string | null }) {
  generationDraftPrompt.value = p.prompt
  libraryOpen.value = false
  generatePickerOpen.value = true
}

// Selected video clip (any source) — drives the per-clip effects drawer.
const selectedVideoClip = computed(() => {
  const tl = editor.timeline.value
  if (!tl || !selectedClipId.value) return null
  for (const track of tl.tracks) {
    if (track.kind !== 'video') continue
    const clip = track.clips.find((candidate): candidate is VideoClip => candidate.type === 'video' && candidate.id === selectedClipId.value)
    if (clip) {
      return {
        clipId: clip.id,
        effects: clip.effects ?? [],
        fit: resolvedClipFit(clip),
        label: clip.base_source === 'still_kenburns' ? 'Still' : 'Footage',
        startSec: clip.timeline_start_sec
      }
    }
  }
  return null
})

const selectedOverlayClip = computed(() => {
  const tl = editor.timeline.value
  if (!tl || !selectedClipId.value) return null
  for (const track of tl.tracks) {
    if (track.kind !== 'overlay') continue
    const clip = track.clips.find(candidate => candidate.type === 'overlay' && candidate.id === selectedClipId.value)
    if (!clip || clip.type !== 'overlay') continue
    return {
      clipId: clip.id,
      startSec: clip.timeline_start_sec,
      durationSec: clip.duration_sec,
    }
  }
  return null
})

const selectedClipInspector = computed(() => resolveVideoStudioClipInspector({
  timeline: editor.timeline.value,
  selectedClipId: selectedClipId.value,
}))
const canReplaceSelectedClipWithAsset = computed(() => canReplaceVideoStudioClip({
  clip: selectedClipInspector.value,
  asset: selectedStudioAsset.value,
}))

function splitSelectedClip() {
  const selected = selectedClipInspector.value
  if (!selected || selected.kind !== 'audio') return
  editor.sliceAction(selected.clipId, editor.currentTime.value)
}

function deleteSelectedClip() {
  const selected = selectedClipInspector.value
  if (!selected) return
  editor.deleteClipAction(selected.clipId)
  selectedClipId.value = null
}

function setSelectedCaptionStyle(style: CaptionStylePreset) {
  const selected = selectedClipInspector.value
  if (!selected || selected.kind !== 'caption') return
  editor.setCaptionStyleAction(selected.clipId, style)
}

function imageR2Key(r2Key: string | null): boolean {
  return Boolean(r2Key && /\.(png|jpe?g|webp)$/i.test(r2Key.split('?')[0] ?? ''))
}

function replaceSelectedClipWithAsset(asset: VideoStudioAsset) {
  const selected = selectedClipInspector.value
  if (!selected || !canReplaceVideoStudioClip({ clip: selected, asset })) return
  const startSec = selected.startSec
  const durationSec = selected.durationSec ?? asset.durationSec ?? 5
  let applyReplacement: (() => void) | null = null

  if (selected.kind === 'video' && asset.r2Key) {
    applyReplacement = () => {
      const streamUrl = asset.previewUrl ?? asset.r2Key!
      editor.mergeSource(asset.r2Key!, streamUrl, {
        durationSec,
        assetId: asset.libraryAssetId,
        title: asset.title,
        format: asset.format,
      })
      editor.addVideoClipAction(
        asset.r2Key!,
        durationSec,
        imageR2Key(asset.r2Key) ? 'still_kenburns' : 'uploaded_footage',
        startSec,
        asset.libraryAssetId
      )
    }
  } else if (selected.kind === 'audio') {
    const audio = studioAudioAssets.value.find(candidate => candidate.id === asset.rawId)
    const payload = audio ? audioStudioTimelinePayload(audio) : null
    if (payload) {
      applyReplacement = () => editor.addClipToKindTrackAction(payload, startSec, payload.streamUrl)
    }
  } else if (selected.kind === 'overlay' && asset.format) {
    const [projectIdForOverlay] = asset.rawId.split(':')
    if (projectIdForOverlay) {
      applyReplacement = () => editor.addOverlayClipAction(projectIdForOverlay, asset.format!, durationSec, startSec)
    }
  } else if (selected.kind === 'caption' && asset.transcript?.trim()) {
    applyReplacement = () => {
      editor.addCaptionClipAction(
        asset.transcript!.trim(),
        startSec,
        durationSec,
        asset.libraryAssetId ?? asset.rawId,
        asset.captionVttUrl
      )
    }
  }

  if (!applyReplacement) return
  editor.deleteClipAction(selected.clipId)
  applyReplacement()
  selectedClipId.value = null
  toast.add({ title: 'Selected clip replaced', color: 'success' })
}

function onReplaceSelectedOverlay(p: { gsapProjectId: string; gsapFormatKey: string; durationSec?: number; startSec?: number }) {
  const selected = selectedOverlayClip.value
  if (!selected) return
  editor.deleteClipAction(selected.clipId)
  editor.addOverlayClipAction(
    p.gsapProjectId,
    p.gsapFormatKey,
    p.durationSec ?? selected.durationSec,
    p.startSec ?? selected.startSec
  )
}

function toggleClipEffect(presetId: string) {
  const selected = selectedVideoClip.value
  if (!selected) return
  const effects = selected.effects.includes(presetId)
    ? selected.effects.filter(id => id !== presetId)
    : [...selected.effects, presetId]
  editor.setClipEffectsAction(selected.clipId, effects)
}

const selectedGeneratedClip = computed(() => resolveGeneratedClipInspector({
  selectedClipId: selectedClipId.value,
  timeline: editor.timeline.value,
  assets: videoAssets.value,
}))
const selectedVideoEffectPlan = computed(() => effectPreviewPlan(selectedVideoClip.value?.effects ?? []))
const selectedVideoEffectLabels = computed(() => {
  const selected = new Set(selectedVideoClip.value?.effects ?? [])
  return CLIP_EFFECT_PRESET_UI.filter(preset => selected.has(preset.id)).map(preset => preset.label)
})

async function copySelectedPrompt() {
  if (selectedGeneratedClip.value.kind !== 'generated-video' || !selectedGeneratedClip.value.prompt) return
  await navigator.clipboard?.writeText(selectedGeneratedClip.value.prompt)
}

function duplicateSelectedGeneratedClip() {
  if (selectedGeneratedClip.value.kind !== 'generated-video') return
  editor.mergeSource(selectedGeneratedClip.value.r2Key, `/api/agency/video/assets/${selectedGeneratedClip.value.assetId}/stream`, {
    durationSec: selectedGeneratedClip.value.durationSec ?? 5,
    assetId: selectedGeneratedClip.value.assetId,
    title: selectedGeneratedClip.value.title,
    format: selectedGeneratedClip.value.format,
  })
  editor.addVideoClipAction(selectedGeneratedClip.value.r2Key, selectedGeneratedClip.value.durationSec ?? 5, 'uploaded_footage', editor.currentTime.value, selectedGeneratedClip.value.assetId)
}

async function publishSelectedGeneratedClip() {
  if (selectedGeneratedClip.value.kind !== 'generated-video') return
  try {
    const res = await editor.publishVideoAssetToSocial(selectedGeneratedClip.value.assetId)
    await navigateTo(`/agency/social/publishing/compose?edit=${res.postId}&client=${res.clientId}`)
  } catch (e: unknown) {
    toast.add({ title: 'Could not publish selected clip', description: apiErrorDescription(e, ''), color: 'error' })
  }
}

// Render
async function onRenderVideo(formats?: VideoRenderFormatId[]) {
  const res = await editor.renderVideoAction(formats)
  if (res.ok) toast.add({ title: 'Render queued', description: 'Your video is rendering.', color: 'success' })
  else if (res.flagOff) toast.add({ title: 'Video rendering is disabled', description: 'Ask an admin to enable VIDEO_STUDIO_ENABLED.', color: 'warning' })
  else toast.add({ title: 'Failed to queue render', color: 'error' })
}

async function onRetryRender() {
  await onRenderVideo()
}

async function onPublishToSocial(job: MediaRenderJob, format: string) {
  try {
    const res = await editor.publishToSocial(job.id, format)
    await navigateTo(`/agency/social/publishing/compose?edit=${res.postId}&client=${res.clientId}`)
  } catch (e: unknown) {
    toast.add({ title: 'Could not publish to social', description: apiErrorDescription(e, ''), color: 'error' })
  }
}

async function onSendToPortal(job: MediaRenderJob, format: string) {
  try {
    await editor.sendToPortal(job.id, String(format))
    toast.add({ title: 'Sent to client portal', description: 'The client can review it in their portal.', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Could not send to portal', description: apiErrorDescription(e, ''), color: 'error' })
  }
}

async function onSaveAsset(job: MediaRenderJob, format: string) {
  try {
    await editor.saveAsset(job.id, String(format))
    await refreshVideoAssets()
    toast.add({ title: 'Saved to library', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Could not save to library', description: apiErrorDescription(e, ''), color: 'error' })
  }
}

// Video library (AV reuse)
const libraryOpen = ref(false)
async function onLibraryPublish(p: { assetId: string; sourceJobId: string | null; format: string }) {
  try {
    const res = await editor.publishVideoAssetToSocial(p.assetId)
    await navigateTo(`/agency/social/publishing/compose?edit=${res.postId}&client=${res.clientId}`)
  } catch (e: unknown) {
    toast.add({ title: 'Could not publish from library', description: apiErrorDescription(e, ''), color: 'error' })
  }
}

// Refresh render jobs once an AV project finishes loading (isAv depends on the
// async-loaded timeline, so watch it rather than onMounted).
watch(isAv, (av) => {
  if (!av) return
  void editor.refreshRenderJobs()
  void refreshStudioLibrary()
}, { immediate: true })

watch(() => genJobs.jobs.value.map((job) => `${job.id}:${job.status}:${job.outputAssetId ?? ''}`).join('|'), () => {
  if (genJobs.jobs.value.some((job) => job.status === 'succeeded' && job.outputAssetId)) void refreshVideoAssets()
})

async function doSaveVersion() {
  if (savingVersion.value) return
  savingVersion.value = true
  try {
    await editor.saveVersion(versionLabel.value.trim() || 'Snapshot')
    toast.add({ title: 'Version saved', color: 'success' })
    saveVersionOpen.value = false
    versionLabel.value = ''
  } catch {
    toast.add({ title: 'Failed to save version', color: 'error' })
  } finally {
    savingVersion.value = false
  }
}

// ─── Versions slideover ───────────────────────────────────────────────────────

interface VersionRow {
  id: string
  version: number
  label: string | null
  createdAt: string
  state: import('~~/server/utils/audio/timelineSchema').TimelineState
}

const versionsOpen = ref(false)
const versions = ref<VersionRow[]>([])
const versionsLoading = ref(false)
const restoringId = ref<string | null>(null)

async function loadVersions() {
  versionsLoading.value = true
  try {
    const res = await editor.listVersions()
    versions.value = res.versions
  } catch {
    toast.add({ title: 'Failed to load versions', color: 'error' })
  } finally {
    versionsLoading.value = false
  }
}

function openVersions() {
  versionsOpen.value = true
  void loadVersions()
}

async function restore(version: VersionRow) {
  if (restoringId.value) return
  restoringId.value = version.id
  const name = version.label ?? `v${version.version}`
  try {
    // Never overwrite the working draft silently: checkpoint it first so the
    // restore itself is undoable from the version list.
    if (editor.dirty.value || editor.saveStatus.value !== 'saved') await editor.saveNow()
    await editor.saveVersion(`Before restoring ${name}`)
    editor.restoreVersion(version.state)
    toast.add({ title: `Restored ${name}`, description: 'Your previous draft was saved as a version first.', color: 'success' })
    versionsOpen.value = false
  } catch (e: unknown) {
    toast.add({ title: 'Could not restore version', description: apiErrorDescription(e, 'The current draft could not be checkpointed.'), color: 'error' })
  } finally {
    restoringId.value = null
  }
}

function fmtVersionDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────
// S and Delete are handled inside MediaTimeline (window listener).
// Cmd/Ctrl+Z → undo, Cmd/Ctrl+Shift+Z → redo.

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────
// Split (S) and Delete are handled inside MediaTimeline when it has focus.

const SHORTCUTS = [
  { keys: 'Space', label: 'Play / pause' },
  { keys: 'Home', label: 'Go to start' },
  { keys: '← →', label: 'Nudge 1 s  (⇧ 5 s)' },
  { keys: '⌘Z', label: 'Undo' },
  { keys: '⌘⇧Z', label: 'Redo' },
  { keys: '⌘S', label: 'Save now' },
  { keys: 'S', label: 'Split selected clip' },
  { keys: '⌫', label: 'Delete selected clip' },
] as const

function togglePlayback() {
  if (editor.isPlaying.value) editor.pause()
  else editor.play()
}

function onKeyDown(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
  const isMeta = event.metaKey || event.ctrlKey
  if (isMeta && event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
    event.preventDefault()
    editor.redoAction()
  } else if (isMeta && (event.key === 'z' || event.key === 'Z')) {
    event.preventDefault()
    editor.undoAction()
  } else if (isMeta && (event.key === 's' || event.key === 'S')) {
    event.preventDefault()
    void retrySave()
  } else if (!isMeta && event.key === ' ') {
    event.preventDefault()
    togglePlayback()
  } else if (!isMeta && event.key === 'Home') {
    event.preventDefault()
    editor.seek(0)
  } else if (!isMeta && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault()
    const step = (event.shiftKey ? 5 : 1) * (event.key === 'ArrowLeft' ? -1 : 1)
    editor.seek(Math.min(editor.duration.value, Math.max(0, editor.currentTime.value + step)))
  }
}

// ─── Missing-source clips ────────────────────────────────────────────────────

function missingClipLabel(clipId: string): string {
  const lane = editor.timeline.value?.tracks.find(track => track.clips.some(clip => clip.id === clipId))
  return lane?.name ?? 'clip'
}
function selectMissingClip(clipId: string) {
  selectTimelineClip(clipId)
  // The replacement comes from the assets rail; make sure it's on screen below lg.
  videoStudioMode.value = 'assets'
  toast.add({ title: 'Clip selected', description: 'Pick a replacement asset in the rail and use "Replace selected clip".', color: 'neutral' })
}

// ─── Numeric timing edits from the inspector ─────────────────────────────────

function setSelectedTiming(payload: { field: 'start' | 'duration' | 'end'; seconds: number }) {
  const clip = selectedClipInspector.value
  if (!clip) return
  if (payload.field === 'start') {
    editor.moveClipAction(clip.clipId, clip.trackId, payload.seconds)
  } else if (payload.field === 'duration') {
    editor.trimClipAction(clip.clipId, 'end', clip.startSec + payload.seconds)
  } else {
    editor.trimClipAction(clip.clipId, 'end', payload.seconds)
  }
}

// ─── Empty-lane "Add …" affordance → the matching picker ─────────────────────

function onAddToTrack(payload: { trackId: string; kind: string }) {
  const kind = payload.kind === 'audio' ? 'audio' : payload.kind
  if (kind === 'video') mediaPickerOpen.value = true
  else if (kind === 'overlay') overlayPickerOpen.value = true
  else if (kind === 'caption' || kind === 'voiceover') {
    // Captions and voiceover are produced, not picked.
    videoStudioMode.value = 'produce'
    producerRailCollapsed.value = false
  } else pickerOpen.value = true
}

// ─── Dock height (resizable, remembered per browser) ─────────────────────────

const DOCK_MIN = 220
const DOCK_MAX = 640
const DOCK_KEY = 'video-studio:dock-height'
const dockHeight = ref(360)
let dockDrag: { startY: number; startHeight: number } | null = null

function onDockDragStart(event: PointerEvent) {
  dockDrag = { startY: event.clientY, startHeight: dockHeight.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function onDockDragMove(event: PointerEvent) {
  if (!dockDrag) return
  // Dragging up grows the dock.
  dockHeight.value = Math.min(DOCK_MAX, Math.max(DOCK_MIN, dockDrag.startHeight + (dockDrag.startY - event.clientY)))
}
function onDockDragEnd() {
  if (!dockDrag) return
  dockDrag = null
  try { localStorage.setItem(DOCK_KEY, String(dockHeight.value)) } catch { /* private mode */ }
}

// ─── Unsaved-changes guard ───────────────────────────────────────────────────
// Autosave is debounced (1.5 s) and can fail; never let the user walk away
// from edits that haven't reached the server.

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!editor.dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(async () => {
  if (!editor.dirty.value) return true
  // Try to flush first — most of the time this just succeeds and nobody is asked.
  try {
    await editor.saveNow()
    return true
  } catch {
    return await confirmDiscard()
  }
})

const discardConfirmOpen = ref(false)
let resolveDiscard: ((ok: boolean) => void) | null = null
function confirmDiscard(): Promise<boolean> {
  discardConfirmOpen.value = true
  return new Promise(resolve => { resolveDiscard = resolve })
}
function answerDiscard(ok: boolean) {
  discardConfirmOpen.value = false
  resolveDiscard?.(ok)
  resolveDiscard = null
}

onMounted(() => {
  try {
    const stored = Number(localStorage.getItem(DOCK_KEY))
    if (Number.isFinite(stored) && stored >= DOCK_MIN && stored <= DOCK_MAX) dockHeight.value = stored
  } catch { /* private mode */ }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('beforeunload', onBeforeUnload)
  if (videoGenerationEnabled.value) void genJobs.start()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  genJobs.stop()
})

// ─── Save status ─────────────────────────────────────────────────────────────

const saveStatusLabel = computed(() => {
  switch (editor.saveStatus.value) {
    case 'saving': return 'Saving…'
    case 'saved': return 'Saved'
    case 'error': return 'Not saved'
    default: return editor.dirty.value ? 'Unsaved changes' : null
  }
})

const saveStatusColor = computed(() => {
  switch (editor.saveStatus.value) {
    case 'saving': return 'text-muted'
    case 'saved': return 'text-success'
    case 'error': return 'text-error'
    default: return 'text-muted'
  }
})

const saveStatusIcon = computed(() => {
  switch (editor.saveStatus.value) {
    case 'saving': return 'i-lucide-loader-circle'
    case 'saved': return 'i-lucide-cloud-check'
    case 'error': return 'i-lucide-cloud-off'
    default: return 'i-lucide-cloud'
  }
})

// Translate the server's reason into something a producer can act on.
const saveErrorDescription = computed(() => {
  const reason = editor.saveError.value ?? 'Unknown error'
  if (/God mode/i.test(reason)) {
    return `${reason}. This route isn't registered for owner (God mode) sessions yet — ask an engineer to add it to the mutation registry.`
  }
  if (/not editable|duplicate to a new version/i.test(reason)) {
    return 'This version is frozen. Use "Save version" to start a new editable draft.'
  }
  return `${reason}. Your edits are kept in this tab — retry, or copy anything important before leaving.`
})

let saveErrorToastShown = false
watch(() => editor.saveStatus.value, (status) => {
  if (status === 'error' && !saveErrorToastShown) {
    saveErrorToastShown = true
    toast.add({ title: 'Changes aren\'t being saved', description: editor.saveError.value ?? undefined, color: 'error', icon: 'i-lucide-cloud-off' })
  } else if (status === 'saved') {
    saveErrorToastShown = false
  }
})

async function retrySave() {
  try {
    await editor.saveNow()
    toast.add({ title: 'Saved', color: 'success' })
  } catch {
    // saveStatus/saveError already reflect the failure; the alert stays up.
  }
}

// ─── Project identity ────────────────────────────────────────────────────────

const projectTitle = computed(() => editor.project.value?.title?.trim() || 'Untitled project')

const { data: clientsData } = useFetch<Array<{ id: string; name: string }>>('/api/agency/clients', { default: () => [] })
const projectClientName = computed(() => {
  const clientId = editor.project.value?.clientId
  if (!clientId) return null
  return clientsData.value?.find(client => client.id === clientId)?.name ?? null
})

// Client assignment — USelectMenu never gets an empty-string value; 'none' is the sentinel.
const NO_CLIENT = 'none'
const clientPopoverOpen = ref(false)
const clientDraft = ref<string>(NO_CLIENT)
const clientSaving = ref(false)
const clientOptions = computed(() => [
  { label: 'No client', value: NO_CLIENT },
  ...(clientsData.value ?? []).map(client => ({ label: client.name, value: client.id })),
])
watch(clientPopoverOpen, (open) => {
  if (open) clientDraft.value = editor.project.value?.clientId ?? NO_CLIENT
})
async function commitClient() {
  if (clientSaving.value) return
  const next = clientDraft.value === NO_CLIENT ? null : clientDraft.value
  if (next === (editor.project.value?.clientId ?? null)) { clientPopoverOpen.value = false; return }
  clientSaving.value = true
  try {
    await editor.updateProject({ clientId: next })
    clientPopoverOpen.value = false
    toast.add({ title: next ? 'Client assigned' : 'Client removed', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Could not update client', description: apiErrorDescription(e, ''), color: 'error' })
  } finally {
    clientSaving.value = false
  }
}

const renaming = ref(false)
const renameDraft = ref('')
const renameSaving = ref(false)
const renameInputRef = ref<{ inputRef?: HTMLInputElement } | null>(null)

function startRename() {
  renameDraft.value = editor.project.value?.title ?? ''
  renaming.value = true
  void nextTick(() => renameInputRef.value?.inputRef?.select())
}
function cancelRename() {
  renaming.value = false
}
async function commitRename() {
  if (!renaming.value || renameSaving.value) return
  const next = renameDraft.value.trim()
  const current = editor.project.value?.title ?? ''
  // Close the input first so the blur that follows Enter can't commit twice.
  renaming.value = false
  if (next === current.trim()) return
  renameSaving.value = true
  try {
    await editor.updateProject({ title: next || null })
    toast.add({ title: 'Project renamed', color: 'success' })
  } catch (e: unknown) {
    renameDraft.value = next
    toast.add({ title: 'Could not rename project', description: apiErrorDescription(e, ''), color: 'error' })
  } finally {
    renameSaving.value = false
  }
}

const backTo = computed(() => isAv.value ? '/agency/audio/projects?mediaType=av' : '/agency/audio/projects')
</script>

<template>
  <!-- Both project kinds run as a fixed-height editor with the timeline docked
       at the bottom; AV adds the three-column workbench above it. -->
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="flex min-h-0 flex-1 flex-col gap-3 p-3">

      <!-- Command bar: identity on the left, history on the right. One row. -->
      <header class="flex shrink-0 flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="sm"
          :to="backTo"
          aria-label="Back to projects"
        />
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <template v-if="renaming">
            <UInput
              ref="renameInputRef"
              v-model="renameDraft"
              size="sm"
              class="w-full max-w-md"
              placeholder="Project title"
              aria-label="Project title"
              :loading="renameSaving"
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="cancelRename"
              @blur="commitRename"
            />
          </template>
          <button
            v-else
            type="button"
            class="group flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-elevated"
            title="Rename project"
            @click="startRename"
          >
            <h1 class="truncate text-lg font-semibold tracking-tight text-highlighted">{{ projectTitle }}</h1>
            <UIcon name="i-lucide-pencil" class="size-3.5 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
          </button>
          <UBadge :label="isAv ? 'Video' : 'Audio'" size="xs" variant="subtle" color="neutral" class="shrink-0" />
          <UPopover v-model:open="clientPopoverOpen">
            <UButton
              :icon="projectClientName ? 'i-lucide-building-2' : 'i-lucide-building-2'"
              size="xs"
              variant="ghost"
              color="neutral"
              class="hidden shrink-0 sm:inline-flex"
              :label="projectClientName ?? 'No client'"
              :title="projectClientName ? 'Change client' : 'Assign a client'"
            />
            <template #content>
              <div class="w-72 space-y-3 p-3">
                <UFormField label="Client" help="Portal hand-off and social publishing use this client.">
                  <USelectMenu
                    v-model="clientDraft"
                    :items="clientOptions"
                    value-key="value"
                    size="sm"
                    class="w-full"
                    placeholder="Choose a client"
                    :search-input="{ placeholder: 'Search clients' }"
                  />
                </UFormField>
                <div class="flex justify-end gap-2">
                  <UButton size="xs" variant="ghost" color="neutral" label="Cancel" @click="clientPopoverOpen = false" />
                  <UButton size="xs" color="primary" label="Save client" :loading="clientSaving" @click="commitClient" />
                </div>
              </div>
            </template>
          </UPopover>
        </div>

        <!-- Save status: always visible, never decorative. -->
        <UTooltip :text="editor.saveError.value ?? ''" :disabled="!editor.saveError.value">
          <span
            v-if="saveStatusLabel"
            class="inline-flex items-center gap-1 text-xs font-medium tabular-nums"
            :class="saveStatusColor"
          >
            <UIcon :name="saveStatusIcon" class="size-3.5" :class="editor.saveStatus.value === 'saving' ? 'animate-spin' : ''" />
            {{ saveStatusLabel }}
          </span>
        </UTooltip>

        <div v-if="editor.status.value === 'ready'" class="flex items-center gap-1 rounded-md border border-default bg-elevated p-1">
          <UButton icon="i-lucide-undo-2" size="xs" variant="ghost" color="neutral" :disabled="!editor.canUndo.value" aria-label="Undo (⌘Z)" title="Undo (⌘Z)" @click="editor.undoAction()" />
          <UButton icon="i-lucide-redo-2" size="xs" variant="ghost" color="neutral" :disabled="!editor.canRedo.value" aria-label="Redo (⌘⇧Z)" title="Redo (⌘⇧Z)" @click="editor.redoAction()" />
          <div class="mx-0.5 h-4 w-px bg-default" />
          <UButton v-if="!isAv" icon="i-lucide-plus-circle" size="xs" variant="soft" color="primary" label="Add clip" @click="pickerOpen = true" />
          <UButton icon="i-lucide-bookmark" size="xs" variant="ghost" color="neutral" label="Save version" title="Snapshot the timeline" @click="saveVersionOpen = true" />
          <UButton icon="i-lucide-history" size="xs" variant="ghost" color="neutral" label="Versions" @click="openVersions" />
        </div>
      </header>

      <!-- Save failures block editing confidence: say what happened and offer retry. -->
      <UAlert
        v-if="editor.saveStatus.value === 'error'"
        color="error"
        variant="subtle"
        icon="i-lucide-cloud-off"
        class="shrink-0"
        title="Changes aren't being saved"
        :description="saveErrorDescription"
        :actions="[{ label: 'Retry save', icon: 'i-lucide-refresh-cw', color: 'error', variant: 'soft', onClick: retrySave }]"
      />

      <!-- Loading / error states -->
      <USkeleton v-if="editor.status.value === 'loading'" class="h-48 w-full shrink-0" />

      <UAlert
        v-else-if="editor.status.value === 'error'"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Couldn't load this project"
        :description="editor.error.value ?? 'Unknown error'"
      />

      <template v-else-if="editor.status.value === 'ready' && editor.timeline.value">
        <UAlert
          v-if="editor.missingClipIds.value.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          class="shrink-0"
          :title="`${editor.missingClipIds.value.length} ${editor.missingClipIds.value.length === 1 ? 'clip is' : 'clips are'} missing its source file`"
          description="Select a clip, then pick a replacement from the assets rail — or remove it."
        >
          <template #actions>
            <template v-for="clipId in editor.missingClipIds.value" :key="clipId">
              <UButton size="xs" variant="soft" color="warning" icon="i-lucide-mouse-pointer-click" :label="`Select ${missingClipLabel(clipId)}`" @click="selectMissingClip(clipId)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" label="Remove" @click="editor.deleteClipAction(clipId)" />
            </template>
          </template>
        </UAlert>

        <VideoStudioWorkbench
          v-if="isAv"
          v-model:mode="videoStudioMode"
          v-model:producer-collapsed="producerRailCollapsed"
          :asset-count="videoStudioAssetCount"
          :generation-job-count="activeGenerationJobCount"
          :render-job-count="editor.renderJobs.value.length"
          :generation-enabled="videoGenerationReady"
          :generation-status-label="videoGenerationStatusLabel"
          :generation-status-detail="videoGenerationStatusDetail"
          :rendering="editor.rendering.value"
          @add-footage="mediaPickerOpen = true"
          @add-overlay="overlayPickerOpen = true"
          @generate="generatePickerOpen = true"
          @open-library="libraryOpen = true"
          @render="onRenderVideo"
        >
          <template #library>
              <VideoStudioLibraryRail
                v-model:selected-id="selectedStudioAssetModel"
                :assets="studioAssets"
                :loading="studioLibraryLoading"
                @refresh="refreshStudioLibrary"
                @add-asset="onStudioAssetAdd"
                @generate-from-asset="onStudioAssetGenerate"
                @inspect-asset="onStudioAssetInspect"
                @publish-asset="onStudioAssetPublish"
              />
          </template>

          <template #preview>
              <div class="mb-2 flex items-center gap-2">
                <UIcon name="i-lucide-monitor-play" class="size-4 text-muted" />
                <h4 class="text-xs font-medium uppercase text-muted">Preview</h4>
                <span class="text-[11px] text-muted">Approximate — the server render is the source of truth.</span>
              </div>
              <MediaAvPreview
                :timeline="editor.timeline.value"
                :current-time="editor.currentTime.value"
                :is-playing="editor.isPlaying.value"
                :sources="editor.sources.value"
              />

              <div class="mt-3 space-y-3">
              <!-- Per-clip effects drawer — shows for any selected video clip -->
              <div v-if="isAv && selectedVideoClip" class="rounded-lg border border-default bg-elevated p-3">
                <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-xs font-medium uppercase text-muted">
                      Effects — {{ selectedVideoClip.label }} @ {{ Math.round(selectedVideoClip.startSec) }}s
                    </p>
                    <p class="mt-0.5 text-[11px] text-muted">
                      {{ selectedVideoClip.effects.length ? selectedVideoEffectLabels.join(', ') : 'No effects selected' }}
                    </p>
                  </div>
                  <UButton
                    v-if="selectedVideoClip.effects.length"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    label="Clear all"
                    @click="editor.setClipEffectsAction(selectedVideoClip.clipId, [])"
                  />
                </div>
                <div class="mb-3 flex flex-wrap gap-1.5">
                  <UBadge
                    :label="`${selectedVideoEffectPlan.approximated.length} previewed`"
                    size="xs"
                    variant="subtle"
                    color="primary"
                  />
                  <UBadge
                    v-if="selectedVideoEffectPlan.unpreviewable.length"
                    :label="`${selectedVideoEffectPlan.unpreviewable.length} render-only`"
                    size="xs"
                    variant="subtle"
                    color="warning"
                  />
                  <UBadge
                    v-if="selectedVideoEffectPlan.shake"
                    label="Motion preview"
                    size="xs"
                    variant="subtle"
                    color="neutral"
                  />
                </div>
                <div class="mb-4">
                  <div class="mb-2 flex items-center justify-between gap-3">
                    <p class="text-xs font-medium uppercase text-muted">Framing</p>
                    <p class="text-[11px] text-muted">
                      {{ CLIP_FIT_OPTIONS.find(option => option.id === selectedVideoClip.fit)?.hint }}
                    </p>
                  </div>
                  <div class="grid grid-cols-3 gap-2">
                    <button
                      v-for="option in CLIP_FIT_OPTIONS"
                      :key="option.id"
                      type="button"
                      role="switch"
                      :aria-checked="selectedVideoClip.fit === option.id"
                      class="flex min-h-16 items-center gap-2 rounded-lg border px-3 py-2 text-left transition"
                      :class="selectedVideoClip.fit === option.id
                        ? 'border-primary bg-primary/10 text-highlighted'
                        : 'border-default bg-default/30 text-default hover:border-primary/40 hover:bg-primary/5'"
                      :title="option.hint"
                      @click="editor.setClipFitAction(selectedVideoClip.clipId, option.id)"
                    >
                      <UIcon :name="option.icon" class="size-4 shrink-0" :class="selectedVideoClip.fit === option.id ? 'text-primary' : 'text-muted'" />
                      <span class="min-w-0">
                        <span class="block text-xs font-semibold leading-tight">{{ option.label }}</span>
                        <span class="block truncate text-[11px] text-muted">{{ option.id }}</span>
                      </span>
                    </button>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <button
                    v-for="preset in CLIP_EFFECT_PRESET_UI"
                    :key="preset.id"
                    type="button"
                    role="switch"
                    :aria-checked="selectedVideoClip.effects.includes(preset.id)"
                    class="flex min-h-24 flex-col items-start gap-2 rounded-lg border p-2.5 text-left transition"
                    :class="selectedVideoClip.effects.includes(preset.id)
                      ? 'border-primary bg-primary/10 text-highlighted'
                      : 'border-default bg-default/30 text-default hover:border-primary/40 hover:bg-primary/5'"
                    :title="preset.hint"
                    @click="toggleClipEffect(preset.id)"
                  >
                    <span class="flex w-full items-center gap-2">
                      <UIcon :name="preset.icon" class="size-4" :class="selectedVideoClip.effects.includes(preset.id) ? 'text-primary' : 'text-muted'" />
                      <UIcon
                        :name="selectedVideoClip.effects.includes(preset.id) ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
                        class="ml-auto size-3.5"
                        :class="selectedVideoClip.effects.includes(preset.id) ? 'text-primary' : 'text-muted'"
                      />
                    </span>
                    <span class="text-xs font-semibold leading-tight">{{ preset.label }}</span>
                    <span class="line-clamp-2 text-[11px] leading-snug text-muted">{{ preset.hint }}</span>
                  </button>
                </div>
                <p class="mt-3 text-[11px] text-muted">
                  Preview approximates {{ selectedVideoEffectPlan.approximated.length || 'no' }} selected effects; {{ selectedVideoEffectPlan.unpreviewable.length || 'no' }} selected effects are render-only.
                </p>
              </div>

              <div v-if="isAv && selectedGeneratedClip.kind === 'generated-video'" class="rounded-lg border border-default bg-elevated p-3">
                <div class="flex items-start gap-3">
                  <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="truncate text-sm font-medium text-highlighted">{{ selectedGeneratedClip.title }}</p>
                      <UBadge v-if="selectedGeneratedClip.format" :label="selectedGeneratedClip.format" size="xs" variant="subtle" color="neutral" />
                      <UBadge v-if="selectedGeneratedClip.durationSec" :label="`${selectedGeneratedClip.durationSec}s`" size="xs" variant="subtle" color="neutral" />
                    </div>
                    <p class="mt-1 text-xs text-muted">Model: {{ selectedGeneratedClip.modelLabel }}</p>
                    <p v-if="selectedGeneratedClip.prompt" class="mt-1 line-clamp-2 text-xs text-muted">{{ selectedGeneratedClip.prompt }}</p>
                    <p v-if="selectedGeneratedClip.sourceJobId" class="mt-1 text-[11px] text-muted">Job {{ selectedGeneratedClip.sourceJobId }}</p>
                  </div>
                  <div class="flex flex-wrap justify-end gap-2">
                    <UButton
                      v-if="selectedGeneratedClip.prompt"
                      icon="i-lucide-copy"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      label="Copy prompt"
                      @click="copySelectedPrompt"
                    />
                    <UButton
                      icon="i-lucide-copy-plus"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      label="Duplicate"
                      @click="duplicateSelectedGeneratedClip"
                    />
                    <UButton
                      icon="i-lucide-share-2"
                      size="xs"
                      variant="soft"
                      color="primary"
                      label="Publish"
                      @click="publishSelectedGeneratedClip"
                    />
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      variant="ghost"
                      color="error"
                      label="Remove"
                      @click="editor.deleteClipAction(selectedGeneratedClip.clipId)"
                    />
                  </div>
                </div>
              </div>

              
              </div>
          </template>

          <template #producer>
              <VideoStudioInspector
                v-model:tab="videoStudioInspectorTab"
                :asset-count="videoStudioAssetCount"
                :voice-asset-count="studioVoiceAssetCount"
                :overlay-asset-count="studioOverlayAssetCount"
                :render-job-count="editor.renderJobs.value.length"
                :model-ready="videoGenerationReady"
                :model-status-label="videoGenerationStatusLabel"
                :model-status-detail="videoGenerationStatusDetail"
              >
                <template #actions>
                  <UButton
                    icon="i-lucide-panel-right-close"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    aria-label="Collapse producer rail"
                    @click="producerRailCollapsed = true"
                  />
                </template>

                <template #details>
                  <VideoStudioSelectedAssetPanel
                    v-if="selectedStudioAsset"
                    :asset="selectedStudioAsset"
                    :activity="selectedStudioAssetActivity"
                    :caption-generating="captionGeneratingAssetId === selectedStudioAsset?.id"
                    :can-replace-selected-clip="canReplaceSelectedClipWithAsset"
                    @add-to-timeline="onStudioAssetAdd"
                    @replace-selected-clip="replaceSelectedClipWithAsset"
                    @add-captions-to-timeline="onStudioAssetAddCaptions"
                    @generate-from-asset="onStudioAssetGenerate"
                    @generate-captions="onGenerateCaptions"
                  />
                  <VideoStudioClipInspector
                    v-if="selectedClipInspector"
                    :class="selectedStudioAsset ? 'mt-3' : ''"
                    :clip="selectedClipInspector"
                    :can-split="selectedClipInspector.kind === 'audio'"
                    @split="splitSelectedClip"
                    @delete="deleteSelectedClip"
                    @set-caption-style="setSelectedCaptionStyle"
                    @set-timing="setSelectedTiming"
                  />
                  <VideoStudioSelectedAssetPanel
                    v-if="!selectedStudioAsset && !selectedClipInspector"
                    :asset="null"
                    :activity="selectedStudioAssetActivity"
                    :caption-generating="false"
                    :can-replace-selected-clip="false"
                    @add-to-timeline="onStudioAssetAdd"
                    @replace-selected-clip="replaceSelectedClipWithAsset"
                    @add-captions-to-timeline="onStudioAssetAddCaptions"
                    @generate-from-asset="onStudioAssetGenerate"
                    @generate-captions="onGenerateCaptions"
                  />
                </template>

                <template #produce>
                  <div v-if="videoGenerationEnabled" class="space-y-2">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-sparkles" class="size-4 text-muted" />
                      <h4 class="text-xs font-medium uppercase text-muted">AI generation</h4>
                      <UBadge v-if="activeGenerationJobCount" :label="`${activeGenerationJobCount} active`" size="xs" variant="subtle" color="primary" class="ml-auto" />
                    </div>
                    <MediaGenerateComposer
                    active
                    :project-id="projectId"
                    :timeline-stills="timelineStills"
                    :default-aspect="projectAspect"
                    :initial-prompt="generationDraftPrompt"
                    :initial-source-asset="selectedGenerationSourceAsset"
                    :recent-jobs="genJobs.jobs.value"
                    :prepare-timeline-still-source="editor.saveNow"
                    @submitted="onGenerationSubmitted"
                    @add-to-timeline="onLibraryAddToTimeline"
                    @close="generationDraftPrompt = null"
                />
                  </div>
                  <VideoStudioVoiceComposer
                    :producer-brief="producerBrief"
                    :existing-voiceover-count="existingVoiceoverClipIds.length"
                    @generated="onVoiceoverGenerated"
                    @add-to-timeline="onVoiceoverAddToTimeline"
                    @replace-with-generated="onVoiceoverReplaceTimeline"
                  />
                  <VideoStudioOverlayComposer
                    :projects="studioBannerProjects"
                    :loading="studioBannerPending"
                    :current-time-sec="editor.currentTime.value"
                    :selected-overlay-clip="selectedOverlayClip"
                    @refresh="refreshStudioBannerProjects"
                    @add-overlay="onOverlayPick"
                    @replace-overlay="onReplaceSelectedOverlay"
                  />
                  <div v-if="videoAssetHarnessEnabled" class="space-y-3">
                    <div class="mb-3 flex items-start gap-2">
                      <div class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <UIcon name="i-lucide-eraser" class="size-4 text-primary" />
                      </div>
                      <div class="min-w-0">
                        <h4 class="text-sm font-medium text-highlighted">Prepare / erase asset</h4>
                        <p class="mt-0.5 text-xs leading-snug text-muted">
                          Lift, erase, mask, remove backgrounds, or decompose selected project assets.
                        </p>
                      </div>
                    </div>
                    <MediaAssetHarness
                      :project-id="projectId"
                      studio
                      @add-to-timeline="onHarnessAddToTimeline"
                      @add-derivative-to-timeline="onHarnessAddDerivativeToTimeline"
                    />
                  </div>
                  <VideoStudioProducerRail
                    :project-id="projectId"
                    :selected-asset="selectedStudioAsset"
                    :asset-count="videoStudioAssetCount"
                    :voice-asset-count="studioVoiceAssetCount"
                    :overlay-asset-count="studioOverlayAssetCount"
                    :recent-generation-jobs="genJobs.jobs.value"
                    @add-to-timeline="onHarnessAddToTimeline"
                    @brief-change="producerBrief = $event"
                  />
                  <UButton icon="i-lucide-music" size="xs" variant="soft" color="neutral" label="Add audio clip" block @click="pickerOpen = true" />
                </template>

                <template #review>
                  <VideoStudioReviewStatusPanel
                    class="mb-3"
                    :render-job-count="editor.renderJobs.value.length"
                    :latest-render-status="latestRenderJobStatus"
                  />
                  <VideoStudioRenderJobsPanel
                    :project-id="projectId"
                    :jobs="editor.renderJobs.value"
                    :rendering="editor.rendering.value"
                    @render="onRenderVideo"
                    @retry="onRetryRender"
                    @publish="onPublishToSocial"
                    @send-to-portal="onSendToPortal"
                    @save-asset="onSaveAsset"
                  />
                </template>
              </VideoStudioInspector>
          </template>
        </VideoStudioWorkbench>

        <!-- Dock: transport + timeline, pinned to the bottom for AV projects. -->
        <!-- Audio projects have no workbench: the dock takes the whole height. -->
        <section
          :class="['relative flex flex-col gap-2', isAv ? 'shrink-0' : 'min-h-0 flex-1']"
          :style="isAv ? { height: `${dockHeight}px` } : undefined"
        >
          <!-- Drag handle: grows the dock upward. -->
          <div
            v-if="isAv"
            class="group absolute inset-x-0 -top-2 z-10 flex h-3 cursor-row-resize items-center justify-center touch-none"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize timeline"
            :aria-valuenow="dockHeight"
            :aria-valuemin="DOCK_MIN"
            :aria-valuemax="DOCK_MAX"
            @pointerdown="onDockDragStart"
            @pointermove="onDockDragMove"
            @pointerup="onDockDragEnd"
            @pointercancel="onDockDragEnd"
          >
            <span class="h-1 w-12 rounded-full bg-accented transition group-hover:bg-primary" />
          </div>
          <VideoStudioRenderStatusStrip
          v-if="isAv"
          :project-id="projectId"
          :jobs="editor.renderJobs.value"
          :rendering="editor.rendering.value"
          @retry="onRetryRender"
          @publish="onPublishToSocial"
          @send-to-portal="onSendToPortal"
          @save-asset="onSaveAsset"
        />

          <div class="flex shrink-0 items-center gap-3 rounded-lg border border-default bg-elevated px-3 py-2">
            <UButton
              :icon="editor.isPlaying.value ? 'i-lucide-pause' : 'i-lucide-play'"
              color="primary"
              size="sm"
              :aria-label="editor.isPlaying.value ? 'Pause (Space)' : 'Play (Space)'"
              :title="editor.isPlaying.value ? 'Pause (Space)' : 'Play (Space)'"
              @click="togglePlayback"
            />
            <UButton icon="i-lucide-skip-back" size="sm" variant="ghost" color="neutral" aria-label="Go to start (Home)" title="Go to start (Home)" @click="editor.seek(0)" />
            <span class="w-24 shrink-0 text-sm tabular-nums text-muted">
              {{ fmt(editor.currentTime.value) }} / {{ fmt(editor.duration.value) }}
            </span>
            <USlider
              class="flex-1"
              :min="0"
              :max="Math.max(editor.duration.value, 0.001)"
              :step="0.01"
              :model-value="editor.currentTime.value"
              aria-label="Playhead"
              @update:model-value="(v: number | number[]) => editor.seek(Array.isArray(v) ? v[0]! : v)"
            />
            <UPopover>
              <UButton icon="i-lucide-keyboard" size="sm" variant="ghost" color="neutral" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" />
              <template #content>
                <dl class="grid w-64 grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-3 text-xs">
                  <template v-for="shortcut in SHORTCUTS" :key="shortcut.keys">
                    <dt><UKbd size="sm">{{ shortcut.keys }}</UKbd></dt>
                    <dd class="text-muted">{{ shortcut.label }}</dd>
                  </template>
                </dl>
              </template>
            </UPopover>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <MediaTimeline
          :timeline="editor.timeline.value"
          :clips="editor.clips.value"
          :tracks="editor.tracks.value"
          :current-time="editor.currentTime.value"
          :duration="editor.duration.value"
          :sources="editor.sources.value"
          :titles="clipTitles"
          @select="(p) => selectTimelineClip(p.clipId)"
          @seek="(sec) => editor.seek(sec)"
          @move-clip="(p) => editor.moveClipAction(p.clipId, p.toTrackId, p.newStartSec)"
          @trim-clip="(p) => editor.trimClipAction(p.clipId, p.edge, p.newTimeSec)"
          @slice="(p) => editor.sliceAction(p.clipId, p.timeSec)"
          @delete-clip="(p) => { editor.deleteClipAction(p.clipId); if (selectedClipId === p.clipId) selectedClipId = null }"
          @add-to-track="onAddToTrack"
        />
          </div>
        </section>
      </template>
    </div>
  </div>

  <!-- Asset picker slideover -->
  <MediaAssetPicker
    v-model:open="pickerOpen"
    @pick="onPickerPick"
  />

  <!-- Footage / still uploader -->
  <MediaMediaPicker v-model:open="mediaPickerOpen" :uploader="editor.uploadMedia" @uploaded="onMediaUploaded" />

  <!-- Overlay picker -->
  <MediaOverlayPicker v-model:open="overlayPickerOpen" @pick="onOverlayPick" />

  <!-- AI video generation picker -->
  <MediaGeneratePicker
    v-if="videoGenerationEnabled"
    v-model:open="generatePickerOpen"
    :project-id="projectId"
    :timeline-stills="timelineStills"
    :default-aspect="projectAspect"
    :initial-prompt="generationDraftPrompt"
    :initial-source-asset="selectedGenerationSourceAsset"
    :recent-jobs="genJobs.jobs.value"
    :prepare-timeline-still-source="editor.saveNow"
    @submitted="onGenerationSubmitted"
    @add-to-timeline="onLibraryAddToTimeline"
  />

  <!-- AI video generation progress/status (queued/running/failed) -->
  <MediaGenerationStatus v-if="videoGenerationEnabled" :jobs="genJobs.jobs.value" />

  <MediaVideoLibrary v-model:open="libraryOpen" @publish="onLibraryPublish" @add-to-timeline="onLibraryAddToTimeline" @reuse-prompt="onReusePrompt" />

  <!-- Versions slideover -->
  <USlideover
    v-model:open="versionsOpen"
    title="Version history"
    description="Restore a previously-saved snapshot of this timeline."
  >
    <template #body>
      <div class="space-y-2">
        <div v-if="versionsLoading" class="space-y-2">
          <USkeleton v-for="n in 3" :key="n" class="h-14 w-full rounded-lg" />
        </div>

        <UAlert
          v-else-if="!versions.length"
          color="neutral"
          variant="subtle"
          icon="i-lucide-history"
          title="No saved versions"
          description="Use 'Save version' to checkpoint the current timeline."
        />

        <div
          v-for="version in versions"
          :key="version.id"
          class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-3"
        >
          <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <UIcon name="i-lucide-bookmark" class="size-4 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ version.label ?? `Version ${version.version}` }}
            </p>
            <p class="text-xs text-muted mt-0.5 flex items-center gap-1.5">
              <UBadge :label="`v${version.version}`" size="xs" variant="subtle" color="neutral" />
              <span>{{ fmtVersionDate(version.createdAt) }}</span>
            </p>
          </div>
          <UButton
            icon="i-lucide-rotate-ccw"
            size="xs"
            variant="soft"
            color="primary"
            label="Restore"
            :loading="restoringId === version.id"
            @click="restore(version)"
          />
        </div>
      </div>
    </template>
  </USlideover>

  <!-- Save version modal -->
  <UModal v-model:open="saveVersionOpen" title="Save version">
    <template #content>
      <div class="p-4 space-y-4">
        <UFormField label="Version label">
          <UInput
            v-model="versionLabel"
            placeholder="e.g. Before final mix"
            autofocus
            @keydown.enter="doSaveVersion"
          />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="saveVersionOpen = false"
          />
          <UButton
            color="primary"
            label="Save snapshot"
            :loading="savingVersion"
            @click="doSaveVersion"
          />
        </div>
      </div>
    </template>
  </UModal>

  <!-- Leave-page guard when a save is failing -->
  <UModal v-model:open="discardConfirmOpen" title="Leave without saving?">
    <template #content>
      <div class="space-y-4 p-4">
        <p class="text-sm text-muted">
          Your latest edits couldn't be saved to the server. If you leave now they'll be lost.
        </p>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Stay and retry" @click="answerDiscard(false)" />
          <UButton color="error" label="Leave and discard" @click="answerDiscard(true)" />
        </div>
      </div>
    </template>
  </UModal>
</template>
