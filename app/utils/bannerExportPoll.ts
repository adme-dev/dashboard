export type ExportJob = { canRetry?: boolean, jobId: string, formatKey: string, status: string, url: string | null, fileSize: number | null, error: string | null }

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
