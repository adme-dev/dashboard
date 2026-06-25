import { parseRenderFailure, renderVariantFormats } from '~~/app/utils/video/renderJobSummary'

export type CreativeJobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'blocked'
export type CreativeJobKind = 'render' | 'generation' | 'audio'
export type CreativeJobSource = 'media_render_jobs' | 'video_generation_jobs' | 'audio_assets'

export interface CreativeJobItem {
  id: string
  source: CreativeJobSource
  sourceId: string
  kind: CreativeJobKind
  status: CreativeJobStatus
  retryable: boolean
  label: string
  createdAt: string
  updatedAt: string | null
  error: string | null
  metadata: Record<string, unknown>
}

export interface CreativeJobCounts {
  total: number
  queued: number
  running: number
  ready: number
  failed: number
  blocked: number
  active: number
  completed: number
  attention: number
}

export interface CreativeJobSummary {
  items: CreativeJobItem[]
  counts: CreativeJobCounts
  latest: CreativeJobItem | null
}

export interface SummarizeCreativeJobsInput {
  renderJobs?: readonly Record<string, unknown>[]
  generationJobs?: readonly Record<string, unknown>[]
  audioAssets?: readonly Record<string, unknown>[]
}

export function summarizeCreativeJobs(input: SummarizeCreativeJobsInput): CreativeJobSummary {
  const items = [
    ...(input.renderJobs ?? []).map(mapRenderJob),
    ...(input.generationJobs ?? []).map(mapGenerationJob),
    ...(input.audioAssets ?? []).map(mapAudioAsset)
  ].sort(compareCreatedDesc)

  const counts: CreativeJobCounts = {
    total: items.length,
    queued: 0,
    running: 0,
    ready: 0,
    failed: 0,
    blocked: 0,
    active: 0,
    completed: 0,
    attention: 0
  }

  for (const item of items) {
    counts[item.status] += 1
    if (item.status === 'queued' || item.status === 'running') counts.active += 1
    if (item.status === 'ready') counts.completed += 1
    if (item.status === 'failed' || item.status === 'blocked') counts.attention += 1
  }

  return {
    items,
    counts,
    latest: items[0] ?? null
  }
}

function mapRenderJob(job: Record<string, unknown>): CreativeJobItem {
  const id = String(job.id)
  const formats = renderVariantFormats({ variants: normalizeRecord(job.variants) } as never)
  const failure = parseRenderFailure(typeof job.error === 'string' ? job.error : null)

  return {
    id: `render:${id}`,
    source: 'media_render_jobs',
    sourceId: id,
    kind: 'render',
    status: normalizeStatus(job.status),
    retryable: normalizeStatus(job.status) === 'failed' ? failure.retryable : false,
    label: formats.length ? `Render ${formats.join(', ')}` : `Render ${id}`,
    createdAt: normalizeDate(job.createdAt ?? job.created_at),
    updatedAt: normalizeNullableDate(job.updatedAt ?? job.updated_at),
    error: normalizeStatus(job.status) === 'failed' ? failure.details : null,
    metadata: {
      projectId: job.projectId ?? job.project_id ?? null,
      timelineId: job.timelineId ?? job.timeline_id ?? null,
      variants: normalizeRecord(job.variants)
    }
  }
}

function mapGenerationJob(job: Record<string, unknown>): CreativeJobItem {
  const id = String(job.id)
  const prompt = typeof job.prompt === 'string' && job.prompt.trim() ? job.prompt.trim() : ''

  return {
    id: `generation:${id}`,
    source: 'video_generation_jobs',
    sourceId: id,
    kind: 'generation',
    status: normalizeStatus(job.status),
    retryable: false,
    label: prompt || String(job.mode ?? 'Video generation'),
    createdAt: normalizeDate(job.createdAt ?? job.created_at),
    updatedAt: normalizeNullableDate(job.updatedAt ?? job.updated_at),
    error: typeof job.errorMessage === 'string'
      ? job.errorMessage
      : typeof job.error_message === 'string'
        ? job.error_message
        : null,
    metadata: {
      mode: job.mode ?? null,
      modelId: job.modelId ?? job.model_id ?? null,
      outputAssetId: job.outputAssetId ?? job.output_asset_id ?? null
    }
  }
}

function mapAudioAsset(asset: Record<string, unknown>): CreativeJobItem {
  const id = String(asset.id)
  const kind = asset.kind === 'music' || asset.kind === 'voiceover' ? asset.kind : null
  const title = typeof asset.title === 'string' && asset.title.trim() ? asset.title.trim() : ''

  return {
    id: `audio:${id}`,
    source: 'audio_assets',
    sourceId: id,
    kind: 'audio',
    status: normalizeStatus(asset.status),
    retryable: normalizeStatus(asset.status) === 'failed',
    label: title || (kind === 'music' ? 'Music asset' : kind === 'voiceover' ? 'Voiceover asset' : 'Audio asset'),
    createdAt: normalizeDate(asset.createdAt ?? asset.created_at),
    updatedAt: normalizeNullableDate(asset.updatedAt ?? asset.updated_at),
    error: typeof asset.error === 'string' && asset.error.trim() ? asset.error.trim() : null,
    metadata: {
      kind,
      prompt: asset.prompt ?? null
    }
  }
}

function normalizeStatus(value: unknown): CreativeJobStatus {
  switch (value) {
    case 'queued':
      return 'queued'
    case 'running':
    case 'processing':
    case 'rendering':
      return 'running'
    case 'ready':
    case 'done':
    case 'succeeded':
      return 'ready'
    case 'failed':
      return 'failed'
    case 'blocked':
      return 'blocked'
    default:
      return 'queued'
  }
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  return new Date(0).toISOString()
}

function normalizeNullableDate(value: unknown): string | null {
  if (value == null) return null
  return normalizeDate(value)
}

function compareCreatedDesc(a: CreativeJobItem, b: CreativeJobItem): number {
  const timeDelta = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  if (timeDelta !== 0) return timeDelta
  return a.id.localeCompare(b.id)
}
