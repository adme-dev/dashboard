import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), limit: vi.fn(), get: vi.fn(), put: vi.fn(), screenshot: vi.fn() }))
vi.mock('~~/server/utils/banner/publicShare', () => ({ loadPublicBannerShare: mocks.load }))
vi.mock('~~/server/utils/rateLimit', () => ({ enforceRateLimit: mocks.limit }))
vi.stubGlobal('createError', (options: object) => Object.assign(new Error(), options))
const { bannerShareImage } = await import('~~/server/utils/banner/shareImage')
const { SHARE_IMAGE_REQUESTS } = await import('~~/shared/bannerShareCapture')
const { default: renderer } = await import('../../workers/banner-share-images/src/index')
const event = { context: { cloudflare: { env: { MEDIA_BUCKET: { get: mocks.get, put: mocks.put }, BANNER_SHARE_IMAGES: { fetch: (request: Request) => renderer.fetch(request, { BROWSER: { quickAction: mocks.screenshot } }) } } } } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue({ project: { id: 'project', canvasData: { custom_1080x1080: { layers: [{ id: 3, type: 'video', src: 'https://app.xeroflow.io/api/public/banner-assets/v1.abc.def', x: 0, y: 0, w: 1080, h: 1080, opacity: 1, startTime: 0, endTime: 15 }], playback: { duration: 15, loopCount: 0 } } } }, fonts: [] })
  mocks.get.mockResolvedValue(null)
  mocks.screenshot.mockImplementation(async () => new Response(new Uint8Array([255, 216, 255]), { headers: { 'content-type': 'image/jpeg' } }))
})

describe('shared artwork images', () => {
  it('checks the live link before reading cached artwork', async () => {
    mocks.load.mockRejectedValueOnce(Object.assign(new Error(), { statusCode: 410 }))
    await expect(bannerShareImage(event as never)).rejects.toMatchObject({ statusCode: 410 })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.screenshot).not.toHaveBeenCalled()
  })

  it('returns an already rendered image without spending browser capacity', async () => {
    mocks.get.mockResolvedValueOnce({ body: new Uint8Array([255, 216, 255]) })
    const response = await bannerShareImage(event as never)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.limit).not.toHaveBeenCalled()
    expect(mocks.screenshot).not.toHaveBeenCalled()
  })

  it('renders the square saved artwork at a deliberate frame and caches its revision', async () => {
    const response = await bannerShareImage(event as never)
    expect(response.status).toBe(200)
    expect(mocks.limit).toHaveBeenCalledWith(event, expect.objectContaining({ limit: 3, failureMode: 'closed' }))
    const [action, options] = mocks.screenshot.mock.calls[0]!
    expect(action).toBe('screenshot')
    expect(options.viewport).toEqual({ width: 1080, height: 1080, deviceScaleFactor: 1 })
    expect(options.html).toContain('window.__engagrFrame.seek(3)')
    expect(options.html).not.toContain('<audio')
    expect(options.waitForSelector.selector).toBe('[data-share-image-ready]')
    expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^banner-share-previews\/project\/[a-f0-9]{64}\.jpg$/), expect.any(ArrayBuffer), expect.anything())
  })

  it('does not cache failed captures or substitute the dashboard screenshot', async () => {
    mocks.screenshot.mockResolvedValueOnce(new Response('failed', { status: 500 }))
    await expect(bannerShareImage(event as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('permits only managed assets and fixed rendering dependencies', () => {
    const permits = (url: string) => SHARE_IMAGE_REQUESTS.some(pattern => new RegExp(pattern).test(url))
    expect(permits('https://app.xeroflow.io/api/public/banner-assets/v1.abc.def')).toBe(true)
    expect(permits('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js')).toBe(true)
    for (const url of ['http://127.0.0.1/', 'https://169.254.169.254/', 'https://app.xeroflow.io.evil.test/api/public/banner-assets/v1.abc.def', 'https://app.xeroflow.io/api/agency/clients', 'https://cdnjs.cloudflare.com/evil.js']) expect(permits(url)).toBe(false)
  })
})
