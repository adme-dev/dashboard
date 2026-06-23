// test/banner/bannerRenderWorker.test.ts
import { describe, it, expect, vi } from 'vitest'
import { runBannerRenderJob, type BannerJob, type BannerRenderDeps } from '~~/workers/audio-jobs/src/bannerRenderWorker'

const job = (over: Partial<BannerJob> = {}): BannerJob => ({
  id: 'j1', project_id: 'p1', format_key: 'a', width: 300, height: 250, fps: 30, crf: 23, quality: 1,
  source_r2_key: 'banner-render-jobs/j1/source.html', status: 'queued', created_by: 'u1', ...over,
})
function deps(over: Partial<BannerRenderDeps> = {}): BannerRenderDeps {
  return {
    loadJob: vi.fn().mockResolvedValue(job()),
    markRendering: vi.fn().mockResolvedValue(undefined),
    getSourceHtml: vi.fn().mockResolvedValue('<div>a</div>'),
    render: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    uploadMp4: vi.fn().mockResolvedValue({ r2Key: 'banner-videos/p1/a.mp4', url: 'https://x/a.mp4', size: 3 }),
    insertExport: vi.fn().mockResolvedValue('exp1'),
    markDone: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('runBannerRenderJob', () => {
  it('renders, uploads, records the export, and marks done', async () => {
    const d = deps()
    await runBannerRenderJob({ jobId: 'j1' }, d)
    expect(d.markRendering).toHaveBeenCalledWith('j1')
    expect(d.render).toHaveBeenCalledWith('<div>a</div>', { width: 300, height: 250, fps: 30, crf: 23, quality: 1 })
    expect(d.insertExport).toHaveBeenCalledWith({ projectId: 'p1', formatKey: 'a', r2Key: 'banner-videos/p1/a.mp4', url: 'https://x/a.mp4', size: 3, quality: 1, userId: 'u1' })
    expect(d.markDone).toHaveBeenCalledWith('j1', { r2Key: 'banner-videos/p1/a.mp4', url: 'https://x/a.mp4', size: 3, exportId: 'exp1' })
    expect(d.markFailed).not.toHaveBeenCalled()
  })

  it('skips a missing job and an already-done job (idempotent)', async () => {
    const d1 = deps({ loadJob: vi.fn().mockResolvedValue(null) })
    await runBannerRenderJob({ jobId: 'x' }, d1)
    expect(d1.markRendering).not.toHaveBeenCalled()
    const d2 = deps({ loadJob: vi.fn().mockResolvedValue(job({ status: 'done' })) })
    await runBannerRenderJob({ jobId: 'j1' }, d2)
    expect(d2.render).not.toHaveBeenCalled()
    expect(d2.markRendering).not.toHaveBeenCalled()
  })

  it('marks failed and rethrows when rendering throws (so the queue retries)', async () => {
    const d = deps({ render: vi.fn().mockRejectedValue(new Error('chromium boom')) })
    await expect(runBannerRenderJob({ jobId: 'j1' }, d)).rejects.toThrow('chromium boom')
    expect(d.markFailed).toHaveBeenCalledWith('j1', 'chromium boom')
    expect(d.markDone).not.toHaveBeenCalled()
  })
})
