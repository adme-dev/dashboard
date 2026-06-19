<script setup lang="ts">
// SP2c full multitrack editor. Extends the SP2b read-only preview by wiring every
// MediaTimeline emit to the composable actions, adding an edit toolbar (undo/redo,
// split, add-clip, save-version), and passing the reactive sources map for waveforms.
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
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

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()
const projectId = computed(() => String(route.params.id))
const editor = useMediaProjectEditor(projectId.value)
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

function onOverlayPick(p: { gsapProjectId: string; gsapFormatKey: string }) {
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
    if (assetId) {
      selectedClipId.value = null
      videoStudioMode.value = 'edit'
    }
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

const {
  data: studioAudioData,
  pending: studioAudioPending,
  refresh: refreshStudioAudioAssets,
} = useFetch<{ assets: AudioAsset[] }>('/api/agency/audio/assets', {
  query: { limit: 100 },
  lazy: true,
  immediate: false,
})
const {
  data: studioBannerData,
  pending: studioBannerPending,
  refresh: refreshStudioBannerProjects,
} = useFetch<StudioBannerProject[]>('/api/agency/banner-studio/projects', {
  query: { limit: 100 },
  lazy: true,
  immediate: false,
})

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
    await $fetch(`/api/agency/video/assets/${encodeURIComponent(asset.libraryAssetId)}/captions`, { method: 'POST' })
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

function restore(version: VersionRow) {
  restoringId.value = version.id
  try {
    editor.restoreVersion(version.state)
    toast.add({ title: `Restored ${version.label ?? `v${version.version}`}`, color: 'success' })
    versionsOpen.value = false
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

function onKeyDown(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return
  const isMeta = event.metaKey || event.ctrlKey
  if (isMeta && event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
    event.preventDefault()
    editor.redoAction()
  } else if (isMeta && (event.key === 'z' || event.key === 'Z')) {
    event.preventDefault()
    editor.undoAction()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  if (videoGenerationEnabled.value) void genJobs.start()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  genJobs.stop()
})

// ─── Save status label ────────────────────────────────────────────────────────

const saveStatusLabel = computed(() => {
  switch (editor.saveStatus.value) {
    case 'saving': return 'Saving…'
    case 'saved': return 'Saved'
    case 'error': return 'Save failed'
    default: return null
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

const pageTitle = computed(() => isAv.value ? 'Video Studio' : 'Timeline editor')
const pageDescription = computed(() => isAv.value
  ? 'Create and render social video from footage, stills, overlays, voiceover and music.'
  : 'Multitrack editor — drag, trim, slice, and layer your clips.'
)
const backTo = computed(() => isAv.value ? '/agency/audio/projects?mediaType=av' : '/agency/audio/projects')
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <div
      class="mx-auto w-full space-y-4 p-6"
      :class="isAv ? 'max-w-none' : 'max-w-5xl'"
    >

      <!-- Header -->
      <header class="flex items-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          :to="backTo"
          aria-label="Back to projects"
        />
        <div class="space-y-0.5 flex-1">
          <h1 class="text-2xl font-semibold tracking-tight">{{ pageTitle }}</h1>
          <p class="text-sm text-muted">{{ pageDescription }}</p>
        </div>
        <!-- Save status pill -->
        <span
          v-if="saveStatusLabel"
          class="text-xs font-medium tabular-nums"
          :class="saveStatusColor"
        >{{ saveStatusLabel }}</span>
      </header>

      <!-- Edit toolbar -->
      <div
        v-if="editor.status.value === 'ready'"
        class="flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-2"
      >
        <!-- Undo / Redo -->
        <UButton
          icon="i-lucide-undo-2"
          size="sm"
          variant="ghost"
          color="neutral"
          label="Undo"
          :disabled="!editor.canUndo.value"
          aria-label="Undo (⌘Z)"
          @click="editor.undoAction()"
        />
        <UButton
          icon="i-lucide-redo-2"
          size="sm"
          variant="ghost"
          color="neutral"
          label="Redo"
          :disabled="!editor.canRedo.value"
          aria-label="Redo (⌘⇧Z)"
          @click="editor.redoAction()"
        />

        <div class="h-5 w-px bg-default mx-1" />

        <!-- Add clips in audio mode. AV project creation actions live inside Video Studio. -->
        <UButton
          v-if="!isAv"
          icon="i-lucide-plus-circle" size="sm" variant="soft" color="primary" label="Add clip"
          @click="pickerOpen = true"
        />

        <!-- Save version -->
        <UButton
          icon="i-lucide-bookmark"
          size="sm"
          variant="ghost"
          color="neutral"
          label="Save version"
          @click="saveVersionOpen = true"
        />

        <!-- Versions history -->
        <UButton
          icon="i-lucide-history"
          size="sm"
          variant="ghost"
          color="neutral"
          label="Versions"
          @click="openVersions"
        />
      </div>

      <!-- Loading / error states -->
      <USkeleton v-if="editor.status.value === 'loading'" class="h-48 w-full" />

      <UAlert
        v-else-if="editor.status.value === 'error'"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Couldn't load this project"
        :description="editor.error.value ?? 'Unknown error'"
      />

      <template v-else-if="editor.status.value === 'ready' && editor.timeline.value">
        <!-- Missing-source warning — non-fatal. The project still loads so the user
             can remove or replace clips whose audio files are gone (deleted/404). -->
        <UAlert
          v-if="editor.missingClipIds.value.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`${editor.missingClipIds.value.length} ${editor.missingClipIds.value.length === 1 ? 'clip is' : 'clips are'} missing audio`"
          description="Their source files couldn't be loaded — they may have been deleted. These clips appear on the timeline but produce no sound. Remove or replace them, then save."
        />

        <VideoStudioWorkbench
          v-if="isAv"
          v-model:mode="videoStudioMode"
          v-model:producer-collapsed="producerRailCollapsed"
          :current-time-sec="editor.currentTime.value"
          :duration-sec="editor.duration.value"
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
              <VideoStudioClipInspector
                v-if="selectedClipInspector"
                :clip="selectedClipInspector"
                :can-split="selectedClipInspector.kind === 'audio'"
                @split="splitSelectedClip"
                @delete="deleteSelectedClip"
                @set-caption-style="setSelectedCaptionStyle"
              />
              <VideoStudioSelectedAssetPanel
                v-else
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
              <div v-if="videoGenerationEnabled" class="mt-3 rounded-md border border-default bg-elevated p-3">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-2">
                    <UIcon name="i-lucide-sparkles" class="size-4 text-muted" />
                    <div class="min-w-0">
                      <h4 class="text-xs font-medium uppercase text-muted">AI generation</h4>
                      <p class="truncate text-[11px] text-muted">Cloudflare AI Gateway models only.</p>
                    </div>
                  </div>
                  <UBadge
                    v-if="activeGenerationJobCount"
                    :label="`${activeGenerationJobCount} active`"
                    size="xs"
                    variant="subtle"
                    color="primary"
                  />
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
              <div class="mt-3 mb-2 flex items-center gap-2">
                <UIcon name="i-lucide-monitor-play" class="size-4 text-muted" />
                <div class="min-w-0">
                  <h4 class="text-xs font-medium uppercase text-muted">Assembly preview</h4>
                  <p class="text-[11px] text-muted">Server render remains the source of truth.</p>
                </div>
              </div>
              <MediaAvPreview
                :timeline="editor.timeline.value"
                :current-time="editor.currentTime.value"
                :is-playing="editor.isPlaying.value"
                :sources="editor.sources.value"
              />
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
                <template #details>
                  <VideoStudioClipInspector
                    v-if="selectedClipInspector"
                    :clip="selectedClipInspector"
                    :can-split="selectedClipInspector.kind === 'audio'"
                    @split="splitSelectedClip"
                    @delete="deleteSelectedClip"
                    @set-caption-style="setSelectedCaptionStyle"
                  />
                  <VideoStudioSelectedAssetPanel
                    v-else
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
                </template>

                <template #produce>
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
                  <div class="grid grid-cols-2 gap-2">
                    <UButton icon="i-lucide-music" size="xs" variant="ghost" color="neutral" label="Audio" @click="pickerOpen = true" />
                    <UButton icon="i-lucide-clapperboard" size="xs" variant="ghost" color="primary" label="Render" :loading="editor.rendering.value" @click="onRenderVideo" />
                  </div>
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

        <!-- Timeline with full SP2c interaction layer -->
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

        <MediaTimeline
          :timeline="editor.timeline.value"
          :clips="editor.clips.value"
          :tracks="editor.tracks.value"
          :current-time="editor.currentTime.value"
          :duration="editor.duration.value"
          :sources="editor.sources.value"
          @select="(p) => selectTimelineClip(p.clipId)"
          @seek="(sec) => editor.seek(sec)"
          @move-clip="(p) => editor.moveClipAction(p.clipId, p.toTrackId, p.newStartSec)"
          @trim-clip="(p) => editor.trimClipAction(p.clipId, p.edge, p.newTimeSec)"
          @slice="(p) => editor.sliceAction(p.clipId, p.timeSec)"
          @delete-clip="(p) => { editor.deleteClipAction(p.clipId); if (selectedClipId === p.clipId) selectedClipId = null }"
        />

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

        <!-- Transport bar -->
        <div class="flex items-center gap-4 rounded-lg border border-default bg-elevated p-3">
          <UButton
            :icon="editor.isPlaying.value ? 'i-lucide-pause' : 'i-lucide-play'"
            color="primary"
            :aria-label="editor.isPlaying.value ? 'Pause' : 'Play'"
            @click="editor.isPlaying.value ? editor.pause() : editor.play()"
          />
          <span class="w-20 shrink-0 tabular-nums text-sm text-muted">
            {{ fmt(editor.currentTime.value) }} / {{ fmt(editor.duration.value) }}
          </span>
          <USlider
            class="flex-1"
            :min="0"
            :max="Math.max(editor.duration.value, 0.001)"
            :step="0.01"
            :model-value="editor.currentTime.value"
            @update:model-value="(v: number | number[]) => editor.seek(Array.isArray(v) ? v[0]! : v)"
          />
        </div>
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
</template>
