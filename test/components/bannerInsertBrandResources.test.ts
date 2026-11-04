// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BannerBrandKit } from '~/types/banner-studio'

for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const kit = Vue.ref({
  id: 'renault-kit', name: 'Renault Australia', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=renault',
  fonts: [], colors: [], logos: []
} as BannerBrandKit)
const originalKit = kit.value
const kitLoading = Vue.ref(false)
const kitError = Vue.ref<Error | null>(null)
const refreshKits = vi.fn()
const insertElement = vi.fn()
const addBrandGuideButton = vi.fn(() => ({ id: 'button-1' }))
const toast = { add: vi.fn() }
vi.stubGlobal('useBannerInsert', () => ({ insertElement }))
vi.stubGlobal('useBannerStudio', () => ({ addBrandGuideButton }))
vi.stubGlobal('useBannerProjectBrand', () => ({ kit, loading: kitLoading, error: kitError, refresh: refreshKits }))
vi.stubGlobal('useToast', () => toast)
const InsertPanel = (await import('~/components/banner/InsertPanel.client.vue')).default
beforeEach(() => { kit.value = originalKit; kitLoading.value = false; kitError.value = null })
afterEach(() => vi.clearAllMocks())

it('loads the selected kit into Insert and opens its vehicle and offer resources', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const onBrowseBrand = vi.fn()
  const app = Vue.createApp(InsertPanel, { onBrowseBrand })
  app.component('UButton', { setup: (_, { attrs, slots }) => () => Vue.h('button', attrs, [attrs.label, slots.default?.()]) })
  app.component('UIcon', { setup: () => () => Vue.h('span') })
  app.component('BannerBrandStyleGuide', Vue.defineComponent({
    emits: ['addButton'],
    setup: (_, { emit }) => () => Vue.h('button', { 'data-test': 'button-presets', 'onClick': () => emit('addButton', 'primary') }, 'Preset')
  }))
  app.component('BannerElementsPanel', { setup: () => () => Vue.h('div') })
  app.component('BannerAssetsPanel', { setup: () => () => Vue.h('div') })
  app.mount(host)
  try {
    expect(host.textContent).toContain('Renault Australia')
    expect(host.querySelector('[data-test="button-presets"]')).not.toBeNull()
    host.querySelector<HTMLButtonElement>('[data-test="button-presets"]')!.click()
    expect(addBrandGuideButton).toHaveBeenCalledWith(kit.value, 'primary')
    const click = (label: string) => [...host.querySelectorAll('button')].find(button => button.textContent?.includes(label))!.click()
    click('Vehicle images')
    click('Offer artwork')
    expect(onBrowseBrand.mock.calls).toEqual([['variants'], ['offers']])
  } finally {
    app.unmount()
    host.remove()
  }
})


const BrandStyleGuide = (await import('~/components/banner/BrandStyleGuide.vue')).default
async function mountPicker() {
  const host = document.createElement('div')
  document.body.append(host)
  const onBrowseBrand = vi.fn()
  const app = Vue.createApp(InsertPanel, { onBrowseBrand })
  app.component('UButton', { setup: (_, { attrs, slots }) => () => Vue.h('button', attrs, [attrs.label, slots.default?.()]) })
  app.component('UIcon', { setup: () => () => Vue.h('span') })
  app.component('UAlert', { setup: (_, { attrs }) => () => Vue.h('div', { role: 'alert' }, [attrs.title, attrs.description]) })
  app.component('BannerBrandStyleGuide', BrandStyleGuide)
  app.component('BannerElementsPanel', { setup: () => () => Vue.h('div') })
  app.component('BannerAssetsPanel', { setup: () => () => Vue.h('div') })
  app.mount(host)
  const click = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label || button.textContent?.trim() === label)
    expect(button, label).toBeTruthy()
    button!.click()
    await Vue.nextTick()
  }
  await click('Button')
  return { host, click, onBrowseBrand, cleanup: () => { app.unmount(); host.remove() } }
}

it('opens Button as a style-guide chooser and adds only the selected preset', async () => {
  const picker = await mountPicker()
  try {
    expect(picker.host.querySelector('h2')!.textContent?.trim()).toBe('Buttons')
    expect(addBrandGuideButton).not.toHaveBeenCalled()
    expect(insertElement).not.toHaveBeenCalled()
    const secondary = picker.host.querySelector<HTMLButtonElement>('button[aria-label^="Add secondary brand button"]')!
    expect(secondary).toBeTruthy()
    expect(secondary.getAttribute('draggable')).toBe('true')
    secondary.click()
    expect(addBrandGuideButton).toHaveBeenCalledWith(kit.value, 'secondary')
    expect(insertElement).not.toHaveBeenCalled()
    await picker.click('Back to insert')
    expect(picker.host.querySelector('h2')!.textContent?.trim()).toBe('Insert')
  } finally { picker.cleanup() }
})

it('updates the chooser when the project brand changes', async () => {
  const picker = await mountPicker()
  try {
    kit.value = { ...originalKit, id: 'subaru-kit', name: 'Subaru', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=subaru' }
    await Vue.nextTick()
    expect(picker.host.textContent).toContain('Subaru buttons')
    const primary = picker.host.querySelector<HTMLButtonElement>('button[aria-label^="Add primary brand button"]')!
    expect(primary.style.borderRadius).toBe('100px')
    primary.click()
    expect(addBrandGuideButton).toHaveBeenCalledWith(kit.value, 'primary')
  } finally { picker.cleanup() }
})

it('lets an unbranded project choose a kit or explicitly insert a custom button', async () => {
  kit.value = undefined as unknown as BannerBrandKit
  const picker = await mountPicker()
  try {
    expect(picker.host.querySelector('button[aria-label^="Add primary brand button"]')).toBeNull()
    await picker.click('Choose a brand kit')
    expect(picker.onBrowseBrand).toHaveBeenCalledWith('logos')
    await picker.click('Add custom button')
    expect(insertElement).toHaveBeenCalledWith('button')
    expect(addBrandGuideButton).not.toHaveBeenCalled()
  } finally { picker.cleanup() }
})

it('waits for the kit and exposes retry instead of silently adding a generic button', async () => {
  kitLoading.value = true
  const picker = await mountPicker()
  try {
    expect(picker.host.querySelector('[role="status"]')!.textContent).toContain('Loading brand buttons')
    expect(picker.host.textContent).not.toContain('Add custom button')
    kitLoading.value = false
    kitError.value = new Error('Unavailable')
    await Vue.nextTick()
    expect(picker.host.querySelector('[role="alert"]')!.textContent).toContain('Could not load brand buttons')
    await picker.click('Retry')
    expect(refreshKits).toHaveBeenCalledOnce()
    expect(insertElement).not.toHaveBeenCalled()
  } finally { picker.cleanup() }
})
