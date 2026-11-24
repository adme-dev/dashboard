// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import { createApp, h, nextTick, reactive } from 'vue'
import Waveform from '~/components/banner/AudioWaveform.client.vue'
import Timeline from '~/components/banner/Timeline.client.vue'
import { audioWaveform, waveformBars } from '~/utils/banner-audio-waveform'

let app: ReturnType<typeof createApp> | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function decoder(channels = [new Float32Array([0, 0.2, 0.4, 0.8])]) {
  const close = vi.fn(async () => {})
  const decodeAudioData = vi.fn(async () => ({
    length: channels[0]!.length,
    duration: 4,
    numberOfChannels: channels.length,
    getChannelData: (index: number) => channels[index]!
  }))
  vi.stubGlobal('AudioContext', class { close = close; decodeAudioData = decodeAudioData })
  const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }))
  vi.stubGlobal('fetch', fetcher)
  return { close, decodeAudioData, fetcher }
}

it('shares decoding across layouts, includes both stereo channels and closes the context', async () => {
  const mock = decoder([new Float32Array([0, 0]), new Float32Array([0.2, -0.4])])
  const [first, second] = await Promise.all([audioWaveform('/stereo.wav'), audioWaveform('/stereo.wav')])
  expect(first).toBe(second)
  expect([...first.peaks]).toEqual([0.5, 1])
  expect(mock.fetcher).toHaveBeenCalledTimes(1)
  expect(mock.close).toHaveBeenCalledTimes(1)
})

it('releases a failed decoder and permits retry', async () => {
  const mock = decoder()
  mock.decodeAudioData.mockRejectedValueOnce(new Error('Invalid audio'))
  await expect(audioWaveform('/retry.wav')).rejects.toThrow('Invalid audio')
  expect(mock.close).toHaveBeenCalledTimes(1)
  await expect(audioWaveform('/retry.wav')).resolves.toHaveProperty('duration', 4)
  expect(mock.fetcher).toHaveBeenCalledTimes(2)
})

it('rejects failed downloads before creating a decoder', async () => {
  const mock = decoder()
  mock.fetcher.mockResolvedValueOnce({ ok: false, arrayBuffer: vi.fn() })
  await expect(audioWaveform('/missing.wav')).rejects.toThrow('Audio preview unavailable')
  expect(mock.decodeAudioData).not.toHaveBeenCalled()
})

it('preserves source timing through clip shortening, extension and looping', () => {
  const waveform = { duration: 4, peaks: new Float32Array([0.25, 0.5, 0.75, 1]) }
  expect(waveformBars(waveform, 2, 2)).toEqual([0.25, 0.5])
  expect(waveformBars(waveform, 8, 1, true, { mediaStart: 0, mediaEnd: 1 })).toEqual([0.25])
  expect(waveformBars(waveform, 4, 4, true, { mediaStart: 1, mediaEnd: 3 })).toEqual([0.5, 0.75, 0.5, 0.75])
  expect(waveformBars(waveform, 6, 6)).toEqual([0.25, 0.5, 0.75, 1, 0, 0])
  expect(waveformBars(waveform, 6, 6, true)).toEqual([0.25, 0.5, 0.75, 1, 0.25, 0.5])
  expect(waveformBars(waveform, 9, 3, true)).toEqual([0.75, 1, 1])
  expect(waveformBars({ duration: 1, peaks: new Float32Array([0]) }, 10, 2, true)).toEqual([0, 0])
})

it('redraws at device resolution after resizing and changing clip duration without decoding again', async () => {
  const mock = decoder()
  const fillRect = vi.fn()
  const scale = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ scale, fillRect } as unknown as CanvasRenderingContext2D)
  let resize!: (entries: unknown[]) => void
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: typeof resize) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  vi.stubGlobal('devicePixelRatio', 2)
  const props = reactive({ src: '/resizing.wav', span: 4, loop: false })
  const host = document.createElement('div')
  document.body.append(host)
  // Render the actual component, without editor state or playback engines.
  app = createApp({ render: () => h(Waveform, props) })
  app.mount(host)
  await audioWaveform(props.src)
  resize([{ contentRect: { width: 20, height: 28 } }])
  await nextTick()
  expect(host.querySelector('canvas')!.width).toBe(40)
  expect(scale).toHaveBeenLastCalledWith(2, 2)
  expect(fillRect).toHaveBeenCalledTimes(3)
  fillRect.mockClear()
  resize([{ contentRect: { width: 40, height: 28 } }])
  props.span = 8
  await nextTick()
  expect(host.querySelector('canvas')!.width).toBe(80)
  expect(fillRect).toHaveBeenCalledTimes(3)
  props.loop = true
  fillRect.mockClear()
  await nextTick()
  expect(fillRect).toHaveBeenCalledTimes(6)
  expect(mock.decodeAudioData).toHaveBeenCalledTimes(1)
  app.unmount()
  app = undefined
  expect(disconnect).toHaveBeenCalledOnce()
})

it('keeps the waveform visible beneath transparent audio controls in the actual timeline', async () => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  const { useBannerStudio } = await import('~/composables/useBannerStudio')
  const studio = useBannerStudio()
  studio.loadProject({ id: 'waveform-timeline', canvasData: { mrec: { layers: [{
    id: 1, name: 'Music', type: 'audio', src: '/timeline.wav', startTime: 0, endTime: 4,
    x: 0, y: 0, w: 0, h: 0, opacity: 1, zIndex: 1, loopAudio: true
  }] } } } as unknown as Parameters<typeof studio.loadProject>[0])
  vi.stubGlobal('useBannerStudio', () => studio)
  vi.stubGlobal('useBannerRealtime', () => ({ remoteLocks: new Map(), isLayerLockedByOther: () => false }))
  vi.stubGlobal('useBannerInspector', () => ({ inspectorTab: Vue.ref('properties') }))
  vi.stubGlobal('useBannerTimeline', () => ({ animationPreview: Vue.ref(null) }))
  vi.stubGlobal('useBannerLayerImport', () => ({ openFor: vi.fn() }))
  vi.stubGlobal('useAiLayerEdit', () => ({ isEditing: Vue.ref(false) }))
  vi.stubGlobal('useMergeLayers', () => ({ isMerging: Vue.ref(false) }))
  vi.stubGlobal('useAiImageGenerate', () => ({}))
  vi.stubGlobal('useBannerTimelineGroups', () => ({ canEditGroup: () => true }))
  vi.stubGlobal('useBannerPhaseDrag', () => ({ timingHint: Vue.ref('') }))
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Timeline)
  const passthrough = { setup: (_: unknown, { slots }: { slots: Record<string, () => unknown> }) => () => h('div', slots.default?.()) }
  for (const name of ['UButton', 'UIcon', 'UFormField', 'USelect', 'UPopover', 'UTooltip', 'BannerSlideStrip', 'BannerTimelineGroupBar', 'BannerVideoFilmstrip', 'BannerLayerContextMenu']) app.component(name, passthrough)
  app.component('BannerAudioWaveform', { props: ['src', 'span', 'loop'], setup: p => () => h('canvas', { 'data-loop': p.loop, 'data-span': p.span }) })
  app.component('BannerTimelineAnimationPicker', { setup: () => () => h('button', 'Sound') })
  app.mount(host)
  await nextTick()
  const audio = host.querySelector<HTMLElement>('[data-animation-phase="audio"]')!
  expect(audio.style.backgroundColor).toBe('transparent')
  expect(audio.textContent).toContain('Sound')
  const canvas = host.querySelector('canvas')!
  expect(canvas.dataset.loop).toBe('true')
  expect(canvas.dataset.span).toBe('4')
  expect(canvas.classList.contains('pointer-events-none')).toBe(true)
})
