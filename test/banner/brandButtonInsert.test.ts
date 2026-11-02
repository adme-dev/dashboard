import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { BannerBrandKit } from '~/types/banner-studio'

it('inserts the selected Renault kit button style', async () => {
  const kit = { name: 'Renault', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=renault',
    colors: [{ role: 'accent', hex: '#ffcc00' }], logos: [],
    fonts: [{ role: 'body', family: 'Renault Life', weights: [500] }] } as BannerBrandKit
  const addLayer = vi.fn(layer => ({ id: 1, ...layer }))
  vi.stubGlobal('useBannerProjectBrand', () => ({ kit: ref(kit) }))
  vi.stubGlobal('useBannerStudio', () => ({
    state: { activeTool: 'hand' }, activeFormat: ref({ w: 300, h: 250 }), addLayer, toggleMask: vi.fn()
  }))
  try {
    const { useBannerInsert } = await import('~/composables/useBannerInsert')
    useBannerInsert().insertElement('button')
    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({
      type: 'button', bgColor: '#000000', textColor: '#ffffff', borderRadius: 0,
      textTransform: 'lowercase', fontFamily: 'Renault Life'
    }))
  } finally {
    vi.unstubAllGlobals()
  }
})
