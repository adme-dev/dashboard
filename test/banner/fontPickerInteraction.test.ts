// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import TextInspector from '../../app/components/banner/inspector/Text.vue'
import type { BannerProject, Layer } from '../../app/types/banner-studio'

for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
let cleanup = () => {}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
async function mount(kit?: unknown) {
  const studio = useBannerStudio()
  const original = { id: 1, type: 'text', name: 'Finance rate', text: '0.09', x: 83, y: 247, w: 736, h: 301, zIndex: 10, opacity: 1, fontFamily: 'GEELY Imported', fontAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fontWeight: 400, linkId: 'source:rate' } as Layer
  studio.loadProject({ id: 'font-test', clientId: 'client', canvasData: { mrec: { layers: [original] }, fb_story: { layers: [{ ...original, id: 2 }] } } } as BannerProject)
  studio.selectLayer(1)
  const selectFont = vi.fn()
  const faces = [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Brand Face', tags: ['font', 'weight:700'], fileSize: 1024 }, { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Other Face', tags: ['font', 'weight:400'], fileSize: 1024 }]
  vi.stubGlobal('useBannerStudio', () => studio)
  vi.stubGlobal('useBannerProjectBrand', () => ({ kit: Vue.ref(kit) }))
  vi.stubGlobal('useBannerRealtime', () => ({ remoteUsers: Vue.ref([]) }))
  vi.stubGlobal('$fetch', vi.fn())
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('useBannerFonts', () => ({
    searchFonts: () => [{ family: 'Inter', category: 'sans-serif', weights: [400, 700] }],
    selectFont, recentFonts: Vue.ref([]), loadFont: vi.fn(), getFont: () => ({ weights: [400, 700] }),
    customFonts: Vue.ref(faces), isCustomFont: () => false, fetchCustomFonts: async () => {}, uploadCustomFont: vi.fn(), deleteCustomFont: vi.fn()
  }))
  const host = document.createElement('div')
  document.body.append(host)
  const app = Vue.createApp(TextInspector)
  app.component('UFormField', Vue.defineComponent({ props: ['label'], setup: (props, { slots }) => () => Vue.h('section', { 'data-field': props.label }, slots.default?.()) }))
  app.component('UPopover', Vue.defineComponent({
    props: ['open'], emits: ['update:open'],
    // The component owns opening its trigger; a competing trigger click handler
    // must not immediately close it again before the list becomes usable.
    setup: (props, { emit, slots }) => () => Vue.h('div', [
      Vue.h('div', { onClickCapture: () => emit('update:open', !props.open) }, slots.default?.()),
      props.open ? Vue.h('div', { 'data-popover-content': '' }, slots.content?.()) : null
    ])
  }))
  app.component('UButton', Vue.defineComponent({ props: ['label'], setup: (props, { slots }) => () => Vue.h('button', slots.default?.() || props.label) }))
  app.component('UInput', Vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { emit }) => () => Vue.h('input', { value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }) }))
  for (const name of ['USelectMenu', 'UIcon', 'UBadge', 'UCheckbox']) app.component(name, Vue.defineComponent({ setup: (_props, { slots }) => () => Vue.h('div', slots.default?.()) }))
  app.mount(host)
  await Vue.nextTick()
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  const click = async (text: string, root: Element = host) => {
    const button = [...root.querySelectorAll('button')].find(button => button.textContent?.replace(/\s+/g, '') === text.replace(/\s+/g, ''))
    expect(button, text).toBeTruthy()
    button!.click()
    await Vue.nextTick()
  }
  return { studio, host, selectFont, click }
}

it('opens the picker once, switches from an imported face to a standard font, and can undo/redo linked changes', async () => {
  const { studio, host, click, selectFont } = await mount()
  await click('GEELY Imported', host.querySelector('[data-field="Font"]')!)
  expect(host.querySelector('[placeholder="Search fonts..."]')).not.toBeNull()
  await click('Intersans serif')
  expect(selectFont).toHaveBeenCalledWith('Inter')
  expect(studio.selectedLayer.value).toMatchObject({ fontFamily: 'Inter', fontWeight: 400, x: 83, y: 247, w: 736, h: 301 })
  expect(studio.selectedLayer.value!.fontAssetId).toBeUndefined()
  expect(studio.state.sets.fb_story!.layers[0]!.fontFamily).toBe('Inter')
  expect(host.querySelector('[placeholder="Search fonts..."]')).toBeNull()
  studio.undo()
  expect(studio.activeLayers.value[0]!.fontAssetId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  studio.redo()
  expect(studio.activeLayers.value[0]!.fontFamily).toBe('Inter')
})

it('selects the exact uploaded face and its weight, then allows reopening the picker', async () => {
  const { studio, host, click } = await mount()
  await click('GEELY Imported', host.querySelector('[data-field="Font"]')!)
  await click('Custom')
  await click('Brand Face · 700')
  expect(studio.selectedLayer.value).toMatchObject({ fontFamily: 'Brand Face', fontAssetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fontWeight: 700 })
  await click('Brand Face', host.querySelector('[data-field="Font"]')!)
  expect(host.querySelector('[data-popover-content]')).not.toBeNull()
})

it('filters uploaded faces by search and explains an empty result', async () => {
  const { host, click } = await mount()
  await click('GEELY Imported', host.querySelector('[data-field="Font"]')!)
  await click('Custom')
  const input = host.querySelector<HTMLInputElement>('[placeholder="Search fonts..."]')!
  input.value = 'brand'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await Vue.nextTick()
  expect(host.textContent).toContain('Brand Face · 700')
  expect(host.textContent).not.toContain('Other Face · 400')
  input.value = 'missing font'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await Vue.nextTick()
  expect(host.textContent).toContain('No matching uploaded fonts.')
})

it('opens with the detected brand kit and selects its exact managed font face', async () => {
  const { studio, host, click } = await mount({ name: 'Geely Auto Australia', fonts: [{ role: 'heading', family: 'Brand Face', weights: [700], assets: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', weight: 700 }] }] })
  await click('GEELY Imported', host.querySelector('[data-field="Font"]')!)
  expect(host.textContent).toContain('Geely Auto Australia')
  expect(host.textContent).toContain('Brand Face · 700')
  await click('Brand Face · 700')
  expect(studio.selectedLayer.value).toMatchObject({ fontFamily: 'Brand Face', fontWeight: 700, fontAssetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
})

it('uses the kit weight for a web font without a managed asset', async () => {
  const { studio, host, click } = await mount({ name: 'Web brand', fonts: [{ role: 'heading', family: 'Inter', weights: [700] }] })
  await click('GEELY Imported', host.querySelector('[data-field="Font"]')!)
  await click('Inter · 700')
  expect(studio.selectedLayer.value).toMatchObject({ fontFamily: 'Inter', fontWeight: 700 })
  expect(studio.selectedLayer.value!.fontAssetId).toBeUndefined()
})

it('does not substitute another font while a kit asset is unavailable', async () => {
  const { studio, host, click } = await mount({ name: 'Unloaded kit', fonts: [{ role: 'heading', family: 'Brand Face', weights: [700], assets: [{ id: 'missing-asset', weight: 700 }] }] })
  await click('GEELY Imported', host.querySelector('[data-field="Font"]')!)
  await click('Brand Face · 700')
  expect(studio.selectedLayer.value!.fontAssetId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
})
