import { gsap } from 'gsap'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), limit: vi.fn(), get: vi.fn(), put: vi.fn(), screenshot: vi.fn() }))
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(), getQuery: (event: { query?: object }) => event.query || {} }))
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
    expect(options.html).toContain('window.__engagrFrame.seek(7.5)')
    expect(options.html).not.toContain('<audio')
    expect(options.addScriptTag[0].content).toContain('window.__engagrFrame.seek(0);')
    expect(options.addScriptTag[0].content.indexOf('seek(0)')).toBeLessThan(options.addScriptTag[0].content.indexOf('seek(7.5)'))
    expect(options.waitForSelector.selector).toBe('[data-share-image-ready]')
    expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^banner-share-previews\/project\/[a-f0-9]{64}\.jpg$/), expect.any(ArrayBuffer), expect.anything())
  })

  it('does not cache failed captures or substitute the dashboard screenshot', async () => {
    mocks.screenshot.mockResolvedValueOnce(new Response('failed', { status: 500 }))
    await expect(bannerShareImage(event as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('renders the requested saved portrait size for its video poster', async () => {
    mocks.load.mockResolvedValueOnce({ project: { id: 'project', canvasData: {
      custom_1080x1080: { layers: [], playback: { duration: 6, loopCount: 0 } },
      custom_1080x1920: { layers: [], playback: { duration: 6, loopCount: 0 } }
    } }, fonts: [] })
    await bannerShareImage({ ...event, query: { formatKey: 'custom_1080x1920' } } as never)
    const [, options] = mocks.screenshot.mock.calls[0]!
    expect(options.viewport).toEqual({ width: 675, height: 1200, deviceScaleFactor: 1 })
    expect(options.html).toContain('window.__engagrFrame.seek(3)')
  })

  it.each(['custom_400x300', 'https://example.com/artwork'])('rejects a poster size not present in the shared canvas: %s', async (formatKey) => {
    await expect(bannerShareImage({ ...event, query: { formatKey } } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.screenshot).not.toHaveBeenCalled()
  })

  it('rejects multiple size values before rendering', async () => {
    await expect(bannerShareImage({ ...event, query: { formatKey: ['custom_1080x1080', 'custom_1080x1920'] } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.screenshot).not.toHaveBeenCalled()
  })

  it('permits only managed assets and fixed rendering dependencies', () => {
    const permits = (url: string) => SHARE_IMAGE_REQUESTS.some(pattern => new RegExp(pattern).test(url))
    expect(permits('https://app.xeroflow.io/api/public/banner-assets/v1.abc.def')).toBe(true)
    expect(permits('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js')).toBe(true)
    for (const url of ['http://127.0.0.1/', 'https://169.254.169.254/', 'https://app.xeroflow.io.evil.test/api/public/banner-assets/v1.abc.def', 'https://app.xeroflow.io/api/agency/clients', 'https://cdnjs.cloudflare.com/evil.js']) expect(permits(url)).toBe(false)
  })
})

it.each([1.5, 5.9, 299.9])('renders a saved poster beyond the old midpoint limit: %s', async (time) => {
  mocks.load.mockResolvedValueOnce({ project: { id: 'project', canvasData: { custom_1080x1080: { layers: [], posterTime: time, playback: { duration: 300, loopCount: 0 } } } }, fonts: [] })
  await bannerShareImage(event as never)
  expect(mocks.screenshot.mock.calls[0][1].html).toContain(`window.__engagrFrame.seek(${time})`)
})

it.each([-1, 300.001, null, '5.9'])('rejects an invalid poster worker time: %s', async (time) => {
  const response = await renderer.fetch(new Request('https://banner-share-images/screenshot', { method: 'POST', body: JSON.stringify({ html: '<html></html>', width: 1200, height: 1200, time }) }), { BROWSER: { quickAction: mocks.screenshot } })
  expect(response.status).toBe(400)
  expect(mocks.screenshot).not.toHaveBeenCalled()
})

it('seeks embedded video after the paused HTML already rendered the chosen frame', async () => {
  const video = { readyState: 2, seeking: false, currentTime: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const clock = { time: 0 }
  const timeline = gsap.timeline({ paused: true }).to(clock, { time: 6, duration: 6, ease: 'none', onUpdate: () => {
    video.currentTime = clock.time
  } }, 0)
  timeline.render(1.5, true, true)
  expect(video.currentTime).toBe(0)
  const setAttribute = vi.fn()
  const document = { fonts: { ready: Promise.resolve() }, images: [], querySelectorAll: () => [video], body: { setAttribute } }
  const window = { __engagrFrame: { seek: (time: number) => timeline.seek(time, false) } }
  const { bannerShareCaptureOptions } = await import('~~/shared/bannerShareCapture')
  const script = bannerShareCaptureOptions('', 1200, 1200, 1.5).addScriptTag[0].content
  try {
    new Function('window', 'document', 'requestAnimationFrame', script)(window, document, (callback: () => void) => callback())
    await vi.waitFor(() => expect(setAttribute).toHaveBeenCalledWith('data-share-image-ready', ''))
    expect(video.currentTime).toBe(1.5)
  } finally {
    timeline.kill()
  }
})

it('uses the saved layer duration for automatic posters when playback metadata is absent', async () => {
  mocks.load.mockResolvedValueOnce({ project: { id: 'project', canvasData: { custom_1080x1080: { layers: [{ id: 1, type: 'video', x: 0, y: 0, w: 1080, h: 1080, opacity: 1, startTime: 0, endTime: 12, animIn: 'none' }] } } }, fonts: [] })
  await bannerShareImage(event as never)
  expect(mocks.screenshot.mock.calls[0][1].html).toContain('window.__engagrFrame.seek(6)')
})

it('authorizes team posters before reading a cached image', async () => {
  const load = vi.fn().mockRejectedValue(Object.assign(new Error(), { statusCode: 403 }))
  await expect(bannerShareImage(event as never, load)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.load).not.toHaveBeenCalled()
})

it('renders a small private gallery JPEG without replacing the full-size proof', async () => {
  await bannerShareImage(event as never, mocks.load, true)
  expect(mocks.screenshot.mock.calls[0][1].viewport).toEqual({ width: 480, height: 480, deviceScaleFactor: 1 })
  expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^banner-gallery-posters\/project\//), expect.any(ArrayBuffer), expect.anything())
  await bannerShareImage(event as never, mocks.load)
  expect(mocks.screenshot.mock.calls[1][1].viewport.width).toBe(1080)
})

it('uses the first slide for existing gallery cards, ignoring later saved posters and cached proof images', async () => {
  mocks.load.mockResolvedValueOnce({ project: { id: 'project', canvasData: { custom_1200x1200: {
    layers: [{ id: 1, type: 'rect', startTime: 0, endTime: 4, w: 1200, h: 1200 }],
    slides: [{ id: 'logo', name: 'Logo', duration: 1.5 }, { id: 'car', name: 'Car', duration: 2.5 }],
    playback: { duration: 4 }, posterTime: 3
  } } }, fonts: [] })
  await bannerShareImage(event as never, mocks.load, true)
  expect(mocks.get).toHaveBeenCalledTimes(1)
  expect(mocks.screenshot.mock.calls[0][1].html).toContain('window.__engagrFrame.seek(0.75)')
})

it('reuses an existing proof on a gallery miss and a stored gallery JPEG on the next read', async () => {
  const jpeg = { body: new Uint8Array([255, 216, 255]) }
  mocks.get.mockResolvedValueOnce(null).mockResolvedValueOnce(jpeg).mockResolvedValueOnce(jpeg)
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await bannerShareImage(event as never, mocks.load, true)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  }
  expect(mocks.get).toHaveBeenCalledTimes(3)
  expect(mocks.screenshot).not.toHaveBeenCalled()
})

it('exports the second slide of a portrait set at its own midpoint, scale and JPEG quality', async () => {
  mocks.load.mockResolvedValueOnce({ project: { id: 'project', canvasData: {
    custom_1200x1500: { layers: [], slides: [{ id: 'a', name: 'Logo', duration: 1 }, { id: 'b', name: 'Offer', duration: 3 }], playback: { duration: 4 } }
  } }, fonts: [] })
  const response = await bannerShareImage({ ...event, query: { formatKey: 'custom_1200x1500' } } as never, mocks.load, false, { index: 1, scale: 2, quality: 95 })
  expect(response.status).toBe(200)
  const [, options] = mocks.screenshot.mock.calls[0]!
  expect(options.viewport).toMatchObject({ width: 2400, height: 3000 })
  expect(options.screenshotOptions).toEqual({ type: 'jpeg', quality: 95 })
  expect(options.html).toContain('window.__engagrFrame.seek(2.5)')
  expect(mocks.put.mock.calls[0]![0]).toMatch(/^banner-slide-images\//)
})

it('plans separately named JPEGs for selected slides in all three PMax sizes', async () => {
  const { planSlideDownloads } = await import('../../app/utils/banner-slide-downloads')
  const sizes = ['custom_1200x628', 'custom_1200x1200', 'custom_1200x1500']
  const boards = Object.fromEntries(sizes.map(size => [size, { layers: [], slides: Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: 'Slide', duration: 2 })) }]))
  const files = planSlideDownloads(boards, sizes, new Set([0, 1, 2, 3, 4, 5]))
  expect(new Set(files.map(file => file.folder + '/' + file.name)).size).toBe(18)
  expect(planSlideDownloads(boards, sizes.slice(-1), new Set([4]))).toEqual([{ key: sizes[2], index: 4, folder: '1200x1500', name: 'Slide-5.jpg' }])
})
