// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import Canvas from '~/components/banner/Canvas.client.vue'
import Controls from '~/components/banner/LayoutControls.vue'
import type { BannerBrandKit } from '~/types/banner-studio'

for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const { useBannerStudio } = await import('~/composables/useBannerStudio')
let clean: (() => void) | undefined
afterEach(() => { clean?.(); vi.restoreAllMocks() })

it('switches mounted artboards between overview and single edit without replacing their DOM', async () => {
  const studio = useBannerStudio()
  studio.loadProject({ id: 'workspace', canvasData: Object.fromEntries(['custom_1080x1920', 'custom_1200x1200', 'custom_1920x1080'].map(key => [key, { layers: [] }])) } as any)
  vi.stubGlobal('useBannerStudio', () => studio)
  vi.stubGlobal('useBannerRealtime', () => ({ sendCursorMove: vi.fn() }))
  const kit = Vue.ref<BannerBrandKit | undefined>(undefined)
  vi.stubGlobal('useBannerProjectBrand', () => ({ kit }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700)
  HTMLElement.prototype.scrollTo = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  let canvas: any
  const app = Vue.createApp({ setup: () => () => Vue.h('div', [Vue.h(Controls), Vue.h(Canvas, { ref: (el: any) => { canvas = el } })]) })
  app.component('UButton', { props: ['label'], setup: (p, { attrs, slots }) => () => Vue.h('button', attrs, p.label || slots.default?.()) })
  app.component('UTooltip', { setup: (_, { slots }) => () => slots.default?.() })
  app.component('UDropdownMenu', { setup: (_, { slots }) => () => slots.default?.() })
  app.component('BannerArtboard', { setup: (_, { expose }) => { const el = Vue.ref(); expose({ artboardEl: el }); return () => Vue.h('div', { ref: el, class: 'artboard-fixture' }) } })
  app.component('BannerCollaborationCursors', { render: () => null })
  app.component('BannerCommentOverlay', { render: () => null })
  app.mount(host)
  clean = () => { app.unmount(); host.remove() }
  await Vue.nextTick(); await Vue.nextTick()
  const boards = [...host.querySelectorAll('[data-layout-key]')] as HTMLElement[]
  expect(boards.map(el => el.dataset.layoutKey)).toEqual(['custom_1200x1200', 'custom_1080x1920', 'custom_1920x1080'])
  const originalEl = canvas.getActiveArtboardEl()
  ;(host.querySelector('[aria-label="Edit size: Story 1080 × 1920"]') as HTMLButtonElement).click()
  await Vue.nextTick(); await Vue.nextTick()
  expect(studio.state.layoutView).toBe('single')
  expect(boards.filter(el => el.style.display !== 'none').map(el => el.dataset.layoutKey)).toEqual(['custom_1080x1920'])
  expect(canvas.getActiveArtboardEl()).toBe(originalEl)
  const allButton = [...host.querySelectorAll('button')].find(b => b.textContent === 'All layouts')!
  allButton.click(); await Vue.nextTick(); await Vue.nextTick()
  expect(boards.every(el => el.style.display !== 'none')).toBe(true)
  const scale = studio.state.wsScale
  studio.setActiveArtboard('custom_1200x1200'); await Vue.nextTick()
  expect(studio.state.wsScale).toBe(scale)
  await canvas.fitAllArtboards(); await Vue.nextTick()
  expect(studio.state.wsScale).toBeLessThan(scale)
  expect(studio.state.isDirty).toBe(false)
  kit.value = { id: 'renault-kit', name: 'Renault', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=renault', colors: [], fonts: [], logos: [] }
  await Vue.nextTick()
  const target = boards[1].querySelector('.relative.cursor-pointer') as HTMLElement
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 30 } as DOMRect)
  const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperties(drop, {
    dataTransfer: { value: { types: ['application/x-xeroflow-brand-button'], getData: () => JSON.stringify({ kitId: 'renault-kit', variant: 'secondary' }) } },
    clientX: { value: 20 + 200 * studio.state.wsScale },
    clientY: { value: 30 + 300 * studio.state.wsScale }
  })
  target.dispatchEvent(drop)
  expect(drop.defaultPrevented).toBe(true)
  expect(studio.state.activeKey).toBe('custom_1080x1920')
  expect(studio.state.sets.custom_1080x1920.layers).toEqual([expect.objectContaining({ brandButtonVariant: 'secondary', x: 110, y: 279 })])
  expect(studio.state.sets.custom_1200x1200.layers).toHaveLength(0)
  expect(studio.state.sets.custom_1920x1080.layers).toHaveLength(0)
})
