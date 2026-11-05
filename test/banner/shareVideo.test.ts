import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArtboardState } from '~~/app/types/banner-studio'
import { bannerShareVideoPlans, bannerShareVideos, prepareBannerShareVideo, bannerShareVideo } from '~~/server/utils/banner/shareVideo'

const mocks = vi.hoisted(() => ({ load: vi.fn(), one: vi.fn(), limit: vi.fn(), put: vi.fn(), send: vi.fn(), deliver: vi.fn() }))
vi.mock('~~/server/utils/banner/publicShare', () => ({ loadPublicBannerShare: mocks.load }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.one }))
vi.mock('~~/server/utils/rateLimit', () => ({ enforceRateLimit: mocks.limit }))
vi.mock('~~/server/utils/banner/renderEnqueue', () => ({ buildBannerRenderEnqueueDeps: (_event: unknown, options: { genId: () => string }) => ({ genId: options.genId, putSourceHtml: mocks.put, insertJob: vi.fn(), sendQueue: mocks.send }) }))
vi.mock('~~/server/utils/banner/videoDelivery', () => ({ deliverBannerVideo: mocks.deliver }))
vi.stubGlobal('getRouterParam', () => `p_${'a'.repeat(32)}`)
vi.stubGlobal('getQuery', (event: { query?: unknown }) => event.query || {})

const projectId = '22222222-2222-4222-8222-222222222222'
const board = { bgColor: '#000000', playback: { duration: 15, loopCount: 0 }, layers: [
  { id: 1, type: 'text', text: 'Three years free servicing', x: 0, y: 0, w: 900, h: 100, opacity: 1, startTime: 0, endTime: 15, zIndex: 1, fontFamily: 'Arial' },
  { id: 2, type: 'audio', src: 'https://app.xeroflow.io/api/public/banner-assets/v1.YXVkaW8.signature', startTime: 2, endTime: 15, volume: 0.9 }
] } as ArtboardState
const share = () => ({ project: { id: projectId, name: 'GMSV', clientId: null, clientName: null, canvasData: { custom_1200x1200: structuredClone(board) } }, fonts: [] })
const event = {} as never
beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue(share())
  mocks.one.mockImplementation(async (sql: string) => sql.startsWith('SELECT created_by') ? { created_by: 'owner' } : sql.startsWith('INSERT') ? { id: 'reserved' } : null)
})

describe('compiled client previews', () => {
  it('reuses identical saved content across tokens and object key order, and invalidates artwork/fonts', () => {
    const original = share()
    const first = bannerShareVideoPlans(original)[0]!
    const reordered = share()
    reordered.project.canvasData.custom_1200x1200 = Object.fromEntries(Object.entries(board).reverse()) as ArtboardState
    expect(bannerShareVideoPlans(reordered)[0]!.id).toBe(first.id)
    original.project.canvasData.custom_1200x1200.layers[0]!.text = 'New offer'
    expect(bannerShareVideoPlans(original)[0]!.id).not.toBe(first.id)
    const fonts = { ...share(), fonts: [{ id: 'font', name: 'Face', url: 'url', tags: [], clientId: null, sha256: 'new' }] }
    expect(bannerShareVideoPlans(fonts as never)[0]!.id).not.toBe(first.id)
    expect(first.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}$/)
  })
  it('enqueues server-generated artwork with its soundtrack, native resolution, and restricted subresources', async () => {
    await prepareBannerShareVideo(event, 'custom_1200x1200')
    expect(mocks.send).toHaveBeenCalledTimes(1)
    const html = mocks.put.mock.calls[0]![1]
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain('Three years free servicing')
    expect(html).toContain('application/json')
    expect(html).toContain('v1.YXVkaW8.signature')
    const insert = mocks.one.mock.calls.find(([sql]) => sql.startsWith('INSERT'))!
    expect(insert[1].slice(3, 8)).toEqual([1200, 1200, 24, 20, 1])
    expect(mocks.limit).toHaveBeenCalledWith(event, expect.objectContaining({ key: `banner-share-video:${projectId}`, failureMode: 'closed' }))
  })
  it('does not dispatch a second job when a concurrent insert wins', async () => {
    mocks.one.mockImplementation(async (sql: string) => sql.startsWith('SELECT created_by') ? { created_by: 'owner' } : null)
    await prepareBannerShareVideo(event, 'custom_1200x1200')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it.each(['done', 'queued', 'rendering', 'failed'])('does not repeatedly render an existing %s job on page visits', async (status) => {
    mocks.one.mockResolvedValue({ status, updated_at: new Date().toISOString() })
    await prepareBannerShareVideo(event, 'custom_1200x1200')
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.limit).not.toHaveBeenCalled()
  })
  it('reserves only one retry and keeps its original job identity', async () => {
    mocks.one.mockResolvedValueOnce({ id: 'same-job', status: 'failed' }).mockResolvedValueOnce({ id: 'same-job' })
    await prepareBannerShareVideo(event, 'custom_1200x1200', true)
    expect(mocks.send).toHaveBeenCalledWith({ jobId: 'same-job' })
    expect(mocks.put).not.toHaveBeenCalled()
  })
  it('cannot retry a job another visitor has already reserved', async () => {
    mocks.one.mockResolvedValueOnce({ id: 'same-job', status: 'failed' }).mockResolvedValueOnce(null)
    await prepareBannerShareVideo(event, 'custom_1200x1200', true)
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('rejects unknown formats, overlong animations and private resource URLs before rendering', async () => {
    await expect(prepareBannerShareVideo(event, 'unknown')).rejects.toMatchObject({ statusCode: 404 })
    const long = share()
    long.project.canvasData.custom_1200x1200.playback!.duration = 31
    mocks.load.mockResolvedValueOnce(long)
    await expect(prepareBannerShareVideo(event, 'custom_1200x1200')).rejects.toMatchObject({ statusCode: 422 })
    const unsafe = share()
    unsafe.project.canvasData.custom_1200x1200.layers[1]!.src = 'http://127.0.0.1/secrets'
    mocks.load.mockResolvedValueOnce(unsafe)
    await expect(prepareBannerShareVideo(event, 'custom_1200x1200')).rejects.toMatchObject({ statusCode: 422 })
    expect(mocks.put).not.toHaveBeenCalled()
  })
  it('returns a capability URL without exposing storage keys or worker errors', async () => {
    mocks.one.mockResolvedValue({ status: 'done', r2_key: 'private-key', error: 'secret' })
    const response = await bannerShareVideos(event)
    expect(response.videos[0]!.url).toContain('/video?formatKey=custom_1200x1200&revision=')
    expect(JSON.stringify(response)).not.toMatch(/private-key|secret/)
    const sql = mocks.one.mock.calls[0]!
    expect(sql[1]).toEqual([expect.any(String), projectId, 'custom_1200x1200', expect.stringContaining('/source.html')])
  })
  it('checks revocation before status, enqueue and every video range request', async () => {
    mocks.load.mockRejectedValue({ statusCode: 410 })
    await expect(bannerShareVideos(event)).rejects.toMatchObject({ statusCode: 410 })
    await expect(prepareBannerShareVideo(event, 'custom_1200x1200')).rejects.toMatchObject({ statusCode: 410 })
    await expect(bannerShareVideo(event)).rejects.toMatchObject({ statusCode: 410 })
    expect(mocks.one).not.toHaveBeenCalled()
    expect(mocks.deliver).not.toHaveBeenCalled()
  })
  it('never serves an old revision or a different project’s arbitrary export', async () => {
    await expect(bannerShareVideo({ query: { formatKey: 'custom_1200x1200', revision: 'old' } } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.one).not.toHaveBeenCalled()
    const plan = bannerShareVideoPlans(share())[0]!
    mocks.one.mockResolvedValue({ status: 'done', r2_key: `banner-videos/${projectId}/render.mp4` })
    await bannerShareVideo({ query: { formatKey: plan.key, revision: plan.revision } } as never)
    expect(mocks.deliver).toHaveBeenCalledWith(expect.anything(), `banner-videos/${projectId}/render.mp4`, projectId, true)
  })
})
