// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { gsap } from 'gsap'
import Artboard from '../../app/components/banner/Artboard.client.vue'
import Text from '../../app/components/banner/layers/Text.client.vue'
import Image from '../../app/components/banner/layers/Image.client.vue'
import Rect from '../../app/components/banner/layers/Rect.client.vue'
import Bg from '../../app/components/banner/layers/Bg.client.vue'
import Button from '../../app/components/banner/layers/Button.client.vue'
import Video from '../../app/components/banner/layers/Video.client.vue'
import type { BannerProject, Layer } from '../../app/types/banner-studio'

vi.mock('../../app/composables/useBannerLetteringRepair', () => ({
  useBannerLetteringRepair: () => ({ previewLayers: { value: null } })
}))

for (const [key, value] of Object.entries(Vue)) vi.stubGlobal(key, value)
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const { useBannerTimeline } = await import('../../app/composables/useBannerTimeline')
const { useBannerInspector } = await import('../../app/composables/useBannerInspector')
const studio = useBannerStudio()
const cleanup: (() => void)[] = []
const blank = { template: '<span/>' }
beforeAll(() => {
  vi.stubGlobal('useBannerStudio', useBannerStudio)
  vi.stubGlobal('useBannerInspector', useBannerInspector)
  vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
  vi.stubGlobal('useBannerRealtime', () => ({ remoteLocks: Vue.ref(new Map()), isLayerLockedByOther: () => false }))
  vi.stubGlobal('useBannerLettering', () => ({ previewLayer: Vue.ref(null), dispose() {}, open() {} }))
  vi.stubGlobal('useBannerDrag', () => ({ dragState: Vue.reactive({}), guides: Vue.ref([]), onLayerMouseDown() {}, onResizeHandleMouseDown() {} }))
})
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn())
  gsap.globalTimeline.clear()
})

function layer(extra: Partial<Layer> = {}): Layer {
  return { id: 1, type: 'text', name: 'Artwork', text: 'Original heading', x: 10, y: 20, w: 100, h: 40, zIndex: 1, opacity: 0.5, startTime: 0, endTime: 5, animIn: 'none', animOut: 'none', ...extra } as Layer
}
async function mount(layers: Layer[], standalone?: Vue.Component) {
  studio.loadProject({ id: 'canvas-animation', canvasData: { mrec: { layers } } } as BannerProject)
  const host = document.createElement('div')
  document.body.append(host)
  const app = Vue.createApp({ render: () => standalone ? Vue.h(standalone, { layer: studio.activeLayers.value[0], isActive: true }) : Vue.h(Artboard, { formatKey: 'mrec', isActive: true }) })
  for (const [name, component] of Object.entries({ BannerLayersText: Text, BannerLayersImage: Image, BannerLayersRect: Rect, BannerLayersBg: Bg, BannerLayersButton: Button, BannerLayersVideo: Video, BannerLayersAudio: blank, UDropdownMenu: blank, UIcon: blank })) app.component(name, component)
  app.mount(host)
  cleanup.push(() => {
    app.unmount()
    host.remove()
  })
  await Vue.nextTick()
  return host
}

describe('actual Artboard animation rendering', () => {
  it('restores rendered native text after a browser DOM edit, blur and undo/redo', async () => {
    const host = await mount([layer()], Text)
    host.firstElementChild!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await Vue.nextTick()
    const editable = host.querySelector<HTMLElement>('[contenteditable="true"]')!
    editable.textContent = 'Original heading LOCAL PROOF'
    editable.dispatchEvent(new Event('blur'))
    await Vue.nextTick()
    expect(studio.activeLayers.value[0]!.text).toBe('Original heading LOCAL PROOF')
    studio.undo()
    await Vue.nextTick()
    expect(host.querySelector('[contenteditable]')!.textContent?.trim()).toBe('Original heading')
    studio.redo()
    await Vue.nextTick()
    expect(host.querySelector('[contenteditable]')!.textContent?.trim()).toBe('Original heading LOCAL PROOF')
  })

  it('discards uncommitted native DOM edits on Escape without creating history', async () => {
    const host = await mount([layer()], Text)
    host.firstElementChild!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await Vue.nextTick()
    const editable = host.querySelector<HTMLElement>('[contenteditable="true"]')!
    editable.textContent = 'Uncommitted wording'
    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Vue.nextTick()
    expect(host.querySelector('[contenteditable]')!.textContent?.trim()).toBe('Original heading')
    expect(studio.activeLayers.value[0]!.text).toBe('Original heading')
    expect(studio.canUndo.value).toBe(false)
  })

  it.each([true, false])('retains GSAP motion after reactive Artboard rerender (presence clipping %s)', async (clipToPresence) => {
    const host = await mount([layer({ opacity: 1, clipToPresence, motionPath: [{ x: 0, y: 0 }, { x: 120, y: 80 }], motionPathTweens: [{ startTime: 0, endTime: 5, pathStart: 0, pathEnd: 1, ease: 'none' }] })])
    studio.selectLayer(1)
    await Vue.nextTick()
    const timeline = useBannerTimeline()
    timeline.buildTimeline(host, studio.activeLayers.value)
    timeline.seekTo(2.5)
    const before = host.querySelector<HTMLElement>('#lyr-1')!.style.transform
    expect(before).toContain('60')
    await new Promise(resolve => setTimeout(resolve, 0))
    await Vue.nextTick()
    expect(host.querySelector<HTMLElement>('#lyr-1')!.style.transform).toBe(before)
    expect(host.querySelector<HTMLElement>('[data-testid="banner-selection"]')!.style.transform).toBe(before)
    timeline.seekTo(3.75)
    await Vue.nextTick()
    expect(host.querySelector<HTMLElement>('#lyr-1')!.style.transform).toContain('90')
  })

  it.each(['text', 'image', 'rect', 'bg', 'button', 'video'] as const)('applies %s opacity once in Artboard and preserves standalone opacity', async (type) => {
    const components = { text: Text, image: Image, rect: Rect, bg: Bg, button: Button, video: Video }
    const standalone = await mount([layer({ type })], components[type])
    expect((standalone.firstElementChild as HTMLElement).style.opacity).toBe('0.5')
    const host = await mount([layer({ type })])
    const timeline = useBannerTimeline()
    timeline.buildTimeline(host, studio.activeLayers.value)
    timeline.seekTo(2.5)
    await Vue.nextTick()
    const outer = host.querySelector<HTMLElement>('#lyr-1')!
    const inner = outer.firstElementChild as HTMLElement
    expect(Number(outer.style.opacity || 1) * Number(inner.style.opacity || 1)).toBe(0.5)
    timeline.stopTimeline()
    await Vue.nextTick()
    expect(Number(outer.style.opacity || 1) * Number(inner.style.opacity || 1)).toBe(0.5)
  })

  it('retains an editable mask outline while suppressing its artwork fill', async () => {
    const host = await mount([layer({ type: 'rect', isMask: true, maskTargetIds: [2], fillColor: '#00ff00' }), layer({ id: 2 })])
    const mask = host.querySelector<HTMLElement>('#lyr-1')!
    expect(mask.style.outline).toContain('dashed')
    expect(mask.children).toHaveLength(0)
  })
})
