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
async function mount(previewCanvas: Record<string, ArtboardState> = canvas, identity: { clientName?: string | null, projectName?: string } = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(SavedPreview, { canvas: previewCanvas, ...identity })
  app.component('UButton', defineComponent({
    props: ['label', 'icon', 'variant', 'color', 'size'],
    setup: (props, { attrs }) => () => h('button', attrs, props.label)
  }))
  const media = defineComponent({
    props: ['html', 'width', 'height', 'htmlWidth', 'htmlHeight', 'showPlaceholders', 'creativeAspectRatio', 'showDefaultCta', 'pageName'],
    setup: (props, { attrs }) => () => h('div', { ...attrs, 'data-html': props.html, 'data-width': props.width || props.htmlWidth, 'data-ratio': props.creativeAspectRatio, 'data-placeholders': props.showPlaceholders, 'data-cta': props.showDefaultCta, 'data-page-name': props.pageName }, [h('iframe')])
  })
  app.component('BannerSavedViewerFrame', media)
  app.component('AdPreviewMetaFeedPreview', media)
  app.component('AdPreviewMetaStoryPreview', media)
  app.component('UFormField', { template: '<div><slot /></div>' })
  app.component('USlider', defineComponent({ props: ['modelValue', 'max'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('div', { 'role': 'slider', 'aria-valuenow': props.modelValue, 'aria-valuemax': props.max, 'onClick': () => emit('update:modelValue', 2.5) }) }))
  app.component('UAlert', { template: '<div />' })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await nextTick()
  let lastCommand = 0
  const report = async (state = 'paused', current = 0, commandId = lastCommand) => {
    const frame = host.querySelector('iframe')!
    const html = host.querySelector<HTMLElement>('[data-html]')!.dataset.html!
    const frameId = Number(html.match(/frameId: (\d+)/)![1])
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { type: 'banner-preview-playback', frameId, commandId, state, current, duration: 4, iteration: 1, repeat: 0 } }))
    await nextTick()
  }
  await report()
  const button = (label: string) => [...host.querySelectorAll('button')].find(el => el.textContent === label || el.getAttribute('aria-label') === label)!
  const click = async (label: string) => {
    button(label).click()
    await nextTick()
  }
  const command = (action: string) => {
    const frame = host.querySelector('iframe')!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    return async () => {
      const data = post.mock.calls.findLast(args => args[0]?.type === 'banner-preview-control')?.[0]
      expect(data.action).toBe(action)
      lastCommand = data.commandId
      return data
    }
  }
  return { host, button, click, report, command, media: () => host.querySelector<HTMLElement>('[data-html]')! }
}

describe('saved banner review workspace', () => {
  it('controls the existing frame and resets when changing sizes', async () => {
    const view = await mount()
    const html = view.media().dataset.html
    const play = view.command('play')
    await view.click('Play')
    const playMessage = await play()
    expect(view.media().dataset.html).toBe(html)
    await view.report('playing', 1, playMessage.commandId)
    const pause = view.command('pause')
    await view.click('Pause')
    const pauseMessage = await pause()
    await view.report('paused', 1, pauseMessage.commandId)
    expect(view.host.textContent).toContain('Paused')
    expect(view.media().dataset.html).toBe(html)
    await view.click('1200 × 1200')
    expect(view.media().dataset.width).toBe('1200')
    expect(view.media().dataset.html).toContain('paused: true')
    expect(view.host.textContent).toContain('0.0 / 0.0 s')
  })

  it('seeks without replacing the iframe and ignores earlier clock updates', async () => {
    const view = await mount()
    const html = view.media().dataset.html
    const seek = view.command('seek')
    view.host.querySelector<HTMLElement>('[role="slider"]')!.click()
    await nextTick()
    const message = await seek()
    expect(message.time).toBe(2.5)
    expect(view.host.textContent).toContain('2.5 / 4.0 s')
    await view.report('playing', 0.8, 0)
    expect(view.host.textContent).toContain('2.5 / 4.0 s')
    await view.report('paused', 2.5, message.commandId)
    expect(view.host.textContent).toContain('Paused')
    expect(view.media().dataset.html).toBe(html)
    const play = view.command('play')
    await view.click('Play')
    await play()
    expect(view.media().dataset.html).toBe(html)
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

  it('shows actual playback time, rejects unrelated windows and preserves the finished frame', async () => {
    const view = await mount()
    await view.click('Play')
    const frame = view.host.querySelector('iframe')!
    const frameId = Number(view.media().dataset.html!.match(/frameId: (\d+)/)![1])
    const message = { type: 'banner-preview-playback', frameId, commandId: 1, state: 'playing', current: 2.7, duration: 12, iteration: 1, repeat: -1 }
    window.dispatchEvent(new MessageEvent('message', { source: window, data: message }))
    await nextTick()
    expect(view.host.textContent).not.toContain('2.7 / 12.0 s')
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: message }))
    await nextTick()
    expect(view.host.textContent).toContain('Playing')
    expect(view.host.textContent).toContain('2.7 / 12.0 s')
    expect(view.host.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('2.7')
    const html = view.media().dataset.html
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { ...message, state: 'ended', current: 12, repeat: 0 } }))
    await nextTick()
    expect(view.host.textContent).toContain('Finished')
    expect(view.media().dataset.html).toBe(html)
    const replay = view.command('replay')
    await view.click('Replay')
    const replayMessage = await replay()
    await view.report('playing', 0, replayMessage.commandId)
    expect(view.host.textContent).not.toContain('Finished')
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: message }))
    await nextTick()
    expect(view.host.textContent).not.toContain('2.7 / 12.0 s')
  })

  it('uses the actual client in both social placements and falls back to the project name', async () => {
    const view = await mount(canvas, { clientName: 'GWS KIA', projectName: 'November offers' })
    await view.click('Social preview')
    expect(view.media().dataset.pageName).toBe('GWS KIA')
    await view.click('1200 × 1200')
    expect(view.media().dataset.pageName).toBe('GWS KIA')
    const unassigned = await mount(canvas, { projectName: 'Unassigned campaign' })
    await unassigned.click('Social preview')
    expect(unassigned.media().dataset.pageName).toBe('Unassigned campaign')
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
    expect(view.host.textContent).toContain('Platform account details, ad copy and final platform cropping are not included')
  })
})
