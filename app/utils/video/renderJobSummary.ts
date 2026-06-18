import type { MediaRenderJob } from '~~/app/types'

export interface VideoRenderJobSummary {
  total: number
  active: number
  completed: number
  failed: number
  latest: MediaRenderJob | null
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
