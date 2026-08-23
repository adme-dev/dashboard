export type VideoStudioAssetType = 'bucket' | 'video' | 'audio' | 'overlay' | 'job' | 'derivative'
export type VideoStudioAssetSource = 'bucket' | 'library' | 'generation' | 'render' | 'audio' | 'banner' | 'derivative'
export type VideoStudioAssetStatus = 'ready' | 'done' | 'queued' | 'processing' | 'rendering' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'unknown'

interface BucketItemInput {
  id: string
  bucketId: string
  assetId?: string | null
  r2Key?: string | null
  title?: string | null
  role?: string | null
  status?: string | null
  directive?: Record<string, unknown> | null
}

interface VideoAssetInput {
  id: string
  title?: string | null
  sourceProjectId?: string | null
  sourceJobId?: string | null
  r2Key?: string | null
  format?: string | null
  durationSec?: number | null
  thumbnailUrl?: string | null
  captionVttKey?: string | null
  captionVttUrl?: string | null
  transcript?: string | null
  generationPrompt?: string | null
  generationModelId?: string | null
  createdAt?: string | null
}

interface AudioAssetInput {
  id: string
  title?: string | null
  kind: 'voiceover' | 'music' | string
  status?: string | null
  prompt?: string | null
  durationSec?: number | null
  r2KeyMaster?: string | null
  streamUrl?: string | null
  createdAt?: string | null
}

interface OverlayInput {
  id: string
  title?: string | null
  formatKey?: string | null
  status?: string | null
  createdAt?: string | null
}

interface GenerationJobInput {
  id: string
  status: string
  mode?: string | null
  modelId?: string | null
  prompt?: string | null
  outputAssetId?: string | null
  outputR2Key?: string | null
  createdAt?: string | null
}

interface DerivativeInput {
  id: string
  sourceAssetId: string
  kind: string
  r2Key?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
  durationSec?: number | null
}

export interface NormalizeVideoStudioAssetsInput {
  bucketItems?: BucketItemInput[]
  videoAssets?: VideoAssetInput[]
  audioAssets?: AudioAssetInput[]
  overlays?: OverlayInput[]
  generationJobs?: GenerationJobInput[]
  derivatives?: DerivativeInput[]
}

export interface VideoStudioAsset {
  id: string
  rawId: string
  libraryAssetId: string | null
  type: VideoStudioAssetType
  source: VideoStudioAssetSource
  title: string
  subtitle: string | null
  status: VideoStudioAssetStatus
  modelId: string | null
  bucketId: string | null
  role: string | null
  prompt: string | null
  r2Key: string | null
  previewUrl: string | null
  thumbnailUrl: string | null
  captionVttKey: string | null
  captionVttUrl: string | null
  transcript: string | null
  durationSec: number | null
  format: string | null
  timelineReady: boolean
  createdAt: string | null
}

export interface VideoStudioAssetFilters {
  search?: string
  type?: VideoStudioAssetType | 'all'
  status?: VideoStudioAssetStatus | 'all'
  model?: string | 'all'
  source?: VideoStudioAssetSource | 'all'
  bucketId?: string | 'all'
  captions?: 'all' | 'with' | 'without'
}

function normalizeStatus(status: string | null | undefined): VideoStudioAssetStatus {
  if (status === 'ready' || status === 'done' || status === 'queued' || status === 'processing' || status === 'rendering' || status === 'running' || status === 'succeeded' || status === 'failed' || status === 'blocked') {
    return status
  }
  return 'unknown'
}

function metadataTitle(metadata: Record<string, unknown> | null | undefined): string | null {
  const title = metadata?.title
  return typeof title === 'string' && title.trim() ? title.trim() : null
}

function directivePrompt(directive: Record<string, unknown> | null | undefined): string | null {
  const prompt = directive?.prompt
  return typeof prompt === 'string' && prompt.trim() ? prompt.trim() : null
}

function matchesText(asset: VideoStudioAsset, query: string) {
  const haystack = [
    asset.title,
    asset.subtitle,
    asset.role,
    asset.prompt,
    asset.r2Key,
    asset.modelId,
    asset.format,
    asset.captionVttKey,
    asset.transcript,
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(query)
}

function imageR2Key(r2Key: string | null): boolean {
  return Boolean(r2Key && /\.(png|jpe?g|webp)$/i.test(r2Key.split('?')[0] ?? ''))
}

function videoAssetSource(asset: VideoAssetInput): VideoStudioAssetSource {
  if (asset.sourceJobId && (asset.generationModelId || asset.generationPrompt)) return 'generation'
  if (asset.sourceProjectId && asset.sourceJobId) return 'render'
  return 'library'
}

const UUID_TITLE = /^Generated video [0-9a-f]{8}-[0-9a-f-]{27}$/i

/** Older generated assets were titled with the raw job UUID — show the prompt instead. */
export function displayVideoAssetTitle(asset: { title?: string | null; r2Key?: string | null; generationPrompt?: string | null }): string {
  const title = asset.title?.trim() ?? ''
  if (title && !UUID_TITLE.test(title)) return title
  const prompt = asset.generationPrompt?.replace(/\s+/g, ' ').trim() ?? ''
  if (prompt) {
    const clause = prompt.split(/(?<=[.!?])\s|,\s/)[0] ?? prompt
    return `AI · ${clause.length > 60 ? `${clause.slice(0, 57).trimEnd()}…` : clause}`
  }
  return title || asset.r2Key || 'Untitled video'
}

export function videoStudioAssetImageSource(asset: VideoStudioAsset | null | undefined): { assetId: string; title: string } | null {
  if (!asset?.libraryAssetId || !imageR2Key(asset.r2Key)) return null
  return { assetId: asset.libraryAssetId, title: asset.title }
}

export function normalizeVideoStudioAssets(input: NormalizeVideoStudioAssetsInput): VideoStudioAsset[] {
  const assets: VideoStudioAsset[] = []

  for (const item of input.bucketItems ?? []) {
    assets.push({
      id: `bucket:${item.id}`,
      rawId: item.id,
      libraryAssetId: item.assetId ?? null,
      type: 'bucket',
      source: 'bucket',
      title: item.title || item.r2Key || 'Untitled bucket asset',
      subtitle: item.role ?? null,
      status: normalizeStatus(item.status),
      modelId: null,
      bucketId: item.bucketId,
      role: item.role ?? null,
      prompt: directivePrompt(item.directive),
      r2Key: item.r2Key ?? null,
      previewUrl: null,
      thumbnailUrl: item.assetId ? `/api/agency/video/assets/${encodeURIComponent(item.assetId)}/thumbnail` : null,
      captionVttKey: null,
      captionVttUrl: null,
      transcript: null,
      durationSec: null,
      format: null,
      timelineReady: Boolean(item.assetId || item.r2Key),
      createdAt: null,
    })
  }

  for (const asset of input.videoAssets ?? []) {
    assets.push({
      id: `video:${asset.id}`,
      rawId: asset.id,
      libraryAssetId: asset.id,
      type: 'video',
      source: videoAssetSource(asset),
      title: displayVideoAssetTitle(asset),
      subtitle: asset.format ?? null,
      status: 'ready',
      modelId: asset.generationModelId ?? null,
      bucketId: null,
      role: null,
      prompt: asset.generationPrompt ?? null,
      r2Key: asset.r2Key ?? null,
      previewUrl: asset.r2Key ? `/api/agency/video/assets/${encodeURIComponent(asset.id)}/stream` : null,
      thumbnailUrl: asset.thumbnailUrl ?? null,
      captionVttKey: asset.captionVttKey ?? null,
      captionVttUrl: asset.captionVttUrl ?? (asset.captionVttKey ? `/api/agency/video/assets/${encodeURIComponent(asset.id)}/captions.vtt` : null),
      transcript: asset.transcript ?? null,
      durationSec: asset.durationSec ?? null,
      format: asset.format ?? null,
      timelineReady: Boolean(asset.r2Key),
      createdAt: asset.createdAt ?? null,
    })
  }

  for (const asset of input.audioAssets ?? []) {
    const isVoiceover = asset.kind === 'voiceover'
    const voiceoverTranscript = isVoiceover && asset.prompt?.trim() ? asset.prompt.trim() : null
    assets.push({
      id: `audio:${asset.id}`,
      rawId: asset.id,
      libraryAssetId: null,
      type: 'audio',
      source: 'audio',
      title: asset.title || `${asset.kind} audio`,
      subtitle: asset.kind,
      status: normalizeStatus(asset.status),
      modelId: null,
      bucketId: null,
      role: asset.kind,
      prompt: voiceoverTranscript,
      r2Key: asset.r2KeyMaster ?? null,
      previewUrl: asset.streamUrl ?? null,
      thumbnailUrl: null,
      captionVttKey: voiceoverTranscript ? `audio-script:${asset.id}` : null,
      captionVttUrl: voiceoverTranscript ? `/api/agency/audio/assets/${encodeURIComponent(asset.id)}/captions.vtt` : null,
      transcript: voiceoverTranscript,
      durationSec: asset.durationSec ?? null,
      format: null,
      timelineReady: Boolean(asset.r2KeyMaster && (asset.status === 'ready' || asset.status === 'done')),
      createdAt: asset.createdAt ?? null,
    })
  }

  for (const overlay of input.overlays ?? []) {
    assets.push({
      id: `overlay:${overlay.id}`,
      rawId: overlay.id,
      libraryAssetId: null,
      type: 'overlay',
      source: 'banner',
      title: overlay.title || 'Untitled overlay',
      subtitle: overlay.formatKey ?? null,
      status: normalizeStatus(overlay.status),
      modelId: null,
      bucketId: null,
      role: 'overlay',
      prompt: null,
      r2Key: null,
      previewUrl: null,
      thumbnailUrl: null,
      captionVttKey: null,
      captionVttUrl: null,
      transcript: null,
      durationSec: null,
      format: overlay.formatKey ?? null,
      timelineReady: Boolean(overlay.formatKey),
      createdAt: overlay.createdAt ?? null,
    })
  }

  for (const job of input.generationJobs ?? []) {
    assets.push({
      id: `job:${job.id}`,
      rawId: job.id,
      libraryAssetId: job.outputAssetId ?? null,
      type: 'job',
      source: 'generation',
      title: job.prompt || job.modelId || 'Generation job',
      subtitle: job.mode ?? null,
      status: normalizeStatus(job.status),
      modelId: job.modelId ?? null,
      bucketId: null,
      role: job.mode ?? null,
      prompt: job.prompt ?? null,
      r2Key: job.outputR2Key ?? null,
      previewUrl: job.outputAssetId ? `/api/agency/video/assets/${encodeURIComponent(job.outputAssetId)}/stream` : null,
      thumbnailUrl: job.outputAssetId ? `/api/agency/video/assets/${encodeURIComponent(job.outputAssetId)}/thumbnail` : null,
      captionVttKey: null,
      captionVttUrl: null,
      transcript: null,
      durationSec: null,
      format: null,
      timelineReady: Boolean(job.outputAssetId && job.outputR2Key),
      createdAt: job.createdAt ?? null,
    })
  }

  for (const derivative of input.derivatives ?? []) {
    assets.push({
      id: `derivative:${derivative.id}`,
      rawId: derivative.id,
      libraryAssetId: null,
      type: 'derivative',
      source: 'derivative',
      title: metadataTitle(derivative.metadata) || `${derivative.kind} derivative`,
      subtitle: derivative.kind,
      status: 'ready',
      modelId: null,
      bucketId: null,
      role: derivative.kind,
      prompt: null,
      r2Key: derivative.r2Key ?? null,
      previewUrl: derivative.r2Key ? `/api/agency/video/derivatives/${encodeURIComponent(derivative.id)}/stream` : null,
      thumbnailUrl: null,
      captionVttKey: null,
      captionVttUrl: null,
      transcript: null,
      durationSec: derivative.durationSec ?? null,
      format: null,
      timelineReady: Boolean(derivative.r2Key),
      createdAt: derivative.createdAt ?? null,
    })
  }

  return assets
}

export function filterVideoStudioAssets(assets: VideoStudioAsset[], filters: VideoStudioAssetFilters): VideoStudioAsset[] {
  const search = filters.search?.trim().toLowerCase()
  return assets.filter((asset) => {
    if (search && !matchesText(asset, search)) return false
    if (filters.type && filters.type !== 'all' && asset.type !== filters.type) return false
    if (filters.status && filters.status !== 'all' && asset.status !== filters.status) return false
    if (filters.model && filters.model !== 'all' && asset.modelId !== filters.model) return false
    if (filters.source && filters.source !== 'all' && asset.source !== filters.source) return false
    if (filters.bucketId && filters.bucketId !== 'all' && asset.bucketId !== filters.bucketId) return false
    if (filters.captions === 'with' && !asset.captionVttUrl) return false
    if (filters.captions === 'without' && asset.captionVttUrl) return false
    return true
  })
}
