import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
const m = vi.hoisted(() => ({ user: { id: 'owner' }, project: null as any, access: vi.fn(), fallbackWrite: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn(async () => m.project) }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => m.user, requireWriteAccess: async () => m.user }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ hasAllSocialClientAccess: () => false, requireSocialClientAccess: (...a: any[]) => m.access(...a) }))
vi.mock('~~/server/utils/storage', () => ({ uploadFile: (...a: any[]) => m.fallbackWrite(...a), readStoredObject: vi.fn() }))
vi.stubGlobal('createError', (x: any) => Object.assign(new Error(x.statusMessage), x))
vi.stubGlobal('getRouterParam', () => '44444444-4444-4444-8444-444444444444')
const { bannerViewerSnapshot, authorizedBannerSnapshot, storeBannerSnapshot, readBannerSnapshot } = await import('../../server/utils/banner/viewerSnapshot')
const project = { id: '44444444-4444-4444-8444-444444444444', name: 'Title', canvasData: { story: { layers: [{ text: 'First', x: 20 }] } } }
function bucketEvent() {
  const objects = new Map<string, Uint8Array>()
  const bucket = { put: vi.fn(async (key: string, body: Uint8Array) => { objects.set(key, body) }), head: vi.fn(async (key: string) => objects.has(key) ? { size: objects.get(key)!.length } : null), get: vi.fn(async (key: string) => objects.has(key) ? { size: objects.get(key)!.length, body: new Blob([objects.get(key)!]).stream() } : null) }
  return { event: { context: { cloudflare: { env: { MEDIA_BUCKET: bucket } } } } as unknown as H3Event, bucket, objects }
}
beforeEach(() => { m.project = { ...project, clientId: 'client', createdBy: 'owner' }; m.access.mockReset(); m.fallbackWrite.mockReset() })
describe('Saved banner snapshots', () => {
  it('resolves identical JSONB with reordered keys to the same immutable revision', () => {
    const one = bannerViewerSnapshot(project)
    const two = bannerViewerSnapshot({ ...project, canvasData: { story: { layers: [{ x: 20, text: 'First' }] } } })
    expect(one.key).toBe(two.key)
    expect(bannerViewerSnapshot({ ...project, name: 'Renamed' }).key).not.toBe(one.key)
  })
  it('roundtrips all content through the request bucket without exposing its URL', async () => {
    const e = bucketEvent(); const s = bannerViewerSnapshot(project)
    await storeBannerSnapshot(e.event, s)
    expect(await readBannerSnapshot(e.event, s)).toEqual({ ...s.document, revision: s.revision })
    expect(m.fallbackWrite).not.toHaveBeenCalled()
  })
  it('older requests cannot overwrite newer content and missing latest revisions do not serve stale data', async () => {
    const e = bucketEvent(); const old = bannerViewerSnapshot(project); const latest = bannerViewerSnapshot({ ...project, name: 'Latest' })
    await storeBannerSnapshot(e.event, latest); await storeBannerSnapshot(e.event, old)
    expect((await readBannerSnapshot(e.event, latest)).name).toBe('Latest')
    await expect(readBannerSnapshot(e.event, bannerViewerSnapshot({ ...project, name: 'Not stored' }))).rejects.toMatchObject({ statusCode: 409 })
  })
  it('fails if native bucket is absent or does not persist the bytes', async () => {
    const e = bucketEvent(); e.bucket.head.mockResolvedValueOnce(null)
    await expect(storeBannerSnapshot(e.event, bannerViewerSnapshot(project))).rejects.toMatchObject({ statusCode: 503 })
    await expect(storeBannerSnapshot({ context: { cloudflare: { env: {} } } } as any, bannerViewerSnapshot(project))).rejects.toMatchObject({ statusCode: 503 })
    expect(m.fallbackWrite).not.toHaveBeenCalled()
  })
  it('checks client authority before returning any snapshot content', async () => {
    m.access.mockRejectedValueOnce(Object.assign(new Error('denied'), { statusCode: 403 }))
    await expect(authorizedBannerSnapshot(bucketEvent().event)).rejects.toMatchObject({ statusCode: 403 })
    m.project = { ...project, clientId: null, createdBy: 'someone-else' }
    await expect(authorizedBannerSnapshot(bucketEvent().event)).rejects.toMatchObject({ statusCode: 403 })
  })
})

it('preserves video backgrounds, crop, timing and playback in the stored revision', async () => {
  const e = bucketEvent()
  const video = { ...project, canvasData: { custom_1920x1080: { bgColor: '#000000', playback: { count: 2 }, layers: [{ id: 1, type: 'bg', srcType: 'video', src: '/api/public/banner-assets/signed-video', fit: 'cover', focalX: 30, focalY: 60, startTime: 0, endTime: 8 }] } } }
  const s = bannerViewerSnapshot(video)
  await storeBannerSnapshot(e.event, s)
  const reopened = await readBannerSnapshot(e.event, s)
  expect(reopened.canvasData).toEqual(video.canvasData)
})
