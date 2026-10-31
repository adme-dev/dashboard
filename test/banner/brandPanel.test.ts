// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import BrandPanel from '../../app/components/banner/BrandPanel.vue'
import { bannerFontFamily } from '../../app/utils/banner-font-family'

const kits = [{ id: 'gwm', name: 'GWM Australia', clientId: null, logos: [{ name: 'GWM mark', url: '/logo.svg', variant: 'dark' }], colors: [{ role: 'primary', hex: '#e60012' }], fonts: [{ role: 'heading', family: 'Helvetica Now', weights: [700], assets: [{ id: '11111111-1111-4111-8111-111111111111', weight: 700 }] }] }]
const state = Vue.reactive({ project: { clientId: 'dealer' }, duration: 8 })
const selectedLayer = Vue.ref<{ id: number, type: string }>({ id: 1, type: 'text' })
const updateLayer = vi.fn(), addLayer = vi.fn(), applyBrandKit = vi.fn(), loadUsedFonts = vi.fn(), fetcher = vi.fn()
const locked = Vue.ref(false)
let app: Vue.App, host: HTMLElement
const button = Vue.defineComponent({ props: ['label'], setup: (props, { attrs, slots }) => () => Vue.h('button', attrs, slots.default?.() ?? props.label) })
const select = Vue.defineComponent({ props: ['modelValue', 'items'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('select', { value: props.modelValue, onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value) }, props.items.map((item: { value: string, label: string }) => Vue.h('option', { value: item.value }, item.label))) })
const tabs = Vue.defineComponent({ props: ['modelValue', 'items'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('nav', props.items.map((item: { value: string, label: string }) => Vue.h('button', { onClick: () => emit('update:modelValue', item.value) }, item.label))) })
const field = Vue.defineComponent({ props: ['label'], setup: (props, { slots }) => () => Vue.h('label', [props.label, slots.default?.()]) })
async function settle() {
  for (let i = 0;
    i < 5;
    i++) await Vue.nextTick()
}
async function choose() {
  const el = host.querySelector('select')!
  el.value = 'gwm'
  el.dispatchEvent(new Event('change'))
  await settle()
}
async function click(text: string) {
  const el = [...host.querySelectorAll('button')].find(button => button.textContent?.includes(text))!
  el.click()
  await settle()
}
beforeEach(async () => {
  vi.clearAllMocks()
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  vi.stubGlobal('useBannerStudio', () => ({ state, selectedLayer, activeFormat: Vue.ref({ w: 300, h: 250 }), updateLayer, addLayer, applyBrandKit }))
  vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => locked.value }))
  vi.stubGlobal('useBannerFonts', () => ({ fetchCustomFonts: async () => {}, loadUsedFonts, getFont: () => undefined }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  fetcher.mockResolvedValue(structuredClone(kits))
  vi.stubGlobal('$fetch', fetcher)
  locked.value = false
  selectedLayer.value = { id: 1, type: 'text' }
  host = document.createElement('div')
  document.body.append(host)
  app = Vue.createApp(BrandPanel)
  for (const [name, component] of Object.entries({ UButton: button, USelectMenu: select, UTabs: tabs, UFormField: field, UAlert: field, BannerBrandKitManager: Vue.defineComponent({ render: () => null }), UModal: Vue.defineComponent({ render: () => null }) })) app.component(name, component)
  app.mount(host)
  await settle()
})
afterEach(() => {
  app.unmount()
  host.remove()
  vi.unstubAllGlobals()
})
describe('brand sidebar asset interactions', () => {
  it('browses without applying a kit and renders its exact uploaded font face', async () => {
    expect(fetcher).toHaveBeenCalledWith('/api/agency/banner-studio/brand-kits', { query: { clientId: 'dealer' } })
    await choose()
    expect(applyBrandKit).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('Headline goes here')
    await click('Fonts')
    await click('Helvetica Now')
    expect(updateLayer).toHaveBeenCalledWith(1, { fontFamily: 'Helvetica Now', fontWeight: 700, fontAssetId: '11111111-1111-4111-8111-111111111111' })
    const preview = [...host.querySelectorAll('span')].find(el => el.textContent === 'Helvetica Now')!
    const expected = document.createElement('span')
    expected.style.fontFamily = bannerFontFamily('Helvetica Now', '11111111-1111-4111-8111-111111111111')
    expect(preview.style.fontFamily).toBe(expected.style.fontFamily)
    await click('Apply kit to all layouts')
    expect(applyBrandKit).toHaveBeenCalledOnce()
  })
  it('applies colours to the correct property and blocks locked or unsupported layers', async () => {
    await choose()
    await click('Colours')
    await click('#e60012')
    expect(updateLayer).toHaveBeenLastCalledWith(1, { color: '#e60012' })
    selectedLayer.value = { id: 2, type: 'rect' }
    await settle()
    await click('#e60012')
    expect(updateLayer).toHaveBeenLastCalledWith(2, { fillColor: '#e60012' })
    locked.value = true
    await settle()
    await click('#e60012')
    expect(updateLayer).toHaveBeenCalledTimes(2)
    selectedLayer.value = { id: 3, type: 'image' }
    locked.value = false
    await settle()
    await click('#e60012')
    expect(updateLayer).toHaveBeenCalledTimes(2)
  })
  it('adds a proportionally sized logo to the current layout', async () => {
    await choose()
    const image = host.querySelector('img')!
    Object.defineProperties(image, { naturalWidth: { value: 600 }, naturalHeight: { value: 200 } })
    await click('GWM mark')
    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({ src: '/logo.svg', isLogo: true, w: 120, h: 40, x: 90, y: 105, endTime: 8 }))
    expect(applyBrandKit).not.toHaveBeenCalled()
  })
  it('offers a retry after a failed refresh', async () => {
    fetcher.mockRejectedValueOnce(new Error('unavailable'))
    state.project.clientId = 'other'
    await settle()
    expect(host.textContent).toContain('Retry')
    await click('Retry')
    expect(host.textContent).not.toContain('Retry')
  })
})
