// workers/audio-jobs/src/bannerRenderWorker.ts
import { classifyBannerRenderError } from '../../../server/utils/banner/renderDiagnostics'
import { BANNER_RENDER_HEARTBEAT_MS, BANNER_RENDER_LEASE_MS } from '../../../server/utils/banner/renderDispatch'

export type BannerJob = {
  id: string
  project_id: string
  format_key: string
  width: number
  height: number
  fps: number
  crf: number
  quality: number
  source_r2_key: string
  status: string
  created_by: string
}
export type BannerRenderDeps = {
  loadJob: (jobId: string) => Promise<BannerJob | null>
  markRendering: (jobId: string) => Promise<string | null>
  renewLease: (jobId: string, token: string) => Promise<boolean>
  getSourceHtml: (key: string) => Promise<string>
  render: (html: string, params: { width: number, height: number, fps: number, crf: number, quality: number }) => Promise<Uint8Array>
  uploadMp4: (projectId: string, formatKey: string, bytes: Uint8Array) => Promise<{ r2Key: string, url: string, size: number }>
  discardUpload: (r2Key: string) => Promise<void>
  markDone: (jobId: string, token: string, out: { r2Key: string, url: string, size: number }) => Promise<boolean>
  markFailed: (jobId: string, token: string, error: string) => Promise<void>
  markDeferred: (jobId: string, token: string) => Promise<void>
}

export class BannerRenderBusyError extends Error {
  readonly retryAfterSeconds = Math.ceil(BANNER_RENDER_LEASE_MS / 1000) + 5

  constructor() {
    super('Banner render lease is owned by another worker; retry this delivery')
  }
}

export class BannerRenderCapacityError extends Error {
  readonly retryAfterSeconds = 90

  constructor() {
    super('Banner render container capacity is full; retry after idle containers stop')
  }
}

export async function runBannerRenderJob(msg: { jobId: string }, deps: BannerRenderDeps): Promise<boolean> {
  const job = await deps.loadJob(msg.jobId)
  if (!job) return false
  if (job.status === 'done') return true
  const token = await deps.markRendering(job.id)
  if (!token) {
    // A completion can race the first read. Only settled/missing work is ACKable.
    const current = await deps.loadJob(job.id)
    if (!current) return false
    if (current.status === 'done') return true
    throw new BannerRenderBusyError()
  }
  let stopped = false
  let leaseLost = false
  let timer: ReturnType<typeof setTimeout> | undefined
  async function heartbeat() {
    try {
      if (!await deps.renewLease(job.id, token!)) leaseLost = true
    } catch {
      // Do not publish after an uncertain lease renewal. A later delivery can recover.
      leaseLost = true
    }
    if (!stopped && !leaseLost) timer = setTimeout(heartbeat, BANNER_RENDER_HEARTBEAT_MS)
  }
  async function requireLease() {
    if (leaseLost || !await deps.renewLease(job.id, token!)) throw new Error('Banner render lease lost; discard this attempt')
  }
  timer = setTimeout(heartbeat, BANNER_RENDER_HEARTBEAT_MS)
  try {
    const html = await deps.getSourceHtml(job.source_r2_key)
    const bytes = await deps.render(html, { width: job.width, height: job.height, fps: job.fps, crf: job.crf, quality: job.quality })
    await requireLease()
    // Each attempt uploads to a unique key, so an expired worker cannot overwrite a winner.
    const output = await deps.uploadMp4(job.project_id, job.format_key, bytes)
    if (!await deps.markDone(job.id, token, output)) {
      await deps.discardUpload(output.r2Key).catch(() => {})
      throw new Error('Banner render lease lost before completion')
    }
    return true
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('Maximum number of running container instances exceeded')) {
      await deps.markDeferred(job.id, token)
      throw new BannerRenderCapacityError()
    }
    const category = classifyBannerRenderError(message)
    await deps.markFailed(job.id, token, category === 'unknown' ? message : `${category}: ${message}`)
    // A render that exhausted the container's ten-minute request budget will
    // repeat the same expensive capture on every queue redelivery. Keep the
    // failed job available for an intentional retry with different settings.
    if (category === 'container_timeout') return false
    throw e
  } finally {
    stopped = true
    clearTimeout(timer)
  }
}
