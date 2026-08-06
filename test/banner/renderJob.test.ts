import { describe, it, expect, vi } from 'vitest'
import { enqueueBannerRender, projectJobStatus, clampRenderParams, BannerRenderError, type EnqueueDeps } from '~~/server/utils/banner/renderJob'

function deps(over: Partial<EnqueueDeps> = {}): EnqueueDeps {
  let n = 0
  return {
    genId: vi.fn(() => `job${n++}`),
    putSourceHtml: vi.fn().mockResolvedValue(undefined),
    insertJob: vi.fn().mockResolvedValue(undefined),
    sendQueue: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}
const validHtml = '<script>window.__engagrFrame={ready:true,duration:5,seek:function(){}}</script>'
const fmt = (k: string) => ({ key: k, html: validHtml, width: 300, height: 250 })

describe('clampRenderParams', () => {
  it('clamps fps/crf into range and coerces quality to 1|2', () => {
    expect(clampRenderParams(999, -5, 3)).toEqual({ fps: 60, crf: 0, quality: 2 })
    expect(clampRenderParams(1, 100, 0)).toEqual({ fps: 12, crf: 51, quality: 1 })
    expect(clampRenderParams(29.97, 23, 1)).toEqual({ fps: 30, crf: 23, quality: 1 })
  })
})

describe('enqueueBannerRender', () => {
  it('creates one job per format: writes HTML to R2, inserts a row, enqueues a message', async () => {
    const d = deps()
    const res = await enqueueBannerRender({ projectId: 'p1', formats: [fmt('a'), fmt('b')], fps: 30, quality: 1, crf: 23, userId: 'u1' }, d)
    expect(res.jobIds).toEqual(['job0', 'job1'])
    expect(d.putSourceHtml).toHaveBeenCalledTimes(2)
    expect((d.putSourceHtml as any).mock.calls[0][0]).toBe('banner-render-jobs/job0/source.html')
    expect(d.insertJob).toHaveBeenCalledTimes(2)
    expect((d.insertJob as any).mock.calls[0][0]).toMatchObject({ id: 'job0', project_id: 'p1', format_key: 'a', width: 300, height: 250, fps: 30, crf: 23, quality: 1, source_r2_key: 'banner-render-jobs/job0/source.html', created_by: 'u1' })
    expect(d.sendQueue).toHaveBeenCalledWith({ jobId: 'job1' })
  })

  it('rejects an empty or oversized formats array', async () => {
    await expect(enqueueBannerRender({ projectId: 'p1', formats: [], fps: 30, quality: 1, crf: 23, userId: 'u1' }, deps())).rejects.toMatchObject({ code: 'bad_request' })
    const many = Array.from({ length: 11 }, (_, i) => fmt(`f${i}`))
    await expect(enqueueBannerRender({ projectId: 'p1', formats: many, fps: 30, quality: 1, crf: 23, userId: 'u1' }, deps())).rejects.toMatchObject({ code: 'bad_request' })
  })

  it('blocks formats over the max dimension before enqueue', async () => {
    const d = deps()
    await expect(enqueueBannerRender({ projectId: 'p1', formats: [{ key: 'big', html: validHtml, width: 3000, height: 100 }], fps: 30, quality: 1, crf: 23, userId: 'u1' }, d)).rejects.toMatchObject({
      code: 'bad_request',
      findings: [expect.objectContaining({ code: 'format_too_large' })],
    })
    expect(d.insertJob).not.toHaveBeenCalled()
  })

  it('blocks HTML without a render runtime or legacy GSAP timeline', async () => {
    const d = deps()
    await expect(enqueueBannerRender({ projectId: 'p1', formats: [{ key: 'bad', html: '<div>bad</div>', width: 300, height: 250 }], fps: 30, quality: 1, crf: 23, userId: 'u1' }, d)).rejects.toMatchObject({
      code: 'bad_request',
      findings: [expect.objectContaining({ code: 'missing_runtime_contract' })],
    })
    expect(d.putSourceHtml).not.toHaveBeenCalled()
  })

  it('preflights every format before creating any partial render side effects', async () => {
    const d = deps()
    await expect(enqueueBannerRender({
      projectId: 'p1',
      formats: [fmt('valid-first'), { key: 'invalid-second', html: '<div>bad</div>', width: 300, height: 250 }],
      fps: 30,
      quality: 1,
      crf: 23,
      userId: 'u1'
    }, d)).rejects.toMatchObject({
      code: 'bad_request',
      findings: [expect.objectContaining({ code: 'missing_runtime_contract' })]
    })

    expect(d.genId).not.toHaveBeenCalled()
    expect(d.putSourceHtml).not.toHaveBeenCalled()
    expect(d.insertJob).not.toHaveBeenCalled()
    expect(d.sendQueue).not.toHaveBeenCalled()
  })
})

describe('projectJobStatus', () => {
  it('maps rows to a compact status list', () => {
    const rows = [{ id: 'j1', project_id: 'p', format_key: 'a', width: 300, height: 250, fps: 30, crf: 23, quality: 1, source_r2_key: 'k', status: 'done', url: 'https://x/a.mp4', file_size: 1234, error: null }]
    expect(projectJobStatus(rows as any)).toEqual([{ jobId: 'j1', formatKey: 'a', status: 'done', url: 'https://x/a.mp4', fileSize: 1234, error: null }])
  })
})
