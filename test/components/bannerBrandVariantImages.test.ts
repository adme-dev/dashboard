// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import BrandPanel from '../../app/components/banner/BrandPanel.vue'

const kitId = '6f8d4f20-3b5f-45e9-a086-e0024f74fafb'
const image = { id: 'a'.repeat(64), name: 'Renault Duster · evolution · white', mime: 'image/webp', importable: true, previewUrl: '/api/agency/banner-studio/motorstack/file?image' }
const saved = { id: 'saved-image', name: image.name, mimeType: image.mime, url: '/managed/duster.webp' }
let app: Vue.App | undefined
let host: HTMLDivElement

async function settle() {
  for (let index = 0; index < 12; index++) await Promise.resolve()
  await Vue.nextTick()
}

afterEach(() => {
  app?.unmount()
  app = undefined
  vi.unstubAllGlobals()
})

describe('brand kit vehicle images', () => {
  it('loads images for the selected MotorStack kit and adds a selected image to the canvas', async () => {
    for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
    const addMotorStackImageToAllLayouts = vi.fn(() => 3)
    const api = vi.fn(async (url: string, options: { method?: string, query?: { brandId: string }, body?: { brandId: string, assetId: string } }) => {
      if (options?.method === 'POST') return { asset: saved }
      return { brand: { id: 'renault', name: 'Renault' }, assets: [image], models: ['Duster'], warnings: [] }
    })
    vi.stubGlobal('$fetch', api)
    vi.stubGlobal('useBannerStudio', () => ({
      state: Vue.reactive({ project: { clientId: null }, duration: 10 }),
      selectedLayer: Vue.ref(null), activeFormat: Vue.ref({ w: 1200, h: 628 }),
      applyBrandKit: vi.fn(), updateLayer: vi.fn(), addLayer: vi.fn(), addMotorStackImageToAllLayouts
    }))
    vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => false }))
    vi.stubGlobal('useBannerFonts', () => ({ fetchCustomFonts: vi.fn(), loadUsedFonts: vi.fn(), getFont: () => undefined }))
    vi.stubGlobal('useBannerProjectBrand', () => ({
      brandKits: Vue.ref([]), kit: Vue.ref({ id: kitId, sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=renault', name: 'Renault', logos: [], colors: [], fonts: [] }),
      kitId: Vue.ref(kitId), loading: Vue.ref(false), error: Vue.ref(null), refresh: vi.fn()
    }))
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
    host = document.createElement('div')
    app = Vue.createApp(BrandPanel)
    app.component('UButton', Vue.defineComponent({ props: ['label'], setup: (props, { slots, attrs }) => () => Vue.h('button', attrs, props.label || slots.default?.()) }))
    app.component('UFormField', Vue.defineComponent({ props: ['label'], setup: (_, { slots }) => () => Vue.h('div', slots.default?.()) }))
    app.component('USelectMenu', Vue.defineComponent({ props: ['items'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('div', props.items?.map((item: { label: string, value: string }) => Vue.h('button', { 'data-value': item.value, 'onClick': () => emit('update:modelValue', item.value) }, item.label))) }))
    app.component('UTabs', Vue.defineComponent({ setup: () => () => Vue.h('span') }))
    app.component('BannerBrandStyleGuide', Vue.defineComponent({ setup: () => () => Vue.h('span') }))
    app.component('BannerMotorStackLogo', Vue.defineComponent({ setup: () => () => Vue.h('span', 'MOTORSTACK') }))
    app.component('BannerMotorStackMediaPicker', Vue.defineComponent({ props: ['open', 'initialBrandId', 'imagesOnly', 'addToCanvas'], emits: ['imported'], setup: (props, { emit }) => () => props.open ? Vue.h('button', { 'data-brand': props.initialBrandId, 'onClick': () => emit('imported', saved) }, 'Choose modal image') : null }))
    app.component('UModal', Vue.defineComponent({ setup: () => () => Vue.h('span') }))
    app.component('UIcon', Vue.defineComponent({ setup: () => () => Vue.h('span') }))
    app.mount(host)
    await settle()
    const variantsButton = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Variants')!
    variantsButton.click()
    await settle()
    expect(api).toHaveBeenCalledWith('/api/agency/banner-studio/motorstack/media', { query: { brandId: 'renault' } })
    expect(api.mock.calls.some(call => call[0].includes('creative-catalog'))).toBe(false)
    expect(host.textContent).toContain('Choose a model first.')
    Array.from(host.querySelectorAll<HTMLButtonElement>('[data-value="Duster"]')).at(-1)!.click()
    await settle()
    expect(host.textContent).toContain('Choose a paint colour to show matching images.')
    host.querySelector<HTMLButtonElement>('[data-value="white"]')!.click()
    await settle()
    expect(host.querySelector('img')?.getAttribute('src')).toBe(image.previewUrl)
    host.querySelector<HTMLButtonElement>(`[aria-label="Add ${image.name} to all layouts"]`)!.click()
    await settle()
    expect(api).toHaveBeenCalledWith('/api/agency/banner-studio/motorstack/media', { method: 'POST', body: { brandId: 'renault', model: 'Duster', assetId: image.id } })
    expect(addMotorStackImageToAllLayouts).toHaveBeenCalledWith(saved)
    const openModal = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Open large image browser')!
    openModal.click()
    await settle()
    expect(host.querySelector('[data-brand="renault"]')).not.toBeNull()
    host.querySelector<HTMLButtonElement>('[data-brand="renault"]')!.click()
    await settle()
    expect(addMotorStackImageToAllLayouts).toHaveBeenCalledTimes(2)
  })
})
