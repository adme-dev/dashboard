import type { MediaRenderJob } from '~~/app/types'

export interface VideoRenderJobSummary {
  total: number
  active: number
  completed: number
  failed: number
  latest: MediaRenderJob | null
}

export interface RenderFailureSummary {
  category: string | null
  label: string
  details: string
  retryable: boolean
}

export function summarizeVideoRenderJobs(jobs: readonly MediaRenderJob[]): VideoRenderJobSummary {
  let active = 0
  let completed = 0
  let failed = 0
  let latest: MediaRenderJob | null = null

  for (const job of jobs) {
    if (job.status === 'queued' || job.status === 'rendering') active += 1
    else if (job.status === 'done') completed += 1
    else if (job.status === 'failed') failed += 1

    if (!latest || Date.parse(job.createdAt) > Date.parse(latest.createdAt)) latest = job
  }

  return { total: jobs.length, active, completed, failed, latest }
}

export function renderVariantFormats(job: MediaRenderJob | null | undefined): string[] {
  return Object.keys(job?.variants ?? {})
}

export function renderVariantUrl(projectId: string, jobId: string, format: string): string {
  return `/api/agency/audio/projects/${encodeURIComponent(projectId)}/renders/${encodeURIComponent(jobId)}/${encodeURIComponent(format)}`
}

export function parseRenderFailure(error: string | null | undefined): RenderFailureSummary {
  const details = (error ?? '').trim()
  const match = details.match(/^([a-z_]+):\s*(.*)$/)
  const category = match ? match[1] : null
  const body = match ? match[2] : details
  const label = category ? failureLabels[category] ?? humanizeCategory(category) : 'Render failed'
  return {
    category,
    label,
    details: body || details,
    retryable: category ? retryableCategories.has(category) : true
  }
}

const failureLabels: Record<string, string> = {
  invalid_composition: 'Invalid composition',
  unreachable_media: 'Media unreachable',
  runtime_not_ready: 'Render runtime not ready',
  seek_failed: 'Animation seek failed',
  browser_transient: 'Browser render failed',
  browser_crash: 'Browser crashed',
  ffmpeg_failed: 'Video encoding failed',
  container_timeout: 'Render timed out'
}

const retryableCategories = new Set(['unreachable_media', 'runtime_not_ready', 'browser_transient', 'browser_crash', 'ffmpeg_failed', 'container_timeout'])

function humanizeCategory(category: string): string {
  return category
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
