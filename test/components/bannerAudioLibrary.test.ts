// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import AssetsPanel from '../../app/components/banner/AssetsPanel.client.vue'
import AudioTrackList from '../../app/components/banner/AudioTrackList.client.vue'

const endpoint = '/api/agency/banner-studio/assets/audio-studio'
const music = { id: 'music-1', kind: 'music', title: 'Evening bed', streamUrl: '/stream/music', durationSec: 15, isInstrumental: true }
const voice = { id: 'voice-1', kind: 'voiceover', title: 'Offer read', streamUrl: '/stream/voice', durationSec: 7.4 }
const upload = { id: 'upload-1', name: 'Local mix.mp3', mimeType: 'audio/mpeg', fileSize: 1024, url: '/stream/upload' }
const managed = { ...upload, name: music.title, url: 'https://app.xeroflow.io/api/public/banner-assets/v1.managed.track' }

let app: Vue.App
let host: HTMLDivElement

async function settle() {
  for (let index = 0; index < 8; index++) await Vue.nextTick()
}

function clickButton(label: string) {
  const button = [...host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label || button.textContent?.trim() === label)
  if (!button || button.disabled) throw new Error(`Unavailable button ${label}`)
  button.click()
}

async function mount(visible = Vue.ref(true), selectionOnly = false) {
  const project = Vue.reactive({ id: 'project-1', clientId: null })
  const addLayer = vi.fn()
  const select = vi.fn()
  const pauseTimeline = vi.fn()
  vi.stubGlobal('useBannerStudio', () => ({
    state: Vue.reactive({ project, activeKey: 'sq', duration: 20, isPlaying: false }),
    activeFormat: Vue.ref({ w: 1080, h: 1080 }), activeLayers: Vue.ref([]),
    currentSlide: Vue.ref({ id: 'slide-1', duration: 12 }), addLayer
  }))
  vi.stubGlobal('useBannerTimeline', () => ({ pauseTimeline }))
  vi.stubGlobal('useBannerLayerImport', () => ({}))
  vi.stubGlobal('useAiImageGenerate', () => ({ openGenerate: vi.fn() }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('useFetch', (_url: string, { query }: { query: Vue.ComputedRef<{ search: string }> }) => ({
    data: Vue.computed(() => ({ assets: upload.name.toLowerCase().includes(query.value.search.toLowerCase()) ? [upload] : [] })),
    status: Vue.ref('success'), error: Vue.ref(null)
  }))
  const request = vi.fn(async (_url, options) => {
    if (options.method === 'POST') return { asset: managed }
    const { kind, search } = options.query
    return { assets: [music, voice].filter(track => (!kind || kind === track.kind) && track.title.toLowerCase().includes(search.toLowerCase())) }
  })
  vi.stubGlobal('$fetch', request)
  app = Vue.createApp({ setup: () => () => Vue.h(AssetsPanel, { mediaType: 'audio', visible: visible.value, selectionOnly, onSelect: select }) })
  app.component('BannerAudioTrackList', AudioTrackList)
  app.component('UButton', Vue.defineComponent({
    props: ['label', 'disabled'],
    setup: (props, { attrs, slots }) => () => Vue.h('button', { ...attrs, disabled: props.disabled }, props.label || slots.default?.())
  }))
  app.component('UInput', Vue.defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup: (props, { attrs, emit }) => () => Vue.h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: event => emit('update:modelValue', (event.target as HTMLInputElement).value)
    })
  }))
  for (const name of ['UFormField', 'UIcon', 'UAlert', 'BannerMotorStackMediaPicker']) {
    app.component(name, { setup: (_, { slots }) => () => Vue.h('div', slots.default?.()) })
  }
  app.mount(host)
  await settle()
  return { request, addLayer, pauseTimeline, project, select }
}

beforeEach(() => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  host = document.createElement('div')
})

afterEach(() => {
  app.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Banner Studio audio tracks', () => {
  it('auditions one track without inserting and stops playback when the sidebar is hidden', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const visible = Vue.ref(true)
    const { request, addLayer, pauseTimeline } = await mount(visible)
    const player = host.querySelector('audio')!
    expect(player.hasAttribute('src')).toBe(false)
    clickButton('Play preview for Evening bed')
    await settle()
    expect(player.getAttribute('src')).toBe('/stream/music')
    expect(pauseTimeline).toHaveBeenCalledOnce()
    clickButton('Play preview for Local mix.mp3')
    await settle()
    expect(player.getAttribute('src')).toBe('/stream/upload')
    expect(play).toHaveBeenCalledTimes(2)
    expect(pause).toHaveBeenCalledOnce()
    expect(addLayer).not.toHaveBeenCalled()
    expect(request.mock.calls.every(([, options]) => !options.method)).toBe(true)
    visible.value = false
    await settle()
    expect(player.hasAttribute('src')).toBe(false)
    expect(pause).toHaveBeenCalledTimes(2)
  })

  it('combines category and search and inserts the managed source in different jobs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { request, addLayer, project } = await mount()
    clickButton('Music')
    await settle()
    expect(host.textContent).toContain('Instrumental · 15s')
    expect(host.textContent).not.toContain(voice.title)
    expect(host.textContent).not.toContain(upload.name)
    const search = host.querySelector<HTMLInputElement>('input[placeholder="Search media..."]')!
    search.value = 'Evening'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(250)
    await settle()
    expect(request).toHaveBeenLastCalledWith(endpoint, expect.objectContaining({ query: expect.objectContaining({ kind: 'music', search: 'Evening', offset: 0 }) }))
    clickButton('Add Evening bed')
    await settle()
    expect(request).toHaveBeenLastCalledWith(endpoint, { method: 'POST', body: { projectId: 'project-1', assetId: music.id } })
    expect(addLayer).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'audio', src: managed.url, startTime: 0, endTime: 12 }))

    project.id = 'project-2'
    await settle()
    clickButton('Add Evening bed')
    await settle()
    expect(request).toHaveBeenLastCalledWith(endpoint, { method: 'POST', body: { projectId: 'project-2', assetId: music.id } })
    expect(addLayer).toHaveBeenCalledTimes(2)
    expect(addLayer).toHaveBeenLastCalledWith(expect.objectContaining({ src: managed.url }))
  })

  it('allows choosing an Audio Studio track for an existing audio layer', async () => {
    const { select, addLayer } = await mount(Vue.ref(true), true)
    clickButton('Choose Evening bed')
    await settle()
    expect(select).toHaveBeenCalledWith(managed)
    expect(addLayer).not.toHaveBeenCalled()
  })

  it('adds both Audio Studio tracks and uploads as soundtracks when asked', async () => {
    const { addLayer } = await mount()
    clickButton('Add across slides')
    await settle()
    clickButton('Add Evening bed')
    await settle()
    expect(addLayer).toHaveBeenLastCalledWith(expect.objectContaining({ audioAcrossSlides: true, src: managed.url }))
    clickButton('Add Local mix.mp3')
    expect(addLayer).toHaveBeenLastCalledWith(expect.objectContaining({ audioAcrossSlides: true, src: upload.url }))
  })
})
