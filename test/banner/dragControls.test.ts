// @vitest-environment happy-dom
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import * as Vue from 'vue'
import NumericField from '../../app/components/banner/inspector/NumericField.vue'
import Artboard from '../../app/components/banner/Artboard.client.vue'
import TextLayer from '../../app/components/banner/layers/Text.client.vue'
import ImageLayer from '../../app/components/banner/layers/Image.client.vue'
import BgLayer from '../../app/components/banner/layers/Bg.client.vue'
import VideoLayer from '../../app/components/banner/layers/Video.client.vue'
import { useBannerTimeline as createTimelineController } from '../../app/composables/useBannerTimeline'
import type { Layer } from '../../app/types/banner-studio'

let studio: ReturnType<typeof import('../../app/composables/useBannerStudio')['useBannerStudio']>
let useKeyboard: typeof import('../../app/composables/useBannerKeyboard')['useBannerKeyboard']
let host: HTMLElement
let app: Vue.App | undefined
const locked = Vue.ref(false)
const UButton = Vue.defineComponent({ inheritAttrs: false, setup(_, { attrs, slots }) {
  return () => Vue.h('button', attrs, slots.default?.())
} })
const UInput = Vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup(props, { attrs, slots, emit }) {
  return () => Vue.h('div', {}, [slots.leading?.(), Vue.h('input', { ...attrs, value: props.modelValue, onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) })])
} })
const UFormField = Vue.defineComponent({ props: ['label'], setup(props, { slots }) {
  return () => Vue.h('label', {}, [props.label, slots.default?.()])
} })
const USlider = Vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue', 'change'], setup(props, { emit }) {
  return () => Vue.h('input', { type: 'range', value: props.modelValue, onInput: (e: Event) => emit('update:modelValue', Number((e.target as HTMLInputElement).value)), onChange: () => emit('change'), onKeydown: () => {
    emit('change')
    emit('update:modelValue', Number(props.modelValue) + 1)
  } })
} })
const blank = Vue.defineComponent({ setup() {
  return () => null
} })
function mount(component: Vue.Component, props = {}) {
  app = Vue.createApp(Vue.defineComponent({ setup() {
    useKeyboard({ showExportModal: Vue.ref(false) })
    return () => Vue.h(component, props)
  } }))
  for (const [name, impl] of Object.entries({ UButton, UInput, UFormField, USlider, UDropdownMenu: blank, BannerLayersText: TextLayer, BannerLayersRect: blank, BannerLayersImage: ImageLayer, BannerLayersBg: BgLayer, BannerLayersAudio: blank, BannerLayersVideo: VideoLayer, BannerLayersButton: blank }))
    app.component(name, impl)
  app.mount(host)
}
function pointer(type: string, x: number) {
  return new PointerEvent(type, { pointerId: 1, clientX: x, bubbles: true, button: 0 })
}
const layer = () => studio.selectedLayer.value!
beforeAll(async () => {
  for (const [key, value] of Object.entries(Vue))
    vi.stubGlobal(key, value)
  vi.stubGlobal('useBannerRealtime', () => ({ remoteLocks: Vue.ref(new Map()), isLayerLockedByOther: () => locked.value, sendLayerUpdate() {
  } }))
  vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
  vi.stubGlobal('useBannerInspector', () => ({ openEffects() {
  } }))
  vi.stubGlobal('useToast', () => ({ add() {
  } }))
  vi.stubGlobal('useBannerTimeline', () => ({ seekTo() {} }))
  useKeyboard = (await import('../../app/composables/useBannerKeyboard')).useBannerKeyboard
  const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
  const { useBannerDrag } = await import('../../app/composables/useBannerDrag')
  vi.stubGlobal('useBannerStudio', useBannerStudio)
  vi.stubGlobal('useBannerDrag', useBannerDrag)
  studio = useBannerStudio()
})
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  locked.value = false
  while (studio.canUndo.value)
    studio.undo()
  studio.state.activeKey = 'mrec'
  studio.state.setKeys = ['mrec']
  studio.state.selectedLayerId = 1
  studio.state.wsScale = 0.22
  studio.state.isPlaying = false
  studio.state.currentTime = 0
  studio.state.sets = { mrec: { layers: [{ id: 1, type: 'text', text: 'Test', x: 40, y: 40, w: 100, h: 80, zIndex: 1, bgColor: '#fff', opacity: 1 } as Layer] } }
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host.remove()
})
describe('padding gestures', () => {
  it.each(['paddingH', 'paddingV'] as const)('scrubs %s in both directions and commits one undo operation', async (property) => {
    mount(NumericField, { property, label: property, defaultValue: 10 })
    const handle = host.querySelector('button')!
    handle.dispatchEvent(pointer('pointerdown', 100))
    window.dispatchEvent(pointer('pointermove', 130))
    await Vue.nextTick()
    expect(layer()[property]).toBe(40)
    expect(studio.canUndo.value).toBe(false)
    window.dispatchEvent(pointer('pointermove', 90))
    window.dispatchEvent(pointer('pointerup', 90))
    await Vue.nextTick()
    expect(layer()[property]).toBe(0)
    studio.undo()
    expect(layer()[property]).toBeUndefined()
    expect(studio.canUndo.value).toBe(false)
    studio.redo()
    expect(layer()[property]).toBe(0)
  })
  it('commits a slider keyboard change even when change precedes the new value', async () => {
    mount(NumericField, { property: 'paddingH', label: 'Padding', defaultValue: 10 })
    host.querySelector('input[type="range"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await Vue.nextTick()
    expect(layer().paddingH).toBe(11)
    expect(studio.canUndo.value).toBe(true)
    studio.undo()
    expect(layer().paddingH).toBeUndefined()
  })
  it('ends a slider drag with no net change and permits another scrub', async () => {
    layer().paddingH = 10
    mount(NumericField, { property: 'paddingH', label: 'Padding', defaultValue: 10 })
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!
    slider.dispatchEvent(pointer('pointerdown', 100))
    slider.value = '30'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    slider.value = '10'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    // Reka emits no valueCommit when the final value matches its start.
    window.dispatchEvent(pointer('pointerup', 100))
    await Vue.nextTick()
    expect(studio.canUndo.value).toBe(false)
    host.querySelector('button')!.dispatchEvent(pointer('pointerdown', 100))
    window.dispatchEvent(pointer('pointermove', 120))
    window.dispatchEvent(pointer('pointerup', 120))
    expect(layer().paddingH).toBe(30)
    studio.undo()
    expect(layer().paddingH).toBe(10)
  })
  it('cancels slider preview on window blur', async () => {
    mount(NumericField, { property: 'paddingH', label: 'Padding', defaultValue: 10 })
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!
    slider.dispatchEvent(pointer('pointerdown', 100))
    slider.value = '30'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    window.dispatchEvent(new Event('blur'))
    await Vue.nextTick()
    expect(layer().paddingH).toBeUndefined()
    expect(studio.canUndo.value).toBe(false)
  })
  it('cancels a drag on pointer cancellation without saving it', async () => {
    mount(NumericField, { property: 'paddingH', label: 'Padding', defaultValue: 10 })
    host.querySelector('button')!.dispatchEvent(pointer('pointerdown', 100))
    window.dispatchEvent(pointer('pointermove', 150))
    window.dispatchEvent(pointer('pointercancel', 150))
    await Vue.nextTick()
    expect(layer().paddingH).toBeUndefined()
    expect(studio.canUndo.value).toBe(false)
  })
  it('blocks collaborative locks and supports keyboard adjustment', async () => {
    mount(NumericField, { property: 'paddingH', label: 'Padding', defaultValue: 10 })
    const handle = host.querySelector('button')!
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }))
    await Vue.nextTick()
    expect(layer().paddingH).toBe(20)
    expect(layer().x).toBe(40)
    studio.undo()
    expect(layer().paddingH).toBeUndefined()
    expect(studio.canUndo.value).toBe(false)
    studio.redo()
    locked.value = true
    await Vue.nextTick()
    handle.dispatchEvent(pointer('pointerdown', 100))
    window.dispatchEvent(pointer('pointermove', 150))
    window.dispatchEvent(pointer('pointerup', 150))
    expect(layer().paddingH).toBe(20)
  })
  it('renders explicit zero padding without fallback spacing', async () => {
    layer().paddingH = 0
    layer().paddingV = 0
    mount(TextLayer, { layer: layer(), isActive: true })
    await Vue.nextTick()
    expect((host.firstElementChild as HTMLElement).style.paddingLeft).toBe('0px')
    expect((host.firstElementChild as HTMLElement).style.paddingTop).toBe('0px')
  })
})
describe('canvas resize handles', () => {
  it.each(['video', 'bg'] as const)('silently scrubs inactive %s media forward and backward', async (type) => {
    studio.state.sets.mrec!.playback = { duration: 10, loopCount: 0 }
    studio.state.sets.mrec!.layers = [{ id: 1, type, srcType: 'video', src: '/test.mp4',
      x: 0, y: 0, w: 300, h: 250, zIndex: 1, opacity: 1, startTime: 2, endTime: 8
    } as Layer]
    mount(Artboard, { formatKey: 'mrec', isActive: false })
    await Vue.nextTick()
    const video = host.querySelector('video')!
    Object.defineProperty(video, 'duration', { configurable: true, value: 4 })
    const play = vi.spyOn(video, 'play')
    const pause = vi.spyOn(video, 'pause')
    for (const [time, expected] of [[5, 3], [9, 4], [3, 1], [1, 0]]) {
      studio.state.currentTime = time!
      await Vue.nextTick()
      expect(video.currentTime).toBe(expected)
      expect(video.paused).toBe(true)
    }
    expect(pause).toHaveBeenCalledTimes(4)
    expect(play).not.toHaveBeenCalled()
  })
  it('keeps the previous active layout synchronized after the editor switches its timeline owner', async () => {
    const imported = {
      playback: { duration: 10, loopCount: 0 },
      layers: [{ id: 1, type: 'image', name: 'Texture', x: 0, y: 0, w: 100, h: 100,
        zIndex: 1, opacity: 0.15, startTime: 0, endTime: 10, clipToPresence: true,
        keyframes: { opacity: [{ time: 0, value: 0 }, { time: 4, value: 0.4, easing: 'none' }, { time: 10, value: 0.4 }] } } as Layer]
    }
    studio.state.sets = { mrec: JSON.parse(JSON.stringify(imported)), leader: JSON.parse(JSON.stringify(imported)) }
    studio.state.setKeys = ['mrec', 'leader']
    const controller = createTimelineController()
    let rebuilding: Promise<void> = Promise.resolve()
    const wrapper = Vue.defineComponent({ setup() {
      async function rebuild() {
        await Vue.nextTick()
        await new Promise(resolve => setTimeout(resolve, 10))
        controller.buildTimeline(host.querySelector<HTMLElement>(`[data-board="${studio.state.activeKey}"]`)!, studio.activeLayers.value)
      }
      // StudioEditor releases the master in pre-flush, before overview ownership.
      Vue.watch(() => studio.state.activeKey, () => {
        controller.destroyTimeline()
        rebuilding = rebuild()
      })
      Vue.onMounted(() => {
        rebuilding = rebuild()
      })
      Vue.onBeforeUnmount(controller.destroyTimeline)
      return () => Vue.h('div', ['mrec', 'leader'].map(key => Vue.h(Artboard, { key, 'data-board': key, 'formatKey': key, 'isActive': studio.state.activeKey === key })))
    } })
    mount(wrapper)
    await rebuilding
    studio.state.activeKey = 'leader'
    await Vue.nextTick()
    await rebuilding
    controller.seekTo(2)
    await Vue.nextTick()
    const previous = host.querySelector<HTMLElement>('[data-board="mrec"] #lyr-1')!
    const firstOpacity = Number(previous.style.opacity)
    controller.seekTo(4)
    await Vue.nextTick()
    expect(Number(previous.style.opacity)).toBeCloseTo(0.4)
    expect(firstOpacity).toBeLessThan(Number(previous.style.opacity))
  })
  it('renders inactive imported layouts at the shared playhead with opacity and presence intact', async () => {
    studio.state.sets.mrec!.playback = { duration: 10, loopCount: 0 }
    studio.state.sets.mrec!.layers = [{
      id: 1, type: 'image', name: 'Background texture', x: 0, y: 0, w: 300, h: 250,
      zIndex: 1, opacity: 0.15, src: '/texture.png', startTime: 0, endTime: 5,
      clipToPresence: true,
      keyframes: { opacity: [{ time: 0, value: 0.15 }, { time: 5, value: 0.15 }] }
    } as Layer, {
      id: 2, type: 'image', name: 'Second slide', x: 0, y: 0, w: 100, h: 100,
      zIndex: 2, opacity: 1, startTime: 5, endTime: 10, clipToPresence: true,
      keyframes: { opacity: [{ time: 5, value: 0 }, { time: 6, value: 1 }, { time: 10, value: 1 }] }
    } as Layer]
    mount(Artboard, { formatKey: 'mrec', isActive: false })
    await Vue.nextTick()
    const element = host.querySelector<HTMLElement>('#lyr-1')!
    expect(host.querySelector<HTMLElement>('#lyr-2')!.style.visibility).toBe('hidden')
    studio.state.currentTime = 3.1
    await Vue.nextTick()
    expect(Number(element.style.opacity)).toBeCloseTo(0.15)
    expect(element.style.visibility).toBe('visible')
    studio.state.currentTime = 6
    await Vue.nextTick()
    expect(element.style.visibility).toBe('hidden')
    studio.state.currentTime = 1
    await Vue.nextTick()
    expect(element.style.visibility).toBe('visible')
    expect(Number(element.style.opacity)).toBeCloseTo(0.15)
  })
  it('retains timeline transforms when the imported playhead updates Vue', async () => {
    Object.assign(layer(), { clipToPresence: true, startTime: 0, endTime: 10 })
    mount(Artboard, { formatKey: 'mrec', isActive: true })
    const element = host.querySelector<HTMLElement>('#lyr-1')!
    element.style.transform = 'translate(20px, 0px) scale(4)'
    studio.state.currentTime = 5.1
    await Vue.nextTick()
    expect(element.style.transform).toBe('translate(20px, 0px) scale(4)')
  })
  it('keeps handles 12 screen pixels at low zoom and outside clipped/overlapping layers', async () => {
    studio.state.sets.mrec!.layers.push({ id: 2, type: 'rect', x: 100, y: 60, w: 100, h: 100, zIndex: 20000 } as Layer)
    mount(Artboard, { formatKey: 'mrec', isActive: true })
    await Vue.nextTick()
    const overlay = host.querySelector('[data-testid="banner-selection"]') as HTMLElement
    expect(overlay.parentElement).toBe(host.firstElementChild)
    expect(Number(overlay.style.zIndex)).toBeGreaterThan(20000)
    const handles = overlay.querySelectorAll<HTMLElement>('[data-resize-handle]')
    expect(handles).toHaveLength(8)
    for (const handle of handles)
      expect(parseFloat(handle.style.width) * studio.state.wsScale).toBeCloseTo(12)
  })
  it('follows retained animation geometry after a timeline seek', async () => {
    mount(Artboard, { formatKey: 'mrec', isActive: true })
    await Vue.nextTick()
    const element = host.querySelector<HTMLElement>('#lyr-1')!
    element.style.transform = 'translate(60px, 20px) rotate(15deg) scale(0.8)'
    element.style.transformOrigin = '0% 100%'
    await new Promise(resolve => setTimeout(resolve, 10))
    await Vue.nextTick()
    const overlay = host.querySelector<HTMLElement>('[data-testid="banner-selection"]')!
    expect(overlay.style.transform).toBe(element.style.transform)
    expect(overlay.style.transformOrigin).toBe(element.style.transformOrigin)
    element.style.transform = ''
    await new Promise(resolve => setTimeout(resolve, 10))
    await Vue.nextTick()
    expect(overlay.style.transform).toBe('')
  })
  it.each(['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'])('resizes %s at canvas zoom and supports undo', async (handle) => {
    mount(Artboard, { formatKey: 'mrec', isActive: true })
    await Vue.nextTick()
    host.querySelector(`[data-resize-handle="${handle}"]`)!.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 122, clientY: 111 }))
    await Vue.nextTick()
    expect(layer().w).toBe(handle.includes('l') ? 10 : handle.includes('r') ? 200 : 100)
    expect(layer().h).toBe(handle.includes('t') ? 30 : handle.includes('b') ? 130 : 80)
    window.dispatchEvent(new MouseEvent('mouseup'))
    studio.undo()
    expect(layer().w).toBe(100)
    expect(layer().h).toBe(80)
    expect(studio.canUndo.value).toBe(false)
  })
})
