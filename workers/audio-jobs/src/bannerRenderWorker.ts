// workers/audio-jobs/src/bannerRenderWorker.ts
export type BannerJob = {
  id: string, project_id: string, format_key: string, width: number, height: number,
  fps: number, crf: number, quality: number, source_r2_key: string, status: string, created_by: string,
}
export type BannerRenderDeps = {
  loadJob: (jobId: string) => Promise<BannerJob | null>
  markRendering: (jobId: string) => Promise<void>
  getSourceHtml: (key: string) => Promise<string>
  render: (html: string, params: { width: number, height: number, fps: number, crf: number, quality: number }) => Promise<Uint8Array>
  uploadMp4: (projectId: string, formatKey: string, bytes: Uint8Array) => Promise<{ r2Key: string, url: string, size: number }>
  insertExport: (args: { projectId: string, formatKey: string, r2Key: string, url: string, size: number, quality: number, userId: string }) => Promise<string>
  markDone: (jobId: string, out: { r2Key: string, url: string, size: number, exportId: string }) => Promise<void>
  markFailed: (jobId: string, error: string) => Promise<void>
}

export async function runBannerRenderJob(msg: { jobId: string }, deps: BannerRenderDeps): Promise<void> {
  const job = await deps.loadJob(msg.jobId)
  if (!job) return                 // nothing to render
  if (job.status === 'done') return // idempotent: already rendered
  await deps.markRendering(job.id)
  try {
    const html = await deps.getSourceHtml(job.source_r2_key)
    const bytes = await deps.render(html, { width: job.width, height: job.height, fps: job.fps, crf: job.crf, quality: job.quality })
    const { r2Key, url, size } = await deps.uploadMp4(job.project_id, job.format_key, bytes)
    const exportId = await deps.insertExport({ projectId: job.project_id, formatKey: job.format_key, r2Key, url, size, quality: job.quality, userId: job.created_by })
    await deps.markDone(job.id, { r2Key, url, size, exportId })
  } catch (e) {
    await deps.markFailed(job.id, e instanceof Error ? e.message : String(e))
    throw e // surface to the queue branch → msg.retry
  }
}
