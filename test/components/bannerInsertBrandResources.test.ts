// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import type { BannerBrandKit } from '~/types/banner-studio'

for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const kit = Vue.ref({
  id: 'renault-kit', name: 'Renault Australia', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=renault',
  fonts: [], colors: [], logos: []
} as BannerBrandKit)
const addBrandGuideButton = vi.fn(() => ({ id: 'button-1' }))
const toast = { add: vi.fn() }
vi.stubGlobal('useBannerInsert', () => ({ insertElement: vi.fn() }))
vi.stubGlobal('useBannerStudio', () => ({ addBrandGuideButton }))
vi.stubGlobal('useBannerProjectBrand', () => ({ kit }))
vi.stubGlobal('useToast', () => toast)
const InsertPanel = (await import('~/components/banner/InsertPanel.client.vue')).default
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
