export type ExportJob = {
  canRetry?: boolean
  jobId: string
  formatKey: string
  width?: number | null
  height?: number | null
  status: string
  url: string | null
  fileSize: number | null
  error: string | null
  createdAt?: string | null
  startedAt?: string | null
  updatedAt?: string | null
}

export function exportElapsed(since: string | null | undefined, now = Date.now()): string | null {
  if (!since) return null
  const elapsed = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  if (!Number.isFinite(elapsed)) return null
  if (elapsed < 60) return `${elapsed}s`
  const minutes = Math.floor(elapsed / 60)
  return minutes < 60 ? `${minutes}m ${String(elapsed % 60).padStart(2, '0')}s` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function exportJobTiming(job: ExportJob, now = Date.now()): string {
  if (job.status === 'queued') return `Waiting ${exportElapsed(job.createdAt, now) ?? 'for a render slot'}`
  if (job.status !== 'rendering') return ''
  const elapsed = exportElapsed(job.startedAt ?? job.createdAt, now)
  const activityMs = job.updatedAt ? now - Date.parse(job.updatedAt) : NaN
  const activity = Number.isFinite(activityMs)
    ? activityMs < 90_000 ? 'Active now' : `No update for ${exportElapsed(job.updatedAt, now)}`
    : 'Rendering'
  return elapsed ? `${activity} · ${elapsed} elapsed` : activity
}

export function summarizeExportJobs(jobs: ExportJob[]) {
  const total = jobs.length
  const done = jobs.filter(j => j.status === 'done').length
  const failed = jobs.filter(j => j.status === 'failed').length
  const pending = total - done - failed
  return {
    total, done, failed, pending,
    queued: jobs.filter(j => j.status === 'queued').length,
    rendering: jobs.filter(j => j.status === 'rendering').length,
    finished: pending === 0,
    urls: jobs.filter(j => j.status === 'done' && j.url).map(j => j.url as string)
  }
}

export function exportFormatLabel(formatKey: string, fallback = formatKey): string {
  const social: Record<string, string> = {
    fb_sq: 'Square feed', ig_sq: 'Square feed', ig_port: 'Portrait feed',
    fb_story: 'Story / Reel', ig_story: 'Story / Reel', fb_feed: 'Landscape feed', ig_land: 'Landscape feed'
  }
  return social[formatKey] || fallback
}

/** Watches durable jobs. A failed read never changes their state or queues work. */
export function createExportJobPoller(options: {
  fetchJobs: () => Promise<ExportJob[]>
  onJobs: (jobs: ExportJob[]) => void
  onError: (error: unknown) => void
  onLoading?: (loading: boolean) => void
  intervalMs?: number
}) {
  let version = 0
  let active = false
  let timer: ReturnType<typeof setTimeout> | undefined
  async function refresh() {
    if (!active) return
    clearTimeout(timer)
    const request = ++version
    options.onLoading?.(true)
    let retry = true
    try {
      const jobs = await options.fetchJobs()
      if (!active || request !== version) return
      options.onJobs(jobs)
      retry = !summarizeExportJobs(jobs).finished
    } catch (error) {
      if (!active || request !== version) return
      options.onError(error)
    } finally {
      if (active && request === version) {
        options.onLoading?.(false)
        if (retry) timer = setTimeout(refresh, options.intervalMs ?? 3000)
      }
    }
  }
  return {
    start() {
      active = true
      return refresh()
    },
    refresh,
    stop() {
      active = false
      version++
      clearTimeout(timer)
      options.onLoading?.(false)
    }
  }
}
