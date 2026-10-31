import { describe, it, expect, vi } from 'vitest'
const queryOneMock = vi.fn()
const fontMocks = vi.hoisted(() => ({ resolve: vi.fn(), access: vi.fn() }))
vi.mock('~~/server/utils/banner/fontAssets', () => ({ resolveCanvasExportFonts: fontMocks.resolve }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: fontMocks.access }))
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
  it('returns imported custom dimensions and playback metadata', async () => {
    const playback = { duration: 4, loopCount: 3 }
    queryOneMock.mockResolvedValue({ canvasData: { custom_1200x1200: { layers: [], playback } } })
    expect(await loadBannerLayers('proj', 'custom_1200x1200')).toEqual({ layers: [], width: 1200, height: 1200, playback })
  })
  it('loads exact font faces using the project client and authenticated request', async () => {
    const event = { context: {} } as never
    const face = { id: 'font-id', family: 'Brand', weight: 700, format: 'woff2', url: 'https://app.test/font' }
    const board = { layers: [{ fontFamily: 'Brand', fontWeight: 700, fontAssetId: 'font-id' }] }
    queryOneMock.mockResolvedValue({ clientId: 'client-a', canvasData: { fb_story: board } })
    fontMocks.resolve.mockResolvedValue([face])
    const result = await loadBannerLayers('project', 'fb_story', event)
    expect(fontMocks.access).toHaveBeenCalledWith(event, 'client-a')
    expect(fontMocks.resolve).toHaveBeenCalledWith(event, { fb_story: board }, 'client-a')
    expect(result.customFonts).toEqual([face])
    await expect(loadBannerLayers('project', 'fb_story')).rejects.toThrow('authenticated request context')
  })

  it('throws when the project or format is missing', async () => {
    queryOneMock.mockResolvedValue(null)
    await expect(loadBannerLayers('nope', 'fb_story')).rejects.toThrow()
    queryOneMock.mockResolvedValue({ canvasData: {} })
    await expect(loadBannerLayers('proj', 'fb_story')).rejects.toThrow()
  })
})
