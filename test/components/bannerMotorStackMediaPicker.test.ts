// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import Picker from '../../app/components/banner/MotorStackMediaPicker.vue'
import AssetsPanel from '../../app/components/banner/AssetsPanel.client.vue'

const image = { id: 'image-1', name: 'Cannon exterior', type: 'Vehicle photo', mime: 'image/jpeg', importable: true, previewUrl: '/preview/image-1' }
const pdf = { id: 'doc-1', name: 'Cannon brochure.pdf', type: 'Brochure', mime: 'application/pdf', importable: false, previewUrl: '/preview/doc-1' }
const vector = { id: 'svg-1', name: 'Vector logo', type: 'Logo', mime: 'image/svg+xml', importable: false, previewUrl: '/preview/svg-1' }
const saved = { id: 'managed-1', name: image.name, mimeType: image.mime, url: '/managed/image-1' }
const response = (brandId = 'gwm', models = ['Cannon', 'Tank']) => ({ brand: { id: brandId, name: brandId.toUpperCase() }, assets: [image, pdf, vector], models, warnings: ['Source collection may not include every model.'] })
let app: Vue.App | undefined
let host: HTMLDivElement
async function settle() {
  for (let index = 0; index < 12; index++) await Promise.resolve()
  await Vue.nextTick()
}
function button(label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
function choose(field: string, value: string) {
  host.querySelector<HTMLButtonElement>(`[data-field="${field}"] [data-value="${value}"]`)!.click()
}
async function mount(options: { read?: (query: { brandId: string, model?: string }) => Promise<ReturnType<typeof response>>, write?: ReturnType<typeof vi.fn> } = {}) {
  const queries: Array<{ brandId: string, model?: string }> = []
  const write = options.write || vi.fn(async () => ({ asset: saved }))
  vi.stubGlobal('$fetch', write)
  vi.stubGlobal('useFetch', (url: string, config: { query?: Vue.ComputedRef<{ brandId: string, model?: string }> }) => {
    const data = Vue.ref<unknown>(null)
    const error = Vue.ref<unknown>(null)
    const status = Vue.ref('idle')
    return { data, error, status, execute: async () => {
      status.value = 'pending'
      error.value = null
      try {
        if (url.endsWith('/brands')) data.value = { brands: [{ id: 'gwm', name: 'GWM' }, { id: 'kia', name: 'Kia' }] }
        else {
          const query = { ...config.query!.value }
          queries.push(query)
          data.value = options.read ? await options.read(query) : response(query.brandId, query.model ? [query.model] : undefined)
        }
        status.value = 'success'
      } catch (cause) {
        error.value = cause
        status.value = 'error'
      }
    } }
  })
  const imported = vi.fn()
  app = Vue.createApp(Picker, { open: true, onImported: imported })
  app.component('UModal', Vue.defineComponent({ props: ['open', 'dismissible'], setup: (props, { slots }) => () => props.open ? Vue.h('section', { 'data-dismissible': props.dismissible }, [slots.body?.(), slots.footer?.()]) : null }))
  app.component('UButton', Vue.defineComponent({ props: ['disabled', 'label', 'href'], setup: (props, { slots, attrs }) => () => Vue.h(props.href ? 'a' : 'button', { ...attrs, href: props.href, disabled: props.disabled }, props.label || slots.default?.()) }))
  app.component('UFormField', Vue.defineComponent({ props: ['label'], setup: (props, { slots }) => () => Vue.h('div', { 'data-field': props.label }, slots.default?.()) }))
  app.component('USelectMenu', Vue.defineComponent({ props: ['items', 'disabled'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('div', props.items.map((item: { label: string, value: string }) => Vue.h('button', { 'disabled': props.disabled, 'data-value': item.value, 'onClick': () => emit('update:modelValue', item.value) }, item.label))) }))
  app.component('UInput', Vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('input', { value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }) }))
  app.component('UAlert', Vue.defineComponent({ props: ['title', 'description', 'actions'], setup: props => () => Vue.h('aside', [props.title, props.description, ...(props.actions || []).map((action: { label: string, onClick: () => void }) => Vue.h('button', { onClick: action.onClick }, action.label))]) }))
  app.component('UIcon', Vue.defineComponent({ setup: () => () => Vue.h('span') }))
  app.mount(host)
  await settle()
  return { write, imported, queries }
}
beforeEach(() => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  host = document.createElement('div')
})
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.unstubAllGlobals()
})

describe('MotorStack media picker', () => {
  it('refreshes the Assets panel library after import without adding a canvas layer', async () => {
    const addLayer = vi.fn()
    const api = vi.fn(async (_url: string) => ({ assets: [] }))
    vi.stubGlobal('$fetch', api)
    vi.stubGlobal('useFetch', (url: string) => {
      const data = Vue.ref({ assets: [] })
      const refresh = async () => {
        data.value = await api(url)
      }
      refresh()
      return { data, error: Vue.ref(null), status: Vue.ref('success'), refresh }
    })
    vi.stubGlobal('useBannerStudio', () => ({ addLayer, nextId: () => 1, activeLayers: Vue.ref([]) }))
    vi.stubGlobal('useDecompose', () => ({ decomposingAssetId: Vue.ref(null), decomposeFromUrl: vi.fn() }))
    vi.stubGlobal('useAiImageGenerate', () => ({ openGenerate: vi.fn() }))
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
    app = Vue.createApp(AssetsPanel)
    app.component('UButton', Vue.defineComponent({ props: ['label'], setup: (props, { attrs }) => () => Vue.h('button', attrs, props.label) }))
    app.component('BannerMotorStackMediaPicker', Vue.defineComponent({ props: ['open'], emits: ['imported'], setup: (props, { emit }) => () => props.open ? Vue.h('button', { onClick: () => emit('imported', saved) }, 'Import fixture image') : null }))
    for (const name of ['UInput', 'UIcon']) app.component(name, Vue.defineComponent({ setup: () => () => Vue.h('span') }))
    app.mount(host)
    await settle()
    button('Browse MotorStack').click()
    await settle()
    button('Import fixture image').click()
    await settle()
    expect(api.mock.calls.filter(call => call[0] === '/api/agency/banner-studio/assets')).toHaveLength(2)
    expect(addLayer).not.toHaveBeenCalled()
  })
  it('browses without importing and gives PDFs a download action instead of adding them as images', async () => {
    const { write, imported } = await mount()
    expect(host.textContent).toContain('Choose a brand')
    choose('Brand', 'gwm')
    await settle()
    expect(write).not.toHaveBeenCalled()
    expect(host.querySelector('a')).toBeNull()
    choose('Media type', 'all')
    await settle()
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/preview/doc-1')
    expect([...host.querySelectorAll('button')].filter(item => item.textContent === 'Add to library')).toHaveLength(1)
    expect(host.textContent).toContain('This file cannot be added as an image.')
    button('Add to library').click()
    await settle()
    expect(write).toHaveBeenCalledWith('/api/agency/banner-studio/motorstack/media', { method: 'POST', body: { brandId: 'gwm', assetId: 'image-1' } })
    expect(imported).toHaveBeenCalledWith(saved)
    expect(button('Added to library').disabled).toBe(true)
  })

  it('preserves all model choices after filtering and searches the loaded results', async () => {
    const { queries, write } = await mount()
    choose('Brand', 'gwm')
    await settle()
    choose('Model', 'Cannon')
    await settle()
    expect(queries).toEqual([{ brandId: 'gwm' }, { brandId: 'gwm', model: 'Cannon' }])
    expect(host.querySelector('[data-field="Model"]')?.textContent).toContain('Tank')
    choose('Media type', 'all')
    await settle()
    const search = host.querySelector('input')!
    search.value = 'brochure'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    expect(host.textContent).toContain('1 of 3 assets')
    expect(host.textContent).not.toContain('Cannon exterior')
    expect(write).not.toHaveBeenCalled()
  })

  it('matches words in any order and retries failed previews without importing', async () => {
    const { write } = await mount()
    choose('Brand', 'gwm')
    await settle()
    const input = host.querySelector('input')!
    input.value = 'exterior cannon JPG'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    expect(host.textContent).toContain('1 of 3 assets')
    host.querySelector('img')!.dispatchEvent(new Event('error'))
    await settle()
    expect(host.textContent).toContain('Preview unavailable')
    button('Retry preview').click()
    await settle()
    expect(host.querySelector('img')?.getAttribute('src')).toBe(image.previewUrl)
    expect(write).not.toHaveBeenCalled()
  })

  it('retains import failures for explicit retry and disables dismissal while adding', async () => {
    let finish!: (value: { asset: typeof saved }) => void
    const write = vi.fn().mockRejectedValueOnce({ data: { statusMessage: 'Source image unavailable' } }).mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const { imported } = await mount({ write })
    choose('Brand', 'gwm')
    await settle()
    button('Add to library').click()
    await settle()
    expect(host.textContent).toContain('Source image unavailable')
    button('Retry adding to library').click()
    await settle()
    expect(host.querySelector('section')?.getAttribute('data-dismissible')).toBe('false')
    expect(button('Close').disabled).toBe(true)
    expect(imported).not.toHaveBeenCalled()
    finish({ asset: saved })
    await settle()
    expect(imported).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('Source image unavailable')
  })

  it('does not display an older brand response after changing the selection', async () => {
    let finishOld!: (value: ReturnType<typeof response>) => void
    const { queries } = await mount({ read: query => query.brandId === 'gwm'
      ? new Promise((resolve) => {
          finishOld = resolve
        })
      : Promise.resolve(response('kia')) })
    choose('Brand', 'gwm')
    await settle()
    choose('Brand', 'kia')
    await settle()
    expect(queries).toHaveLength(2)
    expect(host.textContent).toContain('KIA')
    finishOld(response('gwm'))
    await settle()
    expect(host.textContent).toContain('KIA')
    expect(host.querySelector('p.font-medium')?.textContent).not.toBe('GWM')
  })

  it('shows a failed media read and allows retry without making an import request', async () => {
    const read = vi.fn().mockRejectedValueOnce({ data: { statusMessage: 'MotorStack temporarily unavailable' } }).mockResolvedValueOnce(response())
    const { write } = await mount({ read })
    choose('Brand', 'gwm')
    await settle()
    expect(host.textContent).toContain('MotorStack temporarily unavailable')
    button('Retry loading').click()
    await settle()
    expect(host.textContent).toContain('Cannon exterior')
    expect(write).not.toHaveBeenCalled()
  })
})
