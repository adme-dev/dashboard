import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { collectScopedCanvasLocators, collectScopedCanvasSources, hasScopedCanvas } from '../../shared/bannerScopedCanvas'
const locator = '/api/agency/banner-studio/dissect/22222222-2222-4222-8222-222222222222/assets/33333333-3333-4333-8333-333333333333'
const fetcher = vi.fn(), toast = vi.fn()
const state: any = { sets: {}, project: {} }
const activeLayers = ref<any[]>([])
vi.stubGlobal('ref', ref)
vi.stubGlobal('$fetch', fetcher)
vi.stubGlobal('useToast', () => ({ add: toast }))
vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers, updateLayer: vi.fn(), addLayer: vi.fn(), removeLayer: vi.fn(), activeFormat: ref({ w: 300, h: 250 }) }))
const { useAiLayerEdit } = await import('../../app/composables/useAiLayerEdit')
const { useMergeLayers } = await import('../../app/composables/useMergeLayers')
beforeEach(() => {
  vi.clearAllMocks()
  activeLayers.value = [{ id: 1, type: 'image', src: locator }, { id: 2, type: 'image', src: '/legacy.png' }]
  state.sets = { mrec: { layers: activeLayers.value } }; state.project = {}
})
describe('protected canvas managed UI exclusions', () => {
  it('blocks merge and AI edit from locators without optional metadata', async () => {
    await useMergeLayers().mergeLayers([1, 2])
    useAiLayerEdit().openEdit({ id: 1 })
    expect(fetcher).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledTimes(2)
    expect(toast.mock.calls[0][0].description).toContain('Protected Dissector')
  })
  it('blocks a text-only marker retained in the saved canvas after local removal', async () => {
    state.project.canvasData = { mrec: { dissectionSource: { jobId: '22222222-2222-4222-8222-222222222222', sourceSha256: 'a'.repeat(64) }, layers: [] } }
    state.sets = {}; activeLayers.value = []
    await useMergeLayers().mergeLayers([1, 2]); useAiLayerEdit().openEdit({ id: 1 })
    expect(toast).toHaveBeenCalledTimes(2); expect(fetcher).not.toHaveBeenCalled()
  })
  it('collects canonical URLs and markers but rejects encoded/foreign aliases', () => {
    expect(collectScopedCanvasLocators(state.sets)).toEqual([locator])
    for (const src of [encodeURIComponent(locator), `https://foreign.test${locator}`, '/scoped-banner-exports/private.png']) {
      expect(hasScopedCanvas({ src })).toBe(true)
      expect(() => collectScopedCanvasLocators({ src })).toThrow()
    }
    expect(() => collectScopedCanvasSources({ dissectionSource: { jobId: 'forged' } })).toThrow()
    expect(hasScopedCanvas({ src: '/api/public/banner-assets/token', platformQr: { clientId: 'client' } })).toBe(false)
  })
})
