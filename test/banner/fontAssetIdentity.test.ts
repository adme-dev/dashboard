// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import { bannerFontFamily, matchingBannerFontWeight } from '../../shared/banner/fonts'
import { brandFontSelection } from '../../app/utils/banner-brand-kit'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import type { BannerBrandKit, Layer } from '../../app/types/banner-studio'

const regular = 'aaaaaaaa-1111-4111-8111-111111111111'
const bold = 'bbbbbbbb-2222-4222-8222-222222222222'
afterEach(() => vi.unstubAllGlobals())

describe('exact brand font identity', () => {
  it('matches missing legacy weights using CSS font matching rather than upload order', () => {
    expect(matchingBannerFontWeight([700, 400])).toBe(400)
    expect(matchingBannerFontWeight([700, 400], 500)).toBe(400)
    expect(matchingBannerFontWeight([300, 500, 700], 400)).toBe(500)
    expect(matchingBannerFontWeight([300, 700], 600)).toBe(700)
    expect(matchingBannerFontWeight([100, 400], 200)).toBe(100)
  })
  it('keeps same-family faces separate, normalizes UUID case and preserves legacy families', () => {
    expect(bannerFontFamily('Brand', regular)).not.toBe(bannerFontFamily('Brand', bold))
    expect(bannerFontFamily('Brand', regular.toUpperCase())).toBe(bannerFontFamily('Brand', regular))
    expect(bannerFontFamily('Legacy')).toBe('Legacy')
    expect(brandFontSelection({ role: 'heading', family: 'Thin', weights: [325] }).fontWeight).toBe(325)
  })
  it('exports exact old and legacy new faces without replacing either identity', () => {
    const layers = [{ id: 1, type: 'text', text: 'Exact', fontFamily: 'Brand', fontWeight: 400, fontAssetId: regular.toUpperCase(), x: 0, y: 0, w: 100, h: 30 },
      { id: 2, type: 'text', text: 'Legacy', fontFamily: 'Brand', fontWeight: 400, x: 0, y: 40, w: 100, h: 30 }] as Layer[]
    const html = buildBannerHTML('mrec', layers, { customFonts: [
      { family: 'Brand', weight: 400, url: 'https://example.com/new.woff2', format: 'woff2' },
      { id: regular, family: 'Brand', weight: 400, url: 'https://example.com/old.woff2', format: 'woff2' }
    ] })
    expect(html).toContain(`font-family:'${bannerFontFamily('Brand', regular)}'`)
    expect(html).toContain('font-family: \'Brand\'; src: url(\'https://example.com/new.woff2\')')
    expect(html).not.toContain('font-family: \'Brand\'; src: url(\'https://example.com/old.woff2\')')
    expect(html).toContain(`font-family: '${bannerFontFamily('Brand', regular)}'; src: url('https://example.com/old.woff2')`)
  })
  it('applies role family, default weight and exact asset together, with one undo', async () => {
    vi.resetModules()
    for (const [key, value] of Object.entries(Vue)) vi.stubGlobal(key, value)
    vi.stubGlobal('useBannerFonts', () => ({ loadUsedFonts: vi.fn() }))
    const studio = (await import('../../app/composables/useBannerStudio')).useBannerStudio()
    studio.state.activeKey = 'mrec'
    studio.state.setKeys = ['mrec']
    const layers = [{ id: 1, type: 'text', text: 'Heading', fontSize: 40, fontFamily: 'Old', fontWeight: 400 },
      { id: 2, type: 'text', text: 'Body', fontSize: 14, fontFamily: 'Old', fontWeight: 700 },
      { id: 3, type: 'button', text: 'CTA', fontSize: 12, fontFamily: 'Old', fontWeight: 400 }] as Layer[]
    studio.state.sets = { mrec: { layers } }
    const kit = { name: 'Brand', colors: [], logos: [], fonts: [
      { role: 'heading', family: 'Brand', weights: [325, 950], defaultWeight: 950, assets: [{ id: regular, weight: 325 }, { id: bold, weight: 950 }] },
      { role: 'body', family: 'Brand', weights: [325], defaultWeight: 325, assets: [{ id: regular, weight: 325 }] }
    ] } as BannerBrandKit
    studio.applyBrandKit(kit)
    expect(studio.activeLayers.value.map(layer => [layer.fontFamily, layer.fontWeight, layer.fontAssetId])).toEqual([
      ['Brand', 950, bold], ['Brand', 325, regular], ['Brand', 950, bold]
    ])
    studio.undo()
    expect(studio.activeLayers.value.map(layer => [layer.fontFamily, layer.fontWeight, layer.fontAssetId])).toEqual([
      ['Old', 400, undefined], ['Old', 700, undefined], ['Old', 400, undefined]
    ])
    studio.redo()
    studio.updateLayer(1, { fontFamily: 'Arial' })
    expect(studio.activeLayers.value[0]?.fontAssetId).toBeUndefined()
  })
  it('renders two legacy client families with independent UUID aliases without editing the layers', async () => {
    vi.resetModules()
    for (const [key, value] of Object.entries(Vue)) vi.stubGlobal(key, value)
    vi.stubGlobal('useBannerStudio', () => ({ updateLayer: vi.fn() }))
    vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
    const face = (id: string, clientId: string) => ({ id, clientId, sha256: null, name: 'Brand', tags: ['font', 'weight:400', 'format:woff2'], url: `https://example.com/${id}.woff2`, mimeType: 'font/woff2', fileSize: 20, r2Key: id, uploadedBy: 'user', createdAt: '' })
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValueOnce([face(regular, 'client-a')]).mockResolvedValueOnce([face(bold, 'client-b')]))
    const fonts = (await import('../../app/composables/useBannerFonts')).useBannerFonts()
    await fonts.refreshCustomFonts('client-a')
    await fonts.refreshCustomFonts('client-b')
    const Text = (await import('../../app/components/banner/layers/Text.client.vue')).default
    const layer = { id: 1, type: 'text', text: 'Legacy brand', fontFamily: 'Brand', fontWeight: 400 } as Layer
    const host = document.createElement('div')
    document.body.append(host)
    const app = Vue.createApp({ render: () => Vue.h('div', [
      Vue.h('section', { 'data-client': 'a' }, Vue.h(Text, { layer, isActive: false, clientId: 'client-a' })),
      Vue.h('section', { 'data-client': 'b' }, Vue.h(Text, { layer, isActive: false, clientId: 'client-b' }))
    ]) })
    try {
      app.mount(host)
      expect(host.querySelector('[data-client="a"] [style*="font-family"]')?.getAttribute('style')).toContain(bannerFontFamily('Brand', regular))
      expect(host.querySelector('[data-client="b"] [style*="font-family"]')?.getAttribute('style')).toContain(bannerFontFamily('Brand', bold))
      expect(layer.fontAssetId).toBeUndefined()
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
