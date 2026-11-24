// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import AudioInspector from '~/components/banner/inspector/Audio.vue'
import Inspector from '~/components/banner/Inspector.client.vue'
import TrimModal from '~/components/banner/AudioTrimModal.client.vue'
import TrimRange from '~/components/banner/AudioTrimRange.client.vue'
import type { BannerProject, Layer } from '~/types/banner-studio'

for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const { useBannerStudio } = await import('~/composables/useBannerStudio')
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn())
  vi.restoreAllMocks()
})
const layer = (id = 2): Layer => ({ id, name: 'Music', type: 'audio', src: '/track.wav', linkId: 'music', x: 0, y: 0, w: 1, h: 1, opacity: 1, zIndex: 2, startTime: 0, endTime: 8, animIn: 'none', animInDur: 0 })
function components(app: Vue.App) {
  app.component('UButton', { props: ['label', 'disabled'], setup: (p, { attrs, slots }) => () => Vue.h('button', { ...attrs, disabled: p.disabled }, p.label || slots.default?.()) })
  app.component('UFormField', { props: ['label'], setup: (p, { slots }) => () => Vue.h('label', [p.label, slots.default?.()]) })
  app.component('UInput', { props: ['modelValue'], emits: ['update:modelValue'], setup: (p, { attrs, emit }) => () => Vue.h('input', { ...attrs, value: p.modelValue, onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) }) })
  app.component('USlider', { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: (p, { attrs, emit }) => () => Vue.h('input', { ...attrs, type: 'range', value: p.modelValue, disabled: p.disabled, onInput: (e: Event) => emit('update:modelValue', Number((e.target as HTMLInputElement).value)) }) })
  app.component('UCheckbox', { props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => Vue.h('label', [p.label, Vue.h('input', { type: 'checkbox', checked: p.modelValue, disabled: p.disabled, onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).checked) })]) })
  app.component('UModal', { props: ['open'], setup: (p, { slots }) => () => p.open ? Vue.h('div', [slots.body?.(), slots.footer?.()]) : null })
  app.component('UAlert', { props: ['title'], setup: p => () => Vue.h('p', p.title) })
  app.component('UIcon', { render: () => null })
  app.component('BannerAudioWaveform', { render: () => null })
}
async function mount(component: Vue.Component, props: Record<string, unknown> = {}, register?: (app: Vue.App) => void) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = Vue.createApp({ render: () => Vue.h(component, props) })
  components(app)
  register?.(app)
  app.mount(host)
  cleanup.push(() => {
    app.unmount()
    host.remove()
  })
  await Vue.nextTick()
  const click = async (label: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label || b.getAttribute('aria-label') === label)
    expect(button, label).toBeTruthy()
    button!.click()
    await Vue.nextTick()
  }
  const change = async (label: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) || [...host.querySelectorAll('label')].find(l => l.textContent?.startsWith(label))?.querySelector('input')
    expect(input, label).toBeTruthy()
    input!.value = value
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await Vue.nextTick()
  }
  return { host, app, click, change }
}
function studio() {
  const studio = useBannerStudio()
  studio.loadProject({ id: 'audio-controls', canvasData: { mrec: { layers: [layer()] }, leader: { layers: [layer(3)] } } } as unknown as BannerProject)
  studio.selectLayer(2)
  const locked = Vue.ref(false)
  vi.stubGlobal('useBannerStudio', () => studio)
  vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => locked.value, sendLayerUpdate: vi.fn() }))
  vi.stubGlobal('useBannerTimeline', () => ({ pauseTimeline: vi.fn() }))
  vi.stubGlobal('useBannerFeeds', () => ({ feedsState: { feeds: [] } }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  return { studio, locked }
}
it('lowers volume through both the slider and percent field, persists zero, and supports undo across layouts', async () => {
  const { studio: s } = studio()
  const { change } = await mount(AudioInspector, {}, (app) => {
    for (const name of ['BannerInspectorPresence', 'BannerAudioTrimModal', 'BannerAssetsPanel']) app.component(name, { render: () => null })
  })
  await change('Audio volume', '25')
  expect(s.selectedLayer.value!.volume).toBe(0.25)
  expect(s.state.sets.leader.layers[0]!.volume).toBe(0.25)
  await change('Volume (%)', '0')
  expect(s.selectedLayer.value!.volume).toBe(0)
  s.undo()
  await Vue.nextTick()
  expect(s.activeLayers.value.find(l => l.id === 2)!.volume).toBe(0.25)
})
it('enables adjustable fades and blocks edits to locked audio', async () => {
  const { studio: s, locked } = studio()
  const { host, change } = await mount(AudioInspector, {}, (app) => {
    for (const name of ['BannerInspectorPresence', 'BannerAudioTrimModal', 'BannerAssetsPanel']) app.component(name, { render: () => null })
  })
  const fade = [...host.querySelectorAll('label')].find(l => l.textContent?.trim() === 'Fade in')!.querySelector('input')!
  fade.checked = true
  fade.dispatchEvent(new Event('change', { bubbles: true }))
  await Vue.nextTick()
  expect(s.selectedLayer.value!.audioFadeIn).toBe(0.5)
  await change('Fade in duration (seconds)', '1.5')
  expect(s.selectedLayer.value!.audioFadeIn).toBe(1.5)
  expect(s.state.sets.leader.layers[0]!.audioFadeIn).toBe(1.5)
  locked.value = true
  await Vue.nextTick()
  await change('Volume (%)', '10')
  expect(s.selectedLayer.value!.volume).toBe(1)
})
it('shows audio controls immediately and hides visual position, alignment and animation settings', async () => {
  studio()
  vi.stubGlobal('useBannerInspector', () => ({ inspectorTab: Vue.ref('effects') }))
  const { host } = await mount(Inspector, {}, (app) => {
    app.component('UTabs', { props: ['items'], setup: p => () => Vue.h('nav', p.items.map((i: { label: string }) => Vue.h('span', i.label))) })
    app.component('BannerInspectorAudio', { render: () => Vue.h('div', 'Audio controls') })
    for (const name of ['Position', 'Alignment', 'Mask', 'FeedBindings', 'Effects']) app.component(`BannerInspector${name}`, { render: () => Vue.h('div', `Visual ${name}`) })
  })
  expect(host.textContent).toContain('Audio controls')
  expect(host.textContent).not.toContain('Visual')
  expect(host.querySelector('nav')!.textContent).toBe('Audio')
})
it('moves the trim selection without changing its duration and supports keyboard resizing', async () => {
  const props = Vue.reactive({ 'src': '/track.wav', 'duration': 10, 'range': [2, 6], 'onUpdate:range': (value: number[]) => {
    props.range = value
  } })
  const { host } = await mount(TrimRange, props)
  const selection = host.querySelector('[aria-label="Move selected audio clip"]')!
  selection.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }))
  await Vue.nextTick()
  expect(props.range).toEqual([3, 7])
  host.querySelector('[aria-label="Trim audio start"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await Vue.nextTick()
  expect(props.range).toEqual([3.1, 7])
})
it('previews only the trimmed audio and applies the source range without mutating the layer on cancel', async () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  let frame!: FrameRequestCallback
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const applied = vi.fn()
  const props = Vue.reactive({ 'layer': { ...layer(), mediaStart: 3, mediaEnd: 7, volume: 0.25 }, 'open': true, 'onApply': applied, 'onUpdate:open': (value: boolean) => {
    props.open = value
  } })
  const { host, click } = await mount(TrimModal, props, app => app.component('BannerAudioTrimRange', { render: () => null }))
  const audio = host.querySelector('audio')!
  Object.defineProperty(audio, 'duration', { value: 60 })
  audio.dispatchEvent(new Event('loadedmetadata'))
  await Vue.nextTick()
  await click('Play selection')
  await Promise.resolve()
  expect(audio.currentTime).toBe(3)
  expect(audio.volume).toBe(0.25)
  audio.currentTime = 7
  frame(0)
  expect(pause).toHaveBeenCalled()
  await click('Apply trim')
  expect(applied).toHaveBeenCalledWith({ mediaStart: 3, mediaEnd: 7 })
  expect(props.open).toBe(false)
  expect(props.layer.startTime).toBe(0)
  expect(props.layer.endTime).toBe(8)
})

it('cancels a pending trim preview without applying edits or leaving audio playing', async () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  let finishPlay!: () => void
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => new Promise((resolve) => {
    finishPlay = resolve
  }))
  const applied = vi.fn()
  const props = Vue.reactive({
    'layer': layer(), 'open': true, 'onApply': applied,
    'onUpdate:open': (value: boolean) => {
      props.open = value
    }
  })
  const { host, click } = await mount(TrimModal, props, app => app.component('BannerAudioTrimRange', { render: () => null }))
  const audio = host.querySelector('audio')!
  Object.defineProperty(audio, 'duration', { value: 10 })
  audio.dispatchEvent(new Event('loadedmetadata'))
  await Vue.nextTick()
  await click('Play selection')
  await click('Cancel')
  const pauses = pause.mock.calls.length
  finishPlay()
  await Promise.resolve()
  await Vue.nextTick()
  expect(applied).not.toHaveBeenCalled()
  expect(props.layer.mediaStart).toBeUndefined()
  expect(pause.mock.calls.length).toBeGreaterThan(pauses)
})
