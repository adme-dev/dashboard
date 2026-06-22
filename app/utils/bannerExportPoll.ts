export type ExportJob = { jobId: string, formatKey: string, status: string, url: string | null, fileSize: number | null, error: string | null }

export function summarizeExportJobs(jobs: ExportJob[]): { total: number, done: number, failed: number, progress: number, finished: boolean, urls: string[] } {
  const total = jobs.length
  const done = jobs.filter(j => j.status === 'done').length
  const failed = jobs.filter(j => j.status === 'failed').length
  const settled = done + failed
  return {
    total, done, failed,
    progress: total ? Math.round((settled / total) * 100) : 0,
    finished: total === 0 ? true : settled === total,
    urls: jobs.filter(j => j.status === 'done' && j.url).map(j => j.url as string),
  }
}
