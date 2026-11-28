import jpeg from 'jpeg-js'
import { fitLibraryPoster } from '../../server/utils/banner/libraryPoster'
import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ authorize: vi.fn(), render: vi.fn(), get: vi.fn(), put: vi.fn() }))
vi.mock('~~/server/utils/banner/viewerSnapshot', () => ({ authorizedPosterRevision: m.authorize }))
vi.mock('~~/server/utils/banner/teamPreview', () => ({ teamBannerPreviewAccess: () => ({ load: vi.fn() }) }))
vi.mock('~~/server/utils/banner/shareImage', () => ({ bannerShareImage: m.render }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getQuery', () => ({ size: 'list', v: 'ignored' }))
const header = vi.fn()
vi.stubGlobal('getHeader', header)
const { default: handler } = await import('../../server/api/agency/banner-studio/projects/[id]/image.get')
const event = { context: { cloudflare: { env: { MEDIA_BUCKET: { get: m.get, put: m.put } } } } } as never
beforeEach(() => {
  vi.resetAllMocks()
  m.authorize.mockResolvedValue({ id: 'project', revision: 'rev' })
  m.render.mockImplementation(() => new Response('art', { headers: { 'Cache-Control': 'private, no-store' } }))
})

it('revalidates browser artwork only after checking current access', async () => {
  m.get.mockResolvedValue({ body: 'art' })
  const cached = await handler(event)
  expect(await cached.text()).toBe('art')
  expect(cached.headers.get('cache-control')).toBe('private, no-cache')
  header.mockReturnValue(cached.headers.get('etag'))
  expect((await handler(event)).status).toBe(304)
  m.authorize.mockRejectedValueOnce(new Error('revoked'))
  await expect(handler(event)).rejects.toThrow('revoked')
  expect(m.get).toHaveBeenCalledTimes(1)
  expect(m.render).not.toHaveBeenCalled()
})

it('caches a cold render under its server revision, skipping the alias if an edit races capture', async () => {
  expect(await (await handler(event)).text()).toBe('art')
  expect(m.put.mock.calls[0][0]).toBe('banner-library-posters/v1/project/list/rev.jpg')
  m.authorize.mockResolvedValueOnce({ id: 'project', revision: 'older' })
  const changed = await handler(event)
  expect(changed.headers.get('cache-control')).toBe('private, no-store')
  expect(m.put).toHaveBeenCalledTimes(1)
})

it('fits the same saved JPEG to list and grid bounds without upscaling small artwork', () => {
  const bytes = Uint8Array.from(jpeg.encode({ width: 600, height: 300, data: new Uint8Array(600 * 300 * 4) }).data).buffer
  const list = fitLibraryPoster(bytes, 160)
  expect(jpeg.decode(list)).toMatchObject({ width: 160, height: 80 })
  expect(jpeg.decode(fitLibraryPoster(bytes, 480))).toMatchObject({ width: 480, height: 240 })
  expect(fitLibraryPoster(list, 160)).toBe(list)
})
