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
async function settle() {
  for (let index = 0; index < 12; index++) await Promise.resolve()
  await Vue.nextTick()
}
function button(label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === label)
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
async function mount(options: { items?: typeof offer[], write?: ReturnType<typeof vi.fn> } = {}) {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  const selectedKit = Vue.ref(kit)
  const addOffer = vi.fn(() => 3)
  const write = options.write || vi.fn(async () => ({ asset: saved }))
  const api = vi.fn(async (url: string, params?: { method?: string }) => params?.method === 'POST' ? write(url, params) : { items: options.items || [offer] })
  vi.stubGlobal('$fetch', api)
  vi.stubGlobal('useBannerStudio', () => ({ state: Vue.reactive({ project: { clientId: null }, duration: 10 }),
    selectedLayer: Vue.ref(null), activeFormat: Vue.ref({ w: 300, h: 250 }), applyBrandKit: vi.fn(),
    updateLayer: vi.fn(), addLayer: vi.fn(), addMotorStackImageToAllLayouts: vi.fn(), addMotorStackOfferToAllLayouts: addOffer }))
  vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => false }))
  vi.stubGlobal('useBannerFonts', () => ({ fetchCustomFonts: vi.fn(), loadUsedFonts: vi.fn(), getFont: () => undefined }))
  vi.stubGlobal('useBannerProjectBrand', () => ({ brandKits: Vue.ref([]), kit: selectedKit, kitId: Vue.ref(kitId), loading: Vue.ref(false), error: Vue.ref(null), refresh: vi.fn() }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  host = document.createElement('div')
  document.body.append(host)
  app = Vue.createApp(BrandPanel, { initialTab: 'offers' })
  const slot = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h('div', slots.default?.()) })
  app.component('UButton', Vue.defineComponent({ props: ['label', 'disabled'], setup: (props, { slots, attrs }) => () => Vue.h('button', { ...attrs, disabled: props.disabled }, props.label || slots.default?.()) }))
  for (const name of ['UCard', 'UBadge', 'UTabs', 'UModal', 'UAlert', 'UIcon', 'BannerBrandStyleGuide', 'BannerMotorStackLogo', 'BannerBrandKitManager', 'BannerMotorStackMediaPicker']) app.component(name, slot)
  app.component('UFormField', Vue.defineComponent({ props: ['label'], setup: (props, { slots }) => () => Vue.h('div', { 'data-field': props.label }, slots.default?.()) }))
  app.component('UInput', Vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('input', { value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }) }))
  app.component('UAccordion', Vue.defineComponent({ props: ['items'], setup: props => () => Vue.h('div', props.items?.map((item: { content: string }) => item.content)) }))
  app.component('USelectMenu', Vue.defineComponent({ props: ['items'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('div', props.items?.map((item: { label: string, value: string }) => Vue.h('button', { 'data-value': item.value, 'onClick': () => emit('update:modelValue', item.value) }, item.label))) }))
  app.mount(host)
  await settle()
  return { api, write, addOffer, selectedKit }
}

afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.unstubAllGlobals()
})

it('shows the offer hero and imports it with editable copy and terms across layouts', async () => {
  const { api, addOffer } = await mount()
  expect(api).toHaveBeenCalledWith('/api/agency/banner-studio/motorstack/creative-catalog', { query: { kitId, kind: 'offers' } })
  expect(host.querySelector<HTMLImageElement>(`img[src="${offer.artworkPreviewUrl}"]`)).not.toBeNull()
  expect(host.textContent).toContain('Full terms apply.')
  button('Add offer and artwork to all layouts').click()
  await settle()
  expect(api).toHaveBeenCalledWith('/api/agency/banner-studio/motorstack/media', { method: 'POST', body: { brandId: 'subaru', assetId: offer.artworkAssetId } })
  expect(addOffer).toHaveBeenCalledWith(offer, kit, saved)
})

it('filters offers by model and grade words without importing while browsing', async () => {
  const other = { ...offer, model: 'Outback', title: 'Outback Sport offer', offer: 'Outback Sport offer', variant: 'Sport', artworkAssetId: 'b'.repeat(64) }
  const { write, addOffer } = await mount({ items: [offer, other] })
  host.querySelector<HTMLButtonElement>('[data-field="Offer model"] [data-value="Outback"]')!.click()
  await settle()
  expect(host.textContent).toContain('1 of 2 offers')
  expect(host.textContent).not.toContain('Forester offer')
  const input = host.querySelector<HTMLInputElement>('[data-field="Search offers"] input')!
  input.value = 'sport outback'
  input.dispatchEvent(new Event('input'))
  await settle()
  expect(host.textContent).toContain('Outback Sport offer')
  input.value = 'no-match'
  input.dispatchEvent(new Event('input'))
  await settle()
  expect(host.textContent).toContain('No offers match')
  expect(write).not.toHaveBeenCalled()
  expect(addOffer).not.toHaveBeenCalled()
})

it('retains artwork import errors and allows an explicit text-only recovery with all terms', async () => {
  const write = vi.fn().mockRejectedValue(new Error('Artwork unavailable'))
  const { addOffer } = await mount({ write })
  button('Add offer and artwork to all layouts').click()
  await settle()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Artwork unavailable')
  expect(addOffer).not.toHaveBeenCalled()
  button('Add offer text without artwork').click()
  await settle()
  expect(write).toHaveBeenCalledTimes(1)
  expect(addOffer).toHaveBeenCalledWith(offer, kit, undefined)
  expect(host.querySelector('[role="alert"]')).toBeNull()
})

it('lets a failed preview recover as text, while a normal import remains available', async () => {
  const { write, addOffer } = await mount()
  host.querySelector<HTMLImageElement>(`img[src="${offer.artworkPreviewUrl}"]`)!.dispatchEvent(new Event('error'))
  await settle()
  expect(button('Add offer and artwork to all layouts').disabled).toBe(false)
  button('Add offer text without artwork').click()
  await settle()
  expect(write).not.toHaveBeenCalled()
  expect(addOffer).toHaveBeenCalledWith(offer, kit, undefined)
})

it('blocks duplicate clicks and ignores an old import after changing brand kits', async () => {
  let finish!: (result: { asset: typeof saved }) => void
  const write = vi.fn(() => new Promise((resolve) => {
    finish = resolve
  }))
  const { addOffer, selectedKit } = await mount({ write })
  button('Add offer and artwork to all layouts').click()
  await settle()
  expect(button('Add offer and artwork to all layouts').disabled).toBe(true)
  button('Add offer and artwork to all layouts').click()
  expect(write).toHaveBeenCalledTimes(1)
  selectedKit.value = { ...kit, id: 'another-kit' }
  await settle()
  finish({ asset: saved })
  await settle()
  expect(addOffer).not.toHaveBeenCalled()
})
