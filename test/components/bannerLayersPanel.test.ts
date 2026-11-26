// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import Panel from '../../app/components/banner/LayersPanel.client.vue'

let app: Vue.App
afterEach(() => { app?.unmount(); vi.unstubAllGlobals() })

it('selects a layer and reorders by buttons or drag using layer ids', async () => {
  const layers = Vue.ref([
    { id: 17, type: 'text', name: 'Headline' }, { id: 3, type: 'image', name: 'Car' }
  ])
  const state = Vue.reactive({ selectedLayerId: null as number | null, activeKey: 'mrec' })
  const moveSlideLayer = vi.fn()
  const selectSlide = vi.fn()
  const slide = { id: 'a', name: 'Offer' }
  for (const [key, value] of Object.entries(Vue)) vi.stubGlobal(key, value)
  vi.stubGlobal('useBannerStudio', () => ({ slideLayers: layers, moveSlideLayer, selectLayer: (id: number) => { state.selectedLayerId = id } }))
  vi.stubGlobal('useBannerSlides', () => ({ state, slides: Vue.ref([slide, { id: 'b', name: 'End' }]), currentSlide: Vue.ref(slide), selectSlide }))
  vi.stubGlobal('useBannerTimeline', () => ({ pauseTimeline: vi.fn() }))
  vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => false }))
  const host = document.createElement('div')
  app = Vue.createApp(Panel)
  app.component('UButton', { props: ['label'], template: '<button>{{ label }}</button>' })
  app.component('UIcon', { template: '<span />' })
  app.mount(host)
  const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
  expect(button('Move Headline forward').disabled).toBe(true)
  button('Move Car forward').click()
  expect(state.selectedLayerId).toBe(3)
  expect(moveSlideLayer).toHaveBeenCalledWith(3, 17)
  const [top, bottom] = host.querySelectorAll('li')
  const start = new Event('dragstart', { bubbles: true })
  Object.defineProperty(start, 'dataTransfer', { value: { setData: vi.fn() } })
  top!.dispatchEvent(start)
  bottom!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
  expect(moveSlideLayer).toHaveBeenLastCalledWith(17, 3)
  button('Next slide').click()
  expect(selectSlide).toHaveBeenCalledWith(1)
})
