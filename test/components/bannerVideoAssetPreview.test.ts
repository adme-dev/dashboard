// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import AssetsPanel from '../../app/components/banner/AssetsPanel.client.vue'
import VideoAssetPreview from '../../app/components/banner/VideoAssetPreview.client.vue'

const first = { id: 'first', name: 'Showroom.mp4', url: '/showroom.mp4', mimeType: 'video/mp4', fileSize: 1024, thumbnailUrl: null }
const second = { id: 'second', name: 'Drive.mp4', url: '/drive.mp4', mimeType: 'video/mp4', fileSize: 1024, thumbnailUrl: '/drive.png' }

let app: Vue.App | undefined
let host: HTMLDivElement

function click(name: string) {
  const button = [...host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === name || button.textContent?.trim() === name)
  if (!button || button.disabled) throw new Error(`Unavailable button ${name}`)
  button.click()
  return Vue.nextTick()
}

async function mount(selectionOnly = false, visible = Vue.ref(true)) {
  const addLayer = vi.fn()
  const select = vi.fn()
  const pauseTimeline = vi.fn()
  vi.stubGlobal('useBannerStudio', () => ({
    state: { project: { id: 'project-1' }, duration: 10 },
    addLayer, activeFormat: Vue.ref({ w: 300, h: 250 }), activeLayers: Vue.ref([]),
    currentSlide: Vue.ref({ duration: 3 })
  }))
  vi.stubGlobal('useBannerTimeline', () => ({ pauseTimeline }))
  vi.stubGlobal('useBannerLayerImport', () => ({}))
  vi.stubGlobal('useAiImageGenerate', () => ({ openGenerate: vi.fn() }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('useFetch', () => ({
    data: Vue.ref({ assets: [first, second] }), status: Vue.ref('success'), error: Vue.ref(null)
  }))
  vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ assets: [] }))
  app = Vue.createApp({ setup: () => () => Vue.h(AssetsPanel, { mediaType: 'video', selectionOnly, visible: visible.value, onSelect: select }) })
  app.component('BannerVideoAssetPreview', VideoAssetPreview)
  app.component('UModal', Vue.defineComponent({
    props: ['open', 'title', 'description'],
    setup: (props, { slots }) => () => props.open
      ? Vue.h('section', { 'role': 'dialog', 'aria-label': props.title }, [props.description, slots.body?.(), slots.footer?.()])
      : null
  }))
  app.component('UButton', Vue.defineComponent({
    props: ['label', 'disabled'],
    setup: (props, { attrs, slots }) => () => Vue.h('button', { ...attrs, disabled: props.disabled }, props.label || slots.default?.())
  }))
  app.component('UAlert', Vue.defineComponent({
    props: ['title', 'actions'],
    setup: props => () => Vue.h('aside', [props.title, ...(props.actions || []).map((action: { label: string, onClick: () => void }) =>
      Vue.h('button', { onClick: action.onClick }, action.label))])
  }))
  for (const name of ['UFormField', 'UInput', 'UIcon', 'BannerMotorStackMediaPicker']) {
    app.component(name, { setup: (_, { slots }) => () => Vue.h('div', slots.default?.()) })
  }
  app.mount(host)
  await Vue.nextTick()
  return { addLayer, pauseTimeline, select }
}

beforeEach(() => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  host = document.createElement('div')
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(() => {
  app?.unmount()
  app = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Banner Studio video browser', () => {
  it('keeps video files unloaded until preview and preserves insertion as a separate action', async () => {
    const { addLayer, pauseTimeline } = await mount()
    expect(host.querySelector('video')).toBeNull()
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/drive.png')
    host.querySelector('img')!.dispatchEvent(new Event('error'))
    await Vue.nextTick()
    expect(host.querySelector('img')).toBeNull()
    await click('Play preview for Showroom.mp4')
    const player = host.querySelector('video')!
    expect(player.getAttribute('src')).toBe(first.url)
    expect(player.controls).toBe(true)
    expect(pauseTimeline).toHaveBeenCalledOnce()
    expect(addLayer).not.toHaveBeenCalled()
    await click('Insert video')
    expect(host.querySelector('video')).toBeNull()
    expect(player.pause).toHaveBeenCalled()
    expect(addLayer).toHaveBeenCalledOnce()
    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({ type: 'video', src: first.url, endTime: 3 }))
  })

  it('offers retry on playback failure and detaches the player when leaving the browser', async () => {
    const visible = Vue.ref(true)
    const { addLayer } = await mount(false, visible)
    await click('Play preview for Drive.mp4')
    host.querySelector('video')!.dispatchEvent(new Event('error'))
    await Vue.nextTick()
    expect(host.textContent).toContain('Could not play this video')
    await click('Retry preview')
    const player = host.querySelector('video')!
    expect(player.getAttribute('src')).toBe(second.url)
    visible.value = false
    await Vue.nextTick()
    expect(host.querySelector('video')).toBeNull()
    expect(player.pause).toHaveBeenCalled()
    expect(addLayer).not.toHaveBeenCalled()
  })

  it('plays before explicitly choosing a replacement and keeps the original card action', async () => {
    const { addLayer, select } = await mount(true)
    await click('Play preview for Showroom.mp4')
    expect(select).not.toHaveBeenCalled()
    await click('Choose video')
    expect(select).toHaveBeenLastCalledWith(first)
    await click('Choose Drive.mp4')
    expect(select).toHaveBeenLastCalledWith(second)
    expect(addLayer).not.toHaveBeenCalled()
  })
})
