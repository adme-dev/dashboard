import { describe, expect, it, vi } from 'vitest'
import { overlayPreviewFonts, seekOverlayPreview } from '../../app/utils/video/bannerPreview'

describe('native video overlay preview parity', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const font = { id, name: 'Dealer face', url: 'https://app.xeroflow.io/font', tags: ['weight:700', 'format:woff2'], clientId: 'dealer' }
  it('resolves the exact managed font and rejects missing or other-client faces', () => {
    const layers = [{ fontAssetId: id }]
    expect(overlayPreviewFonts(layers, [font], 'dealer')).toEqual([{ id, family: 'Dealer face', url: font.url, weight: 700, format: 'woff2' }])
    expect(() => overlayPreviewFonts(layers, [], 'dealer')).toThrow(/font/i)
    expect(() => overlayPreviewFonts(layers, [font], 'other')).toThrow(/font/i)
  })
  it('seeks the native media clock, preserving embedded footage, and mutes iframe audio', async () => {
    const seek = vi.fn(async () => {})
    const media = { muted: false, pause: vi.fn() }
    await seekOverlayPreview({ __engagrFrame: { seek }, document: { querySelectorAll: () => [media] } }, 12.4)
    expect(seek).toHaveBeenCalledWith(12.4)
    expect(media.muted).toBe(true)
    expect(media.pause).toHaveBeenCalled()
  })
  it('retains the legacy GSAP fallback for older saved artwork', async () => {
    const tl = { pause: vi.fn(), seek: vi.fn() }
    await seekOverlayPreview({ gsap: { globalTimeline: { getChildren: () => [tl] } } }, 3)
    expect(tl.seek).toHaveBeenCalledWith(3)
  })
})
