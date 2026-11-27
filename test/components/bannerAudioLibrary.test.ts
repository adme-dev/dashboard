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

async function mount(visible = Vue.ref(true), selectionOnly = false, initialUpload = upload) {
  const project = Vue.reactive({ id: 'project-1', clientId: null })
  const uploaded = Vue.ref(initialUpload)
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
    data: Vue.computed(() => ({ assets: uploaded.value.name.toLowerCase().includes(query.value.search.toLowerCase()) ? [uploaded.value] : [] })),
    status: Vue.ref('success'), error: Vue.ref(null), refresh: vi.fn()
  }))
  const request = vi.fn(async (_url, options) => {
    if (options.method === 'POST') return { asset: managed }
    if (options.method === 'PATCH') {
      uploaded.value = { ...uploaded.value, name: options.body.name }
      return uploaded.value
    }
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
  app.component('UModal', Vue.defineComponent({
    props: ['open', 'title'],
    setup: (props, { slots }) => () => props.open
      ? Vue.h('section', { 'role': 'dialog', 'aria-label': props.title }, [slots.body?.(), slots.footer?.()])
      : null
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
    const search = host.querySelector<HTMLInputElement>('input[placeholder="Search tracks…"]')!
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

  it('sends music filters with search, and keeps them out of other track categories', async () => {
    const { request } = await mount()
    clickButton('Music')
    await settle()
    const filters = host.querySelectorAll<HTMLSelectElement>('fieldset select')
    for (const [index, value] of ['Cinematic', 'Uplifting', 'instrumental', '15'].entries()) {
      filters[index]!.value = value
      filters[index]!.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await settle()
    expect(request).toHaveBeenLastCalledWith(endpoint, expect.objectContaining({
      query: expect.objectContaining({ kind: 'music', genre: 'Cinematic', mood: 'Uplifting', vocals: 'instrumental', maxDuration: 15, offset: 0 })
    }))
    clickButton('Clear filters')
    await settle()
    expect(request.mock.lastCall?.[1].query).toMatchObject({ genre: undefined, mood: undefined, vocals: undefined, maxDuration: undefined })
    clickButton('Voiceovers')
    await settle()
    expect(host.querySelector('fieldset select')).toBeNull()
    expect(request.mock.lastCall?.[1].query).not.toHaveProperty('genre')
  })

  it('shows actual playback position and seeks without adding the track', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const { addLayer } = await mount()
    clickButton('Play preview for Evening bed')
    await settle()
    const audio = host.querySelector('audio')!
    Object.defineProperty(audio, 'duration', { value: 15, configurable: true })
    audio.currentTime = 2
    audio.dispatchEvent(new Event('timeupdate'))
    await settle()
    const range = host.querySelector<HTMLInputElement>('input[type=range]')!
    expect(range.valueAsNumber).toBe(2)
    expect(range.max).toBe('15')
    range.value = '9'
    range.dispatchEvent(new Event('input'))
    expect(audio.currentTime).toBe(9)
    expect(addLayer).not.toHaveBeenCalled()
  })

  it('gives coded uploads a readable label and lets a designer save a real track name', async () => {
    const coded = { ...upload, name: '219ab67d913deb62ca080163feef7246d.mp3' }
    const { request, addLayer } = await mount(Vue.ref(true), false, coded)
    clickButton('Uploads')
    await settle()
    expect(host.textContent).toContain('Audio upload · 219AB6')
    expect(host.textContent).not.toContain(coded.name)
    clickButton('Rename Audio upload · 219AB6')
    await settle()
    const input = host.querySelector<HTMLInputElement>('[role=dialog] input')!
    expect(input.value).toBe('')
    input.value = 'Campaign background bed'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    clickButton('Save name')
    await settle()
    expect(request).toHaveBeenCalledWith('/api/agency/banner-studio/assets/upload-1', { method: 'PATCH', body: { name: 'Campaign background bed' } })
    expect(host.textContent).toContain('Campaign background bed')
    clickButton('Add Campaign background bed')
    expect(addLayer).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Campaign background bed', src: coded.url }))
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
