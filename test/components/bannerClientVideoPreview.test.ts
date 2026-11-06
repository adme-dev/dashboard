// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClientVideoPreview from '~/components/banner/ClientVideoPreview.client.vue'
import type { ArtboardState } from '~/types/banner-studio'

const viewportSize = vi.hoisted(() => ({ width: 1000, height: 800 }))
vi.mock('@vueuse/core', () => ({
  useElementSize: () => ({ width: ref(viewportSize.width), height: ref(viewportSize.height) }),
  useFullscreen: () => ({ toggle: vi.fn(async () => {}), isSupported: ref(false) })
}))
vi.mock('~/components/ad-preview/MetaFeedPreview.vue', () => ({ default: { template: '<div data-placement="feed"><slot name="creative" /></div>' } }))
vi.mock('~/components/ad-preview/MetaStoryPreview.vue', () => ({ default: { template: '<div data-placement="story"><slot name="creative" /></div>' } }))
const fetch = vi.fn()
vi.stubGlobal('$fetch', fetch)
const cleanups: Array<() => void> = []
const board = { layers: [], playback: { duration: 15, loopCount: 0 } } as ArtboardState
const canvas = { custom_1200x1200: board, custom_1080x1920: board }
const ready = { videos: [
  { formatKey: 'custom_1200x1200', revision: 'square', status: 'done', url: '/square.mp4', canRetry: false },
  { formatKey: 'custom_1080x1920', revision: 'portrait', status: 'done', url: '/portrait.mp4', canRetry: false }
] }
async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}
async function mount(overrides: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(ClientVideoPreview, { canvas, shareToken: `p_${'a'.repeat(32)}`, projectName: 'GMSV', ...overrides })
  app.component('UButton', defineComponent({ props: ['variant', 'color', 'icon', 'loading'], setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) }))
  app.component('UIcon', { template: '<span />' })
  app.component('UAlert', defineComponent({ props: ['description', 'actions'], setup: p => () => h('div', [p.description, ...(p.actions || []).map((action: { label: string, onClick: () => void }) => h('button', { onClick: action.onClick }, action.label))]) }))
  app.mount(host)
  const stop = () => {
    app.unmount()
    host.remove()
  }
  cleanups.push(stop)
  await flush()
  const click = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
    expect(button, `button ${label}`).toBeTruthy()
    button!.click()
    await flush()
  }
  return { host, click, stop }
}
beforeEach(() => {
  vi.useFakeTimers()
  viewportSize.width = 1000
  viewportSize.height = 800
  fetch.mockReset().mockResolvedValue(ready)
})
afterEach(() => {
  cleanups.splice(0).forEach(stop => stop())
  vi.useRealTimers()
})
describe('client compiled video player', () => {
  it('plays server-prepared sizes even when browser status fetches are blocked', async () => {
    fetch.mockRejectedValue(new TypeError('Fetch API access control checks'))
    const { host, click } = await mount({ initialVideos: ready.videos })
    expect(host.querySelector('video')?.getAttribute('src')).toBe('/square.mp4')
    await click('1080 × 1920')
    expect(host.querySelector('video')?.getAttribute('src')).toBe('/portrait.mp4')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('opens an already completed size while the preferred square is still queued', async () => {
    const { host } = await mount({ initialVideos: [{ ...ready.videos[0], status: 'queued', url: null }, ready.videos[1]] })
    expect(host.querySelector('video')?.getAttribute('src')).toBe('/portrait.mp4')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('ends a hanging status check after 15 seconds with a full-page reload option', async () => {
    fetch.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const { host } = await mount()
    await vi.advanceTimersByTimeAsync(15000)
    await flush()
    expect(host.textContent).toContain('status could not be checked')
    expect(host.textContent).toContain('Reload page')
    expect(host.textContent).not.toContain('Preparing your video preview')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not abort completed requests each time polling advances', async () => {
    fetch.mockResolvedValueOnce({ videos: [{ ...ready.videos[0], status: 'queued', url: null }] })
    await mount()
    const signal = fetch.mock.calls[0]![1].signal
    await vi.advanceTimersByTimeAsync(3000)
    await flush()
    expect(signal.aborted).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('recovers an unclaimed stale queue once, then waits without duplicating preparation', async () => {
    const queued = { videos: [{ ...ready.videos[0], status: 'queued', url: null, canRetry: true }] }
    fetch.mockResolvedValue(queued)
    const { host } = await mount()
    expect(host.textContent).toContain('queued')
    await vi.advanceTimersByTimeAsync(9000)
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: { formatKey: 'custom_1200x1200', retry: true } }))
  })
  it.each([320, 375, 390])('fits social placement inside a %ipx screen without clipping controls', async (width) => {
    viewportSize.width = width
    const { host, click } = await mount()
    await click('Social placement')
    expect((host.querySelector('[data-placement="feed"]') as HTMLElement).style.width).toBe(`${width - 32}px`)
  })
  it('shows an actionable empty-artwork error without submitting a render', async () => {
    const { host } = await mount({ canvas: {} })
    expect(host.textContent).toContain('No saved artwork sizes')
    expect(fetch).not.toHaveBeenCalled()
    expect(host.querySelector('video')).toBeNull()
  })
  it('does not queue unsupported artwork or poll it indefinitely', async () => {
    fetch.mockResolvedValue({ videos: [{ ...ready.videos[0], status: 'unsupported', url: null }] })
    const { host } = await mount()
    expect(host.textContent).toContain('separate preview export')
    await vi.advanceTimersByTimeAsync(15000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('recovers from a network error without starting duplicate renders', async () => {
    fetch.mockRejectedValueOnce(new Error('offline'))
    const { host, click } = await mount()
    expect(host.textContent).toContain('status could not be checked')
    await click('Reload preview')
    expect(host.querySelector('video')?.getAttribute('src')).toBe('/square.mp4')
    expect(fetch.mock.calls.every(([, options]) => options.method !== 'POST')).toBe(true)
  })
  it('replaces a failed media element when reloading', async () => {
    const { host, click } = await mount()
    const first = host.querySelector('video')!
    first.dispatchEvent(new Event('error'))
    await flush()
    expect(host.textContent).toContain('Video playback could not start')
    await click('Reload preview')
    expect(host.querySelector('video')).not.toBe(first)
    expect(host.textContent).not.toContain('Video playback could not start')
  })
  it.each([404, 410])('removes media when a refreshed link returns %i', async (statusCode) => {
    const { host, click } = await mount()
    const first = host.querySelector('video')!
    first.dispatchEvent(new Event('error'))
    await flush()
    fetch.mockRejectedValueOnce({ statusCode, data: { statusMessage: 'Link unavailable' } })
    await click('Reload preview')
    expect(host.querySelector('video')).toBeNull()
    expect(host.textContent).toContain('Link unavailable')
  })
  it('pauses the previous video when switching sizes and does not autoplay the next', async () => {
    const { host, click } = await mount()
    const first = host.querySelector('video')!
    first.pause = vi.fn()
    await click('1080 × 1920')
    expect(first.pause).toHaveBeenCalledOnce()
    expect(host.querySelector('video')?.hasAttribute('autoplay')).toBe(false)
    expect(host.querySelectorAll('video')).toHaveLength(1)
  })
  it('handles a denied play gesture with a recoverable message', async () => {
    const { host, click } = await mount()
    const media = host.querySelector('video')!
    media.play = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    await click('Replay')
    expect(host.textContent).toContain('Tap Play on the video')
    media.dispatchEvent(new Event('playing'))
    await flush()
    expect(host.textContent).not.toContain('Tap Play on the video')
  })
  it('shows the fallback instruction if iPhone fullscreen throws', async () => {
    const { host, click } = await mount()
    const media = host.querySelector('video')! as HTMLVideoElement & { webkitEnterFullscreen: () => void }
    media.webkitEnterFullscreen = () => {
      throw new Error('InvalidStateError')
    }
    await click('Full screen')
    expect(host.textContent).toContain('Use the full-screen control on the video')
  })
  it('honours a finite loop count and resets it on replay', async () => {
    const { host, click } = await mount({ canvas: { custom_1200x1200: { ...board, playback: { duration: 15, loopCount: 2 } } } })
    const media = host.querySelector('video')!
    media.play = vi.fn().mockResolvedValue(undefined)
    expect(media.hasAttribute('loop')).toBe(false)
    media.dispatchEvent(new Event('ended'))
    media.dispatchEvent(new Event('ended'))
    expect(media.play).toHaveBeenCalledTimes(1)
    await click('Replay')
    media.dispatchEvent(new Event('ended'))
    expect(media.play).toHaveBeenCalledTimes(3)
  })
  it('uses one inline native video with audio in the same file and no autoplay', async () => {
    const { host } = await mount()
    const video = host.querySelector('video')!
    expect(video.getAttribute('src')).toBe('/square.mp4')
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(video.hasAttribute('controls')).toBe(true)
    expect(video.hasAttribute('autoplay')).toBe(false)
    expect(host.querySelector('audio, iframe')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('uses the iPhone video fullscreen API synchronously from the tap', async () => {
    const { host, click } = await mount()
    const video = host.querySelector('video')! as HTMLVideoElement & { webkitEnterFullscreen: () => void }
    video.webkitEnterFullscreen = vi.fn()
    await click('Full screen')
    expect(video.webkitEnterFullscreen).toHaveBeenCalledOnce()
  })
  it('keeps compiled video in feed and story mockups', async () => {
    const { host, click } = await mount()
    await click('Social placement')
    expect(host.querySelector('[data-placement="feed"] video')).toBeTruthy()
    await click('1080 × 1920')
    expect(host.querySelector('[data-placement="story"] video')?.getAttribute('src')).toBe('/portrait.mp4')
    expect(host.querySelector('iframe, audio')).toBeNull()
  })
  it('prepares missing artwork once, polls, then stops when ready', async () => {
    fetch.mockResolvedValueOnce({ videos: [{ ...ready.videos[0], status: 'missing', url: null }] })
      .mockResolvedValueOnce({ status: 'queued' })
      .mockResolvedValueOnce(ready)
    const { host } = await mount()
    expect(host.textContent).toContain('Your video preview is queued')
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(3000)
    await flush()
    expect(host.querySelector('video')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(9000)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('requires an explicit retry after rendering fails', async () => {
    fetch.mockResolvedValueOnce({ videos: [{ ...ready.videos[0], status: 'failed', url: null, canRetry: true }] })
    const { host, click } = await mount()
    expect(host.textContent).toContain('could not be prepared')
    await vi.advanceTimersByTimeAsync(9000)
    expect(fetch).toHaveBeenCalledTimes(1)
    await click('Retry preparation')
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST', body: { formatKey: 'custom_1200x1200', retry: true } }))
  })
  it('ignores a late response for a previously selected size', async () => {
    let finish: (value: unknown) => void = () => {}
    fetch.mockReturnValueOnce(new Promise((resolve) => {
      finish = resolve
    }))
    const { host, click } = await mount()
    await click('1080 × 1920')
    finish({ videos: [{ ...ready.videos[0], status: 'failed', url: null }] })
    await flush()
    expect(host.querySelector('video')?.getAttribute('src')).toBe('/portrait.mp4')
  })
  it('aborts an outstanding request when unmounted', async () => {
    fetch.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const { stop } = await mount()
    const signal = fetch.mock.calls[0]![1].signal
    stop()
    cleanups.pop()
    expect(signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(9000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('clears queued polling when unmounted without aborting a settled request', async () => {
    fetch.mockResolvedValue({ videos: [{ ...ready.videos[0], status: 'queued', url: null }] })
    const { stop } = await mount()
    const signal = fetch.mock.calls[0]![1].signal
    stop()
    cleanups.pop()
    await vi.advanceTimersByTimeAsync(9000)
    expect(signal.aborted).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
