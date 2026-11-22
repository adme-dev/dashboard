import { retryVideoRenderFormats, VIDEO_RENDER_FORMATS } from './renderFormats'
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

/** Later exports may use newer edits. Only compare the recorded outputs, never
 * imply the failed snapshot succeeded. Older jobs with unknown scope remain in history.
 */
export function renderFailureHistoryNote(job: MediaRenderJob, jobs: readonly MediaRenderJob[]): string | null {
  const ready = new Set(jobs.filter(other => other.projectId === job.projectId && other.status === 'done'
    && Date.parse(other.createdAt) > Date.parse(job.createdAt)).flatMap(renderVariantFormats))
  if (!VIDEO_RENDER_FORMATS.some(format => ready.has(format.id))) return null
  const required = retryVideoRenderFormats(job)
  if (!required) {
    const known = [...renderVariantFormats(job), ...(job.progress?.formatKey ? [job.progress.formatKey] : [])]
    if (known.some(format => !ready.has(format))) return null
    return 'A later export finished. The full output selection for this earlier attempt is unknown.'
  }
  return required.every(format => ready.has(format)) ? 'Later renders produced all of these outputs.' : null
}

export function renderVariantUrl(projectId: string, jobId: string, format: string): string {
  return `/api/agency/audio/projects/${encodeURIComponent(projectId)}/renders/${encodeURIComponent(jobId)}/${encodeURIComponent(format)}`
}

export function renderDownloadUrl(projectId: string, jobId: string, format: string): string {
  return `${renderVariantUrl(projectId, jobId, format)}?download=1`
}

export function renderFormatLabel(format: string): string {
  return VIDEO_RENDER_FORMATS.find(entry => entry.id === format)?.detail ?? format
}

export function creativeVersionLabelForRenderJob(job: MediaRenderJob): string {
  const formats = renderVariantFormats(job)
  const suffix = formats.length ? formats.join(', ') : job.status
  return `Version ${job.id} · ${suffix}`
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

const failureMessages: Record<string, string> = {
  invalid_composition: 'The artwork could not be rendered. Check the layers in your timeline.',
  unreachable_media: 'The renderer could not load a media file. Check that the source is available.',
  runtime_not_ready: 'The artwork did not finish loading in time.',
  seek_failed: 'The renderer could not move the animation to the requested frame.',
  browser_transient: 'The renderer stopped while drawing the artwork.',
  browser_crash: 'The renderer stopped while drawing the artwork.',
  ffmpeg_failed: 'The renderer could not encode the video.',
  container_timeout: 'The export took too long and stopped.'
}

export function renderFailureMessage(error: string | null): string {
  const { category } = parseRenderFailure(error)
  if (category && Object.hasOwn(failureMessages, category)) return failureMessages[category]!
  if (/exceeded.*deadline|timed out|timeout/i.test(error ?? '')) return failureMessages.container_timeout!
  if (/enqueue failed|queue.*(unavailable|binding)/i.test(error ?? '')) return 'The export could not start because the render queue was unavailable.'
  if (/overlay resolution failed/i.test(error ?? '')) return 'The renderer could not prepare the artwork. Check the overlay in your timeline.'
  if (/ffmpeg/i.test(error ?? '')) return failureMessages.ffmpeg_failed!
  return error ? 'The render service could not finish this export.' : 'This export stopped without recording a reason.'
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


/** Measured work within one format. Missing counters stay indeterminate. */
export function renderStageMeter(job: MediaRenderJob | null | undefined): { label: string; detail: string; value: number | null; max: number } | null {
  if (!job || job.status !== 'rendering' || !job.progress) return null
  const p = job.progress
  const stages = {
    rendering: { label: 'Preparing render', done: undefined, total: undefined, unit: 'frames' },
    capturing: { label: 'Preparing artwork', done: p.framesDone, total: p.framesTotal, unit: 'frames' },
    encoding: { label: 'Encoding video', done: p.encodedTimeMs, total: p.durationMs, unit: 'seconds' },
    uploading: { label: 'Saving video', done: p.bytesDone, total: p.bytesTotal, unit: 'MB' },
  }
  const stage = Object.hasOwn(stages, p.stage) ? stages[p.stage as keyof typeof stages] : undefined
  if (!stage) return null
  const { label, done, total, unit } = stage
  if (typeof done !== 'number' || !Number.isSafeInteger(done) || done < 0 || typeof total !== 'number' || !Number.isSafeInteger(total) || total <= 0)
    return { label, detail: '', value: null, max: 100 }
  const value = Math.min(done, total)
  const display = (v: number) => unit === 'frames' ? String(v) : (v / (unit === 'seconds' ? 1000 : 1048576)).toFixed(1)
  return { label, detail: `${display(value)} of ${display(total)} ${unit}`, value, max: total }
}
