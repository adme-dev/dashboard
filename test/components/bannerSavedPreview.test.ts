// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SavedPreview from '~/components/banner/SavedPreview.client.vue'
import type { ArtboardState } from '~/types/banner-studio'

vi.mock('@vueuse/core', () => ({
  useElementSize: () => ({ width: ref(1000), height: ref(800) }),
  useFullscreen: () => ({ isFullscreen: ref(false), isSupported: ref(true), toggle: vi.fn(async () => { throw new Error('Fullscreen denied') }) })
}))
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach(stop => stop())
})
const board = { layers: [{ id: 1, type: 'text', text: 'Opening', x: 0, y: 0, w: 300, h: 60, opacity: 1, startTime: 0, endTime: 4 }] } as ArtboardState
const canvas = { custom_1080x1920: board, custom_1200x1200: board, custom_1920x1080: board }
async function mount(previewCanvas: Record<string, ArtboardState> = canvas) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(SavedPreview, { canvas: previewCanvas })
  app.component('UButton', defineComponent({
    props: ['label', 'icon', 'variant', 'color', 'size'],
    setup: (props, { attrs }) => () => h('button', attrs, props.label)
  }))
  const media = defineComponent({
    props: ['html', 'width', 'height', 'htmlWidth', 'htmlHeight', 'showPlaceholders', 'creativeAspectRatio', 'showDefaultCta'],
    setup: (props, { attrs }) => () => h('div', { ...attrs, 'data-html': props.html, 'data-width': props.width || props.htmlWidth, 'data-ratio': props.creativeAspectRatio, 'data-placeholders': props.showPlaceholders, 'data-cta': props.showDefaultCta }, [h('iframe')])
  })
  app.component('BannerSavedViewerFrame', media)
  app.component('AdPreviewMetaFeedPreview', media)
  app.component('AdPreviewMetaStoryPreview', media)
  app.component('UAlert', { template: '<div />' })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await nextTick()
  const button = (label: string) => [...host.querySelectorAll('button')].find(el => el.textContent === label || el.getAttribute('aria-label') === label)!
  const click = async (label: string) => {
    button(label).click()
    await nextTick()
  }
  return { host, button, click, media: () => host.querySelector<HTMLElement>('[data-html]')! }
}

describe('saved banner review workspace', () => {
  it('opens on a real stopped frame, switches sizes and stops the previous animation', async () => {
    const view = await mount()
    expect(view.media().dataset.html).toContain('paused: true')
    expect(view.host.querySelectorAll('[data-html]')).toHaveLength(1)
    await view.click('Play')
    expect(view.media().dataset.html).not.toContain('paused: true')
    await view.click('1200 × 1200')
    expect(view.media().dataset.width).toBe('1200')
    expect(view.media().dataset.html).toContain('paused: true')
    expect(view.button('Play')).toBeDefined()
    await view.click('Replay animation')
    expect(view.media().dataset.html).not.toContain('paused: true')
    await view.click('Stop')
    expect(view.media().dataset.html).toContain('window.__engagrFrame.seek(0)')
  })

  it('zooms beyond the viewport and restores Fit without restarting the artwork', async () => {
    const view = await mount()
    const initialHtml = view.media().dataset.html
    await view.click('100%')
    expect(view.host.textContent).toContain('100%')
    expect(view.media().parentElement!.style.transform).toBe('scale(1)')
    expect(view.media().parentElement!.parentElement!.style.height).toBe('1920px')
    await view.click('Zoom in')
    expect(view.media().parentElement!.style.transform).toBe('scale(1.1)')
    await view.click('Zoom out')
    expect(view.media().parentElement!.style.transform).toBe('scale(1)')
    await view.click('Fit')
    expect(Number(view.media().parentElement!.parentElement!.style.height.replace('px', ''))).toBeLessThanOrEqual(768)
    expect(view.media().dataset.html).toBe(initialHtml)
    expect(view.host.querySelector('[aria-label="Scrollable artwork preview"]')?.className).toContain('overflow-auto')
  })

  it('expands inside the window if the browser refuses native full screen', async () => {
    const view = await mount()
    await view.click('Full screen')
    await nextTick()
    expect(view.host.querySelector('section')?.className).toContain('fixed inset-0')
    await view.click('Exit full screen')
    expect(view.host.querySelector('section')?.className).not.toContain('fixed inset-0')
  })

  it('toggles sound without replacing the frame and ignores messages from other windows', async () => {
    const audioBoard = { ...board, layers: [...board.layers, { id: 9, type: 'audio', src: 'https://example.test/track.wav', startTime: 1, endTime: 4, volume: 0.5 }] } as ArtboardState
    const view = await mount({ custom_1080x1920: audioBoard })
    const frame = view.host.querySelector('iframe')!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    const html = view.media().dataset.html
    await view.click('Mute audio')
    expect(post).toHaveBeenLastCalledWith({ type: 'banner-preview-sound', muted: true }, '*')
    expect(view.media().dataset.html).toBe(html)
    await view.click('Unmute audio')
    expect(post).toHaveBeenLastCalledWith({ type: 'banner-preview-sound', muted: false }, '*')
    window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'banner-preview-audio', status: 'blocked' } }))
    await nextTick()
    expect(view.host.textContent).not.toContain('Sound was blocked')
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { type: 'banner-preview-audio', status: 'blocked' } }))
    await nextTick()
    expect(view.host.textContent).toContain('Sound was blocked')
  })

  it('uses Story for portrait and Feed for wide artwork without invented copy or engagement', async () => {
    const view = await mount()
    await view.click('Social preview')
    expect(view.host.textContent).toContain('Story / Reel mockup')
    expect(view.media().dataset.cta).toBe('false')
    await view.click('1920 × 1080')
    expect(view.host.textContent).toContain('Facebook Feed mockup')
    expect(Number(view.media().dataset.ratio)).toBeCloseTo(16 / 9)
    expect(view.media().dataset.placeholders).toBe('false')
    expect(view.media().dataset.html).toContain('paused: true')
    expect(view.host.textContent).toContain('Page identity, ad copy and final platform cropping are not included')
  })
})
