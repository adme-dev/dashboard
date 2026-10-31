// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import Manager from '../../app/components/banner/BrandKitManager.vue'
import type { BannerBrandKit, BrandKitExtraction } from '../../app/types/banner-studio'
import type { CustomFont } from '../../app/composables/useBannerFonts'

const clientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherClientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const face = (weight: number): CustomFont => ({ id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(weight).padStart(12, '0')}`, clientId, sha256: 'a'.repeat(64), name: 'Brand', tags: ['font', `weight:${weight}`, 'format:woff2'], mimeType: 'font/woff2', fileSize: 12, url: '/font.woff2', r2Key: 'font', uploadedBy: 'user', createdAt: '' })
let app: Vue.App | undefined
let host: HTMLElement
const settle = async () => {
  await Vue.nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await Vue.nextTick()
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.unstubAllGlobals()
})

async function mount(options: { fonts?: CustomFont[], kits?: BannerBrandKit[], extraction?: BrandKitExtraction } = {}) {
  const fonts = Vue.ref(options.fonts || [face(325), face(950)])
  const upload = vi.fn(async () => face(700))
  const refreshFonts = vi.fn(async () => fonts.value)
  const api = vi.fn(async (url: string, opts?: { method?: string, body?: unknown }) => {
    if (url.endsWith('/extract')) return options.extraction || { name: 'Detected brand', sourceUrl: 'https://brand.example/', colors: [], logos: [], fonts: [{ role: 'heading', family: 'Private Brand Face', weights: [400] }], draft: true, warnings: ['Font names were detected; upload licensed font files.'] }
    if (opts?.method) return {}
    return url === '/api/agency/clients' ? [{ id: clientId, name: 'Brand client' }, { id: otherClientId, name: 'Other client' }] : options.kits || []
  })
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  vi.stubGlobal('$fetch', api)
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('useBannerFonts', (scope: () => string | null) => ({ customFonts: Vue.computed(() => fonts.value.filter(face => !face.clientId || face.clientId === scope())), allFonts: Vue.ref([{ family: 'Arial', category: 'sans-serif', weights: [400, 700] }]), refreshCustomFonts: refreshFonts, uploadCustomFont: upload }))
  host = document.createElement('div')
  document.body.append(host)
  app = Vue.createApp(Manager, { clientId })
  app.component('BannerMotorStackBrandKitImport', Vue.defineComponent({ props: ['open'], emits: ['complete'], setup: (props, { emit }) => () => props.open ? Vue.h('button', { onClick: () => emit('complete') }, 'Finish fixture import') : null }))
  app.component('UButton', Vue.defineComponent({ props: ['label', 'disabled'], setup: (props, { attrs, slots }) => () => Vue.h('button', { ...attrs, disabled: props.disabled }, props.label || slots.default?.()) }))
  app.component('UFormField', Vue.defineComponent({ props: ['label'], setup: (props, { slots }) => () => Vue.h('section', { 'data-field': props.label }, slots.default?.()) }))
  const select = Vue.defineComponent({ props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('div', { 'data-current': props.modelValue }, props.items.map((item: { value: string | number, label: string }) => Vue.h('button', { 'data-value': item.value, 'disabled': props.disabled, 'onClick': () => emit('update:modelValue', item.value) }, item.label))) })
  app.component('USelectMenu', select)
  app.component('USelect', select)
  app.component('UInput', Vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { attrs, emit }) => () => Vue.h('input', { ...attrs, value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }) }))
  app.component('UFileUpload', Vue.defineComponent({ emits: ['update:modelValue'], setup: (_props, { emit }) => () => Vue.h('button', { onClick: () => emit('update:modelValue', new File(['font'], 'brand.woff2')) }, 'Choose font fixture') }))
  const overlay = Vue.defineComponent({ props: ['open'], setup: (props, { slots }) => () => props.open ? Vue.h('div', slots.content?.()) : null })
  app.component('USlideover', overlay)
  app.component('UModal', overlay)
  app.component('UAlert', Vue.defineComponent({ props: ['description'], setup: (props, { slots }) => () => Vue.h('aside', [props.description, slots.default?.()]) }))
  for (const name of ['UIcon', 'UTooltip', 'UDropdownMenu', 'BannerBrandKitPreview', 'BannerBrandKitIdentity', 'BannerBrandStyleGuide', 'USwitch', 'UTextarea', 'UTabs', 'UBadge']) app.component(name, Vue.defineComponent({ setup: (_props, { slots }) => () => Vue.h('div', slots.default?.()) }))
  app.mount(host)
  await settle()
  if (!options.kits) {
    button('New kit').click()
    await settle()
  }
  return { api, upload, refreshFonts }
}
function button(label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label)!
}
function input(field: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(`[data-field="${field}"] input`)!
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('brand kit font form', () => {
  it('starts a new extracted draft with empty fonts and colours when none were detected', async () => {
    const { api } = await mount({ kits: [], extraction: { name: 'Empty source', sourceUrl: 'https://brand.example/', fonts: [], colors: [], logos: [], warnings: ['No font families detected.'] } })
    const url = host.querySelector<HTMLInputElement>('input[placeholder="leapmotor.com.au"]')!
    url.value = 'https://brand.example/'
    url.dispatchEvent(new Event('input', { bubbles: true }))
    button('Extract').click()
    await settle()
    expect(host.textContent).toContain('No font families detected.')
    expect(api.mock.calls.some(call => call[0] === '/api/agency/banner-studio/brand-kits' && call[1]?.method === 'POST')).toBe(false)
    button('Create kit').click()
    await settle()
    const payload = api.mock.calls.find(call => call[0] === '/api/agency/banner-studio/brand-kits' && call[1]?.method === 'POST')?.[1]?.body as { fonts: unknown[], colors: unknown[] }
    expect(payload.fonts).toEqual([])
    expect(payload.colors).toEqual([])
  })
  it('preserves an open kit when extraction is empty and explains which values were kept', async () => {
    const { api } = await mount({ extraction: { name: 'Empty source', sourceUrl: 'https://brand.example/', fonts: [], colors: [], logos: [] } })
    const url = host.querySelector<HTMLInputElement>('input[placeholder="Fill from website URL…"]')!
    url.value = 'https://brand.example/'
    url.dispatchEvent(new Event('input', { bubbles: true }))
    ;[...host.querySelectorAll<HTMLButtonElement>('button')].filter(item => item.textContent === 'Extract').at(-1)!.click()
    await settle()
    expect(host.textContent).toContain('No colours were detected; the existing kit colours were kept.')
    expect(host.textContent).toContain('No fonts were detected; the existing kit fonts were kept.')
    button('Create kit').click()
    await settle()
    const payload = api.mock.calls.find(call => call[0] === '/api/agency/banner-studio/brand-kits' && call[1]?.method === 'POST')?.[1]?.body as { fonts: Array<{ family: string }>, colors: unknown[] }
    expect(payload.fonts.map(font => font.family)).toEqual(['Barlow Condensed', 'Barlow'])
    expect(payload.colors).toHaveLength(4)
  })

  it('reloads managed font files as well as kits after a MotorStack batch', async () => {
    const { api, refreshFonts } = await mount()
    const previousRefreshes = refreshFonts.mock.calls.length
    button('Import from MotorStack').click()
    await settle()
    button('Finish fixture import').click()
    await settle()
    expect(refreshFonts).toHaveBeenCalledTimes(previousRefreshes + 1)
    expect(api.mock.calls.filter(call => call[0] === '/api/agency/banner-studio/brand-kits' && !call[1]?.method)).toHaveLength(2)
  })
  it('shows only the current OEM face and preserves its exact ID on edit/save', async () => {
    const shared = (brand: string, id: string): CustomFont => ({ ...face(400), id, clientId: null, name: 'Montserrat', tags: ['font', 'weight:400', `motorstack-brand:${brand}`] })
    const first = shared('gwm', '11111111-1111-4111-8111-111111111111')
    const second = shared('kia', '22222222-2222-4222-8222-222222222222')
    const kit = (id: string, name: string, font: CustomFont): BannerBrandKit => ({
      id, name, clientId: null, isDefault: false, colors: [], logos: [], guidelines: '',
      sourceUrl: `https://oem-variants.pages.dev/api/mcp#brand=${id}`,
      fonts: [{ role: 'heading', family: font.name, weights: [400], defaultWeight: 400, assets: [{ id: font.id, weight: 400 }] }],
      createdAt: '', updatedAt: '', createdBy: 'user'
    })
    const kits = [kit('gwm', 'GWM OEM', first), kit('kia', 'Kia OEM', second)]
    const { api } = await mount({ fonts: [first, second], kits })
    host.querySelector<HTMLButtonElement>('button[aria-label="Edit Kia OEM"]')!.click()
    await settle()
    expect(host.textContent).not.toContain('Extracted from https://oem-variants.pages.dev')
    expect(host.textContent).not.toContain('Montserrat · GWM OEM · MotorStack')
    expect(host.textContent).not.toContain('Montserrat · Kia OEM · MotorStack')
    expect(host.textContent).not.toContain('Linked font unavailable')
    const heading = host.querySelector('[data-field="Heading font"]')!
    expect(heading.querySelector('[data-current]')?.getAttribute('data-current')).toBe('uploaded:agency:Montserrat:motorstack:kia')
    expect(heading.querySelector('[data-value="uploaded:agency:Montserrat:motorstack:kia"]')?.textContent).toBe('Montserrat')
    expect(heading.querySelector('[data-value="uploaded:agency:Montserrat:motorstack:gwm"]')).toBeNull()
    expect(heading.querySelector('[data-value="library:Arial"]')).toBeNull()
    // Some select components emit the existing choice again on focus/open: this must be a no-op.
    ;(heading.querySelector('[data-value="uploaded:agency:Montserrat:motorstack:kia"]') as HTMLButtonElement).click()
    await settle()
    button('Save changes').click()
    await settle()
    const payload = api.mock.calls.find(call => call[1]?.method === 'PATCH')?.[1]?.body as { fonts: unknown[] }
    expect(payload.fonts).toEqual(kits[1].fonts)
    expect(payload.fonts).not.toEqual(kits[0].fonts)
  })

  it('offers only uploaded weights and saves exact asset references with the role default', async () => {
    const { api } = await mount()
    host.querySelector<HTMLButtonElement>(`[data-field="Heading font"] [data-value="uploaded:${clientId}:Brand"]`)!.click()
    await settle()
    const weights = host.querySelector('[data-field="Default weight"]')!
    expect([...weights.querySelectorAll('[data-value]')].map(el => el.getAttribute('data-value'))).toEqual(['325', '950'])
    ;(weights.querySelector('[data-value="950"]') as HTMLButtonElement).click()
    input('Name', 'Brand kit')
    button('Create kit').click()
    await settle()
    const payload = api.mock.calls.find(call => call[1]?.method === 'POST')?.[1]?.body as { fonts: unknown[] }
    expect(payload.fonts[0]).toEqual({ role: 'heading', family: 'Brand', weights: [325, 950], defaultWeight: 950, assets: [{ id: face(325).id, weight: 325 }, { id: face(950).id, weight: 950 }] })
  })
  it('uploads to the selected client and leaves the kit unchanged on failure', async () => {
    const { api, upload } = await mount()
    upload.mockRejectedValueOnce(new Error('Upload unavailable'))
    input('Family name', 'Brand')
    input('File weight', '700')
    button('Choose font fixture').click()
    await settle()
    button('Upload and add to kit').click()
    await settle()
    expect(upload).toHaveBeenCalledWith(expect.any(File), 'Brand', 700, clientId)
    input('Name', 'Brand kit')
    button('Create kit').click()
    await settle()
    const payload = api.mock.calls.find(call => call[1]?.method === 'POST')?.[1]?.body as { fonts: Array<{ family: string, assets?: unknown }> }
    expect(payload.fonts.map(font => font.family)).toEqual(['Barlow Condensed', 'Barlow'])
    expect(payload.fonts.every(font => !font.assets)).toBe(true)
  })
  it('keeps client selection available so an unavailable linked face can be restored', async () => {
    await mount()
    host.querySelector<HTMLButtonElement>(`[data-field="Heading font"] [data-value="uploaded:${clientId}:Brand"]`)!.click()
    await settle()
    host.querySelector<HTMLButtonElement>(`[data-field="Client"] [data-value="${otherClientId}"]`)!.click()
    await settle()
    expect(button('Create kit').disabled).toBe(true)
    const restoreClient = host.querySelector<HTMLButtonElement>(`[data-field="Client"] [data-value="${clientId}"]`)!
    expect(restoreClient.disabled).toBe(false)
    restoreClient.click()
    await settle()
    expect(button('Create kit').disabled).toBe(false)
  })
  it('keeps website font detection as an explicit review draft without saving a kit', async () => {
    const { api } = await mount()
    const url = host.querySelector<HTMLInputElement>('input[placeholder="Fill from website URL…"]')!
    url.value = 'https://brand.example/'
    url.dispatchEvent(new Event('input', { bubbles: true }))
    ;[...host.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent === 'Extract').at(-1)!.click()
    await settle()
    expect(host.textContent).toContain('Private Brand Face · Detected font — upload file or choose available font')
    const request = api.mock.calls.find(call => call[0].endsWith('/extract'))
    expect(request?.[1]?.body).toEqual({ url: 'https://brand.example/', clientId })
    expect(api.mock.calls.some(call => call[0] === '/api/agency/banner-studio/brand-kits' && call[1]?.method === 'POST')).toBe(false)
  })
})
