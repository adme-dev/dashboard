import { afterEach, describe, it, expect, vi } from 'vitest'
import { BannerRenderBusyError, runBannerRenderJob, type BannerJob, type BannerRenderDeps } from '~~/workers/audio-jobs/src/bannerRenderWorker'
import { BANNER_RENDER_LEASE_MS } from '~~/server/utils/banner/renderDispatch'

const job = (over: Partial<BannerJob> = {}): BannerJob => ({
  id: 'j1', project_id: 'p1', format_key: 'a', width: 300, height: 250, fps: 30, crf: 23, quality: 1,
  source_r2_key: 'banner-render-jobs/j1/source.html', status: 'queued', created_by: 'u1', ...over
})
const output = { r2Key: 'attempt.mp4', url: '/download', size: 3 }
function deps(over: Partial<BannerRenderDeps> = {}): BannerRenderDeps {
  return {
    loadJob: vi.fn().mockResolvedValue(job()),
    markRendering: vi.fn().mockResolvedValue('token-1'),
    renewLease: vi.fn().mockResolvedValue(true),
    getSourceHtml: vi.fn().mockResolvedValue('<div>a</div>'),
    render: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    uploadMp4: vi.fn().mockResolvedValue(output),
    discardUpload: vi.fn().mockResolvedValue(undefined),
    markDone: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(undefined),
    ...over
  }
}
afterEach(() => vi.useRealTimers())

describe('leased banner render worker', () => {
  it('renders and atomically commits the export with its exact claim token', async () => {
    const d = deps()
    expect(await runBannerRenderJob({ jobId: 'j1' }, d)).toBe(true)
    expect(d.render).toHaveBeenCalledWith('<div>a</div>', { width: 300, height: 250, fps: 30, crf: 23, quality: 1 })
    expect(d.markDone).toHaveBeenCalledWith('j1', 'token-1', output)
    expect(d.markFailed).not.toHaveBeenCalled()
  })
  it('skips missing and completed jobs', async () => {
    const missing = deps({ loadJob: vi.fn().mockResolvedValue(null) })
    expect(await runBannerRenderJob({ jobId: 'j1' }, missing)).toBe(false)
    const done = deps({ loadJob: vi.fn().mockResolvedValue(job({ status: 'done' })) })
    expect(await runBannerRenderJob({ jobId: 'j1' }, done)).toBe(true)
    expect(done.render).not.toHaveBeenCalled()
  })
  it('retries busy deliveries after the lease window rather than acknowledging or exhausting retries early', async () => {
    const d = deps({ markRendering: vi.fn().mockResolvedValue(null) })
    await expect(runBannerRenderJob({ jobId: 'j1' }, d)).rejects.toBeInstanceOf(BannerRenderBusyError)
    expect(new BannerRenderBusyError().retryAfterSeconds * 1000).toBeGreaterThan(BANNER_RENDER_LEASE_MS)
    expect(d.getSourceHtml).not.toHaveBeenCalled()
    expect(d.markFailed).not.toHaveBeenCalled()
  })
  it('acknowledges completion racing the initial read', async () => {
    const d = deps({ loadJob: vi.fn().mockResolvedValueOnce(job()).mockResolvedValueOnce(job({ status: 'done' })), markRendering: vi.fn().mockResolvedValue(null) })
    expect(await runBannerRenderJob({ jobId: 'j1' }, d)).toBe(true)
  })
  it('recovers an orphaned rendering row after crash or failed failure-write on redelivery', async () => {
    let now = 0
    const d = deps({
      loadJob: vi.fn().mockResolvedValue(job({ status: 'rendering' })),
      markRendering: vi.fn(async () => now >= BANNER_RENDER_LEASE_MS ? 'replacement-token' : null)
    })
    await expect(runBannerRenderJob({ jobId: 'j1' }, d)).rejects.toBeInstanceOf(BannerRenderBusyError)
    now += BANNER_RENDER_LEASE_MS + 1
    expect(await runBannerRenderJob({ jobId: 'j1' }, d)).toBe(true)
    expect(d.markDone).toHaveBeenCalledWith('j1', 'replacement-token', output)
  })
  it('renews during a long render and stops its heartbeat after completion', async () => {
    vi.useFakeTimers()
    let resolve!: (bytes: Uint8Array) => void
    const d = deps({ render: vi.fn(() => new Promise<Uint8Array>((r) => {
      resolve = r
    })) })
    const running = runBannerRenderJob({ jobId: 'j1' }, d)
    await vi.advanceTimersByTimeAsync(65000)
    expect(d.renewLease).toHaveBeenCalledTimes(2)
    resolve(new Uint8Array([1]))
    await running
    const calls = vi.mocked(d.renewLease).mock.calls.length
    await vi.advanceTimersByTimeAsync(90000)
    expect(d.renewLease).toHaveBeenCalledTimes(calls)
  })
  it('stops renewal and fences failure after a heartbeat error', async () => {
    vi.useFakeTimers()
    let resolve!: (bytes: Uint8Array) => void
    const d = deps({ renewLease: vi.fn().mockRejectedValue(new Error('database unavailable')), render: vi.fn(() => new Promise<Uint8Array>((r) => {
      resolve = r
    })) })
    const running = runBannerRenderJob({ jobId: 'j1' }, d)
    await vi.advanceTimersByTimeAsync(95000)
    expect(d.renewLease).toHaveBeenCalledOnce()
    resolve(new Uint8Array([1]))
    await expect(running).rejects.toThrow('lease lost')
    expect(d.uploadMp4).not.toHaveBeenCalled()
    expect(d.markFailed).toHaveBeenCalledWith('j1', 'token-1', expect.stringContaining('lease lost'))
    await vi.advanceTimersByTimeAsync(60000)
    expect(d.renewLease).toHaveBeenCalledOnce()
  })
  it('does not upload after losing its lease', async () => {
    const d = deps({ renewLease: vi.fn().mockResolvedValue(false) })
    await expect(runBannerRenderJob({ jobId: 'j1' }, d)).rejects.toThrow('lease lost')
    expect(d.uploadMp4).not.toHaveBeenCalled()
    expect(d.markFailed).toHaveBeenCalledWith('j1', 'token-1', expect.stringContaining('lease lost'))
  })
  it('rejects a stale completion and deletes only that attempt upload', async () => {
    let owner = 'old-token'
    let status = 'rendering'
    let finishOldUpload!: (value: typeof output) => void
    let uploadStarted!: () => void
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve
    })
    const published: string[] = []
    const base = {
      renewLease: vi.fn(async (_id: string, token: string) => owner === token),
      markDone: vi.fn(async (_id: string, token: string, result: typeof output) => {
        if (owner !== token) return false
        status = 'done'
        published.push(result.r2Key)
        return true
      }),
      markFailed: vi.fn(async (_id: string, token: string) => {
        if (owner === token) status = 'failed'
      })
    }
    const old = deps({ ...base, markRendering: vi.fn().mockResolvedValue('old-token'), uploadMp4: vi.fn(() => {
      uploadStarted()
      return new Promise<typeof output>((resolve) => {
        finishOldUpload = resolve
      })
    }) })
    const pending = runBannerRenderJob({ jobId: 'j1' }, old)
    await started
    owner = 'new-token' // The previous lease expired and a redelivery claimed it.
    const next = deps({ ...base, markRendering: vi.fn().mockResolvedValue('new-token'), uploadMp4: vi.fn().mockResolvedValue({ ...output, r2Key: 'new-attempt.mp4' }) })
    await runBannerRenderJob({ jobId: 'j1' }, next)
    finishOldUpload({ ...output, r2Key: 'old-attempt.mp4' })
    await expect(pending).rejects.toThrow('lease lost')
    expect(status).toBe('done')
    expect(published).toEqual(['new-attempt.mp4'])
    expect(old.discardUpload).toHaveBeenCalledExactlyOnceWith('old-attempt.mp4')
  })
  it('retains an upload when completion response is lost, since the commit may have succeeded', async () => {
    const d = deps({ markDone: vi.fn().mockRejectedValue(new Error('connection lost')) })
    await expect(runBannerRenderJob({ jobId: 'j1' }, d)).rejects.toThrow('connection lost')
    expect(d.discardUpload).not.toHaveBeenCalled()
    expect(d.markFailed).toHaveBeenCalledWith('j1', 'token-1', 'connection lost')
  })
  it('fences and classifies rendering failures', async () => {
    const d = deps({ render: vi.fn().mockRejectedValue(new Error('runtime_not_ready after 2500ms')) })
    await expect(runBannerRenderJob({ jobId: 'j1' }, d)).rejects.toThrow('runtime_not_ready')
    expect(d.markFailed).toHaveBeenCalledWith('j1', 'token-1', expect.stringContaining('runtime_not_ready:'))
    expect(d.markDone).not.toHaveBeenCalled()
  })
})
