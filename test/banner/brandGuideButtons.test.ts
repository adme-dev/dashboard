// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BrandStyleGuide from '~/components/banner/BrandStyleGuide.vue'
import type { BannerBrandKit, BannerProject } from '~/types/banner-studio'
import { BRAND_BUTTON_DRAG_TYPE, brandButtonDragData, brandButtonDropPoint, brandGuideButtonLayer, parseBrandButtonDragData } from '~/utils/banner-brand-buttons'

for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const { useBannerStudio } = await import('~/composables/useBannerStudio')
const renault = {
  id: 'renault-kit', name: 'Renault', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=renault',
  fonts: [{ role: 'body', family: 'Renault Life', weights: [500] }], colors: [], logos: []
} as BannerBrandKit
const ldv = { ...renault, id: 'ldv-kit', name: 'LDV', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=ldv' } as BannerBrandKit
afterEach(() => vi.restoreAllMocks())

describe('style-guide button placement', () => {
  it('builds editable primary, secondary and on-dark styles at a clamped drop point', () => {
    expect(brandGuideButtonLayer(renault, 'primary', { w: 300, h: 250 }, { x: 100, y: 20 })).toMatchObject({
      type: 'button', brandButtonVariant: 'primary', text: 'Book a test drive',
      x: 10, y: 0, w: 180, h: 42, bgColor: '#000000', textColor: '#ffffff', fontFamily: 'Renault Life'
    })
    expect(brandGuideButtonLayer(renault, 'secondary', { w: 300, h: 250 }, { x: 900, y: 900 })).toMatchObject({
      brandButtonVariant: 'secondary', x: 120, y: 208, bgColor: 'transparent', textColor: '#000000', borderWidth: 1, borderColor: '#000000'
    })
    expect(brandGuideButtonLayer(ldv, 'dark-secondary', { w: 300, h: 250 })).toMatchObject({
      bgColor: '#ffffff', textColor: '#000000', fontFamily: 'Open Sans', fontWeight: 700, borderRadius: 0
    })
    expect(brandGuideButtonLayer(renault, 'dark-secondary', { w: 300, h: 250 })).toBeNull()
  })

  it('accepts only a valid brand button drag and converts screen coordinates to canvas pixels', () => {
    expect(parseBrandButtonDragData(brandButtonDragData('renault-kit', 'secondary'))).toEqual({ kitId: 'renault-kit', variant: 'secondary' })
    expect(parseBrandButtonDragData('{"kitId":"renault-kit","variant":"image"}')).toBeNull()
    expect(brandButtonDropPoint(210, 120, { left: 10, top: 20 }, 0.5)).toEqual({ x: 400, y: 200 })
  })

  it('adds to the target canvas only and keeps its secondary style when the kit is reapplied', () => {
    const studio = useBannerStudio()
    studio.loadProject({ id: 'guide-buttons', canvasData: {
      custom_300x250: { layers: [] }, custom_1200x1200: { layers: [] }
    } } as unknown as BannerProject)
    const layer = studio.addBrandGuideButton(renault, 'secondary', 'custom_300x250', { x: 70, y: 70 })!
    expect(layer).toMatchObject({ brandButtonVariant: 'secondary', x: 0, y: 49 })
    expect(studio.state.activeKey).toBe('custom_300x250')
    expect(studio.state.sets.custom_1200x1200.layers).toHaveLength(0)
    studio.applyBrandKit(renault, { insertLogo: false })
    expect(studio.state.sets.custom_300x250.layers.find(item => item.id === layer.id)).toMatchObject({
      brandButtonVariant: 'secondary', bgColor: 'transparent', borderColor: '#000000'
    })
  })
})

it('makes the guide preview draggable and clickable in the editor', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const onAddButton = vi.fn()
  const app = Vue.createApp(BrandStyleGuide, { kit: renault, interactive: true, onAddButton })
  app.component('UButton', { setup: (_, { attrs, slots }) => () => Vue.h('button', attrs, slots.default?.()) })
  app.mount(host)
  try {
    const buttons = [...host.querySelectorAll('button')]
    expect(buttons).toHaveLength(2)
    const payload: Record<string, string> = {}
    const event = new Event('dragstart', { bubbles: true }) as DragEvent
    Object.defineProperty(event, 'dataTransfer', { value: { setData: (type: string, value: string) => {
      payload[type] = value
    }, effectAllowed: '' } })
    buttons[1].dispatchEvent(event)
    expect(payload[BRAND_BUTTON_DRAG_TYPE]).toBe(brandButtonDragData('renault-kit', 'secondary'))
    buttons[0].click()
    expect(onAddButton).toHaveBeenCalledWith('primary')
  } finally {
    app.unmount()
    host.remove()
  }
})

it('keeps compact button presets interactive without the full guide details', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const onAddButton = vi.fn()
  const app = Vue.createApp(BrandStyleGuide, { kit: renault, compact: true, interactive: true, onAddButton })
  app.component('UButton', { setup: (_, { attrs, slots }) => () => Vue.h('button', attrs, slots.default?.()) })
  app.mount(host)
  try {
    expect(host.textContent).toContain('Renault buttons')
    expect(host.textContent).not.toContain('View full guide')
    expect(host.textContent).not.toContain('Heading')
    const buttons = host.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    buttons[1]!.click()
    expect(onAddButton).toHaveBeenCalledWith('secondary')
  } finally {
    app.unmount()
    host.remove()
  }
})
