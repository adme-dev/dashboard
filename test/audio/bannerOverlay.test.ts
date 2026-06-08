import { describe, it, expect, vi } from 'vitest'
const queryOneMock = vi.fn()
vi.mock('~~/server/utils/db', () => ({ queryOne: (...a: any[]) => queryOneMock(...a) }))
import { resolveOverlayFormatKey, loadBannerLayers } from '~~/server/utils/audio/bannerOverlay'

describe('resolveOverlayFormatKey', () => {
  it('maps aspect → a default banner format key', () => {
    expect(resolveOverlayFormatKey(1080, 1920)).toBe('fb_story')   // 9:16
    expect(resolveOverlayFormatKey(1080, 1080)).toBe('ig_sq')      // 1:1
    expect(resolveOverlayFormatKey(1920, 1080)).toBe('tt_land')    // 16:9
  })
})
describe('loadBannerLayers', () => {
  it('returns layers + size for a project/format', async () => {
    queryOneMock.mockResolvedValue({ canvasData: { fb_story: { layers: [{ id: 'l1' }] } } })
    const r = await loadBannerLayers('proj', 'fb_story')
    expect(r.layers).toEqual([{ id: 'l1' }]); expect(r.width).toBe(1080); expect(r.height).toBe(1920)
  })
  it('throws when the project or format is missing', async () => {
    queryOneMock.mockResolvedValue(null)
    await expect(loadBannerLayers('nope', 'fb_story')).rejects.toThrow()
    queryOneMock.mockResolvedValue({ canvasData: {} })
    await expect(loadBannerLayers('proj', 'fb_story')).rejects.toThrow()
  })
})
