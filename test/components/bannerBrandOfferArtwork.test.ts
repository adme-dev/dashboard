// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import BrandPanel from '~/components/banner/BrandPanel.vue'

const kitId = '6f8d4f20-3b5f-45e9-a086-e0024f74fafb'
const kit = { id: kitId, name: 'Subaru Australia', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=subaru', logos: [], colors: [], fonts: [] }
const offer = { title: 'Forester offer', model: 'Forester', variant: null, price: 45990, priceLabel: null, offer: 'Forester offer',
  endDate: '2026-11-30', disclaimer: 'Full terms apply.', hasImage: true, artworkAssetId: 'a'.repeat(64),
  artworkPreviewUrl: '/api/agency/banner-studio/motorstack/file?brandId=subaru&assetId=' + 'a'.repeat(64) }
const saved = { id: 'saved-offer', name: 'Forester offer hero', mimeType: 'image/jpeg', url: '/managed/forester.jpg' }
let app: Vue.App | undefined
let host: HTMLElement

afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.unstubAllGlobals()
})

it('shows the offer hero and imports it with editable copy and terms across layouts', async () => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  const addOffer = vi.fn(() => 3)
  const api = vi.fn(async (_url: string, options?: { method?: string }) => options?.method === 'POST' ? { asset: saved } : { items: [offer] })
  vi.stubGlobal('$fetch', api)
  vi.stubGlobal('useBannerStudio', () => ({ state: Vue.reactive({ project: { clientId: null }, duration: 10 }),
    selectedLayer: Vue.ref(null), activeFormat: Vue.ref({ w: 300, h: 250 }), applyBrandKit: vi.fn(),
    updateLayer: vi.fn(), addLayer: vi.fn(), addMotorStackImageToAllLayouts: vi.fn(), addMotorStackOfferToAllLayouts: addOffer }))
  vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => false }))
  vi.stubGlobal('useBannerFonts', () => ({ fetchCustomFonts: vi.fn(), loadUsedFonts: vi.fn(), getFont: () => undefined }))
  vi.stubGlobal('useBannerProjectBrand', () => ({ brandKits: Vue.ref([]), kit: Vue.ref(kit), kitId: Vue.ref(kitId), loading: Vue.ref(false), error: Vue.ref(null), refresh: vi.fn() }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  host = document.createElement('div')
  document.body.append(host)
  app = Vue.createApp(BrandPanel, { initialTab: 'offers' })
  const slot = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h('div', slots.default?.()) })
  app.component('UButton', Vue.defineComponent({ props: ['label'], setup: (props, { slots, attrs }) => () => Vue.h('button', attrs, props.label || slots.default?.()) }))
  for (const name of ['UCard', 'UBadge', 'UFormField', 'UTabs', 'UModal', 'UAlert', 'UInput', 'UIcon', 'BannerBrandStyleGuide', 'BannerMotorStackLogo', 'BannerBrandKitManager', 'BannerMotorStackMediaPicker']) app.component(name, slot)
  app.component('UAccordion', Vue.defineComponent({ props: ['items'], setup: props => () => Vue.h('div', props.items?.map((item: { content: string }) => item.content)) }))
  app.component('USelectMenu', Vue.defineComponent({ setup: () => () => Vue.h('div') }))
  app.mount(host)
  for (let index = 0; index < 12; index++) await Promise.resolve()
  await Vue.nextTick()
  expect(api).toHaveBeenCalledWith('/api/agency/banner-studio/motorstack/creative-catalog', { query: { kitId, kind: 'offers' } })
  expect(host.querySelector<HTMLImageElement>(`img[src="${offer.artworkPreviewUrl}"]`)).not.toBeNull()
  expect(host.textContent).toContain('Full terms apply.')
  const addButton = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Add offer and artwork to all layouts'))!
  addButton.click()
  for (let index = 0; index < 12; index++) await Promise.resolve()
  await Vue.nextTick()
  expect(api).toHaveBeenCalledWith('/api/agency/banner-studio/motorstack/media', { method: 'POST', body: { brandId: 'subaru', assetId: offer.artworkAssetId } })
  expect(addOffer).toHaveBeenCalledWith(offer, kit, saved)
})
