// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClientVideoPreview from '~/components/banner/ClientVideoPreview.client.vue'
import type { ArtboardState } from '~/types/banner-studio'

vi.mock('@vueuse/core', () => ({
  useElementSize: () => ({ width: ref(1000), height: ref(800) }),
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
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(ClientVideoPreview, { canvas, shareToken: `p_${'a'.repeat(32)}`, projectName: 'GMSV' })
  app.component('UButton', defineComponent({ props: ['variant', 'color', 'icon', 'loading'], setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) }))
  app.component('UIcon', { template: '<span />' })
  app.component('UAlert', defineComponent({ props: ['description'], setup: p => () => h('div', p.description) }))
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
  fetch.mockReset().mockResolvedValue(ready)
})
afterEach(() => {
  cleanups.splice(0).forEach(stop => stop())
  vi.useRealTimers()
})
describe('client compiled video player', () => {
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
    expect(host.textContent).toContain('Preparing your video preview')
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
  it('aborts requests and clears polling when unmounted', async () => {
    fetch.mockResolvedValue({ videos: [{ ...ready.videos[0], status: 'queued', url: null }] })
    const { stop } = await mount()
    const signal = fetch.mock.calls[0]![1].signal
    stop()
    cleanups.pop()
    expect(signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(9000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
