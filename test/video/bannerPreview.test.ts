import { describe, expect, it, vi } from 'vitest'
import { overlayPreviewFonts, seekOverlayPreview, pauseOverlayPreview, withInteractiveOverlayPlayback } from '../../app/utils/video/bannerPreview'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { runInNewContext } from 'node:vm'
import type { Layer } from '../../app/types/banner-studio'

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
  it('uses the interactive transport without calling the capture-only seek on each frame', async () => {
    const totalTime = vi.fn(), seek = vi.fn()
    const window = { __engagrPreviewVideoClocks: [], __engagrTimeline: { pause: vi.fn(), totalTime }, __engagrFrame: { seek } }
    await seekOverlayPreview(window, 3, true)
    expect(totalTime).toHaveBeenCalledWith(3, false)
    expect(seek).not.toHaveBeenCalled()
    pauseOverlayPreview(window)
    expect(window.__engagrTimeline.pause).toHaveBeenCalledOnce()
  })
  it.each([false, true])('keeps capture seeks unchanged and opts only interactive HTML out (keyframes=%s)', (keyframes) => {
    const layer = { id: 3, type: 'video', src: '/clip.mp4', x: 0, y: 0, w: 1080, h: 1920, opacity: 1, startTime: 0, endTime: 10, animIn: 'none', animOut: 'none', keyframes: keyframes ? { opacity: [{ time: 0, value: 1 }, { time: 10, value: 1 }] } : undefined } as Layer
    const capture = buildBannerHTML('fb_story', [layer])
    expect(capture).toContain('vid.currentTime =')
    expect(buildBannerHTML('fb_story', [layer], { nativeVideoPlayback: false })).toBe(capture)
    const interactive = buildBannerHTML('fb_story', [layer], { nativeVideoPlayback: true, pausedAt: 0 })
    expect(interactive).not.toContain('vid.currentTime =')
    const html = withInteractiveOverlayPlayback(interactive, [layer])
    const adapter = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)![1]!
    const window: { __engagrPreviewVideoClocks?: Array<{ id: number }> } = {}
    runInNewContext(adapter, { window })
    expect(window.__engagrPreviewVideoClocks?.[0]?.id).toBe(3)
  })
})
