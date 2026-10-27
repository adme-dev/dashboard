import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import type { BannerProject, Layer } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 1000 })
const fetcher = vi.fn(),
  toast = vi.fn()
vi.stubGlobal('$fetch', fetcher)
vi.stubGlobal('useToast', () => ({ add: toast }))
const { useBannerStudio }
  = await import('../../app/composables/useBannerStudio')
vi.stubGlobal('useBannerStudio', useBannerStudio)
const { useBannerLettering }
  = await import('../../app/composables/useBannerLettering')
const { useAiLayerEdit } = await import('../../app/composables/useAiLayerEdit')
const { useDecompose } = await import('../../app/composables/useDecompose')
const { useMergeLayers } = await import('../../app/composables/useMergeLayers')
const studio = useBannerStudio()
const metadata = {
  version: 1,
  qrCodeId: 'qr-id',
  clientId: 'client-id',
  code: 'test-code',
  shortUrl: 'https://app.xeroflow.io/q/test-code',
  name: 'Directions',
  assetId: 'asset-id',
  sha256: 'abc',
  qrUpdatedAt: '2026-10-26T00:00:00Z',
  renderedAt: '2026-10-26T00:00:00Z'
}
beforeEach(() => {
  studio.loadProject({
    id: 'project-id',
    updatedAt: '2026-10-26T00:00:00Z',
    canvasData: {
      mrec: {
        layers: [
          {
            id: 1,
            type: 'image',
            name: 'Managed QR',
            src: '/owned-qr.png',
            x: 10,
            y: 10,
            w: 100,
            h: 100,
            zIndex: 1,
            opacity: 1,
            locked: false,
            platformQr: metadata
          },
          {
            id: 2,
            type: 'image',
            name: 'Artwork',
            src: '/other.png',
            x: 120,
            y: 10,
            w: 100,
            h: 100,
            zIndex: 2,
            opacity: 1
          }
        ]
      }
    }
  } as unknown as BannerProject)
  studio.selectLayer(1)
  studio.state.isDirty = false
  fetcher.mockReset()
  toast.mockReset()
})
describe('Managed QR AI boundaries', () => {
  it('blocks lettering even when a managed QR is unlocked', async () => {
    const api = useBannerLettering(fetcher as unknown as typeof $fetch)
    api.open(studio.selectedLayer.value!)
    expect(api.opened.value).toBe(false)
    api.wording.value = 'New text'
    await api.generate()
    expect(api.protectedCopy.value).toBe(true)
    expect(api.apply()).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
    api.dispose()
  })
  it('refuses generic image AI entry and rechecks the target before submitting or applying', async () => {
    const api = useAiLayerEdit()
    api.cancelEdit()
    api.openEdit({ id: 1 })
    expect(api.showEditSlideover.value).toBe(false)
    api.openEdit({ id: 2 })
    api.editPrompt.value = 'Restyle'
    studio.state.sets.mrec!.layers[1]!.platformQr
      = metadata as Layer['platformQr']
    await api.submitEdit()
    expect(fetcher).not.toHaveBeenCalled()
    api.editPreviewUrl.value = '/redrawn.png'
    api.applyEdit()
    expect(studio.activeLayers.value[1]!.src).toBe('/other.png')
    api.cancelEdit()
  })
  it.each(['layer', 'asset'] as const)(
    'refuses decomposition through a %s entry before image loading or AI calls',
    async (sourceType) => {
      const original = studio.getCanvasData()
      expect(
        await useDecompose().decomposeFromUrl(
          '/owned-qr.png',
          'Directions',
          sourceType === 'layer' ? 1 : 'asset-id',
          sourceType
        )
      ).toBe(false)
      expect(fetcher).not.toHaveBeenCalled()
      expect(studio.getCanvasData()).toEqual(original)
    }
  )
  it('refuses a merge containing a managed QR instead of silently dropping its record link', async () => {
    const original = studio.getCanvasData()
    await useMergeLayers().mergeLayers([1, 2])
    expect(fetcher).not.toHaveBeenCalled()
    expect(studio.getCanvasData()).toEqual(original)
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Managed QR protected' })
    )
  })
})
