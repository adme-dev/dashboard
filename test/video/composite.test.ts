import { describe, it, expect } from 'vitest'
import { fitRect, kenBurnsTransformAt, activeVisualClipAt, resolveOverlayFormatKeyClient, extractBannerLayers } from '~~/app/utils/video/composite'

describe('fitRect (object-fit: cover)', () => {
  it('scales a 16:9 source to cover a 9:16 frame, cropping width', () => {
    const r = fitRect(1920, 1080, 1080, 1920)
    expect(r.height).toBe(1920)
    expect(Math.round(r.width)).toBe(3413)
    expect(r.y).toBe(0)
    expect(Math.round(r.x)).toBe(Math.round((1080 - r.width) / 2))
  })
})

describe('kenBurnsTransformAt', () => {
  const kb = { zoom_from: 1, zoom_to: 1.5, pan_from: [0, 0] as [number, number], pan_to: [10, 20] as [number, number] }
  it('returns the from-values at t=0 and to-values at t=duration', () => {
    expect(kenBurnsTransformAt(kb, 0, 4)).toMatchObject({ zoom: 1, panX: 0, panY: 0 })
    expect(kenBurnsTransformAt(kb, 4, 4)).toMatchObject({ zoom: 1.5, panX: 10, panY: 20 })
  })
  it('interpolates linearly at the midpoint', () => {
    expect(kenBurnsTransformAt(kb, 2, 4)).toMatchObject({ zoom: 1.25, panX: 5, panY: 10 })
  })
})

describe('activeVisualClipAt', () => {
  const clips = [
    { id: 'a', timeline_start_sec: 0, duration_sec: 3 },
    { id: 'b', timeline_start_sec: 3, duration_sec: 3 }
  ]
  it('picks the clip whose [start,end) contains t', () => {
    expect(activeVisualClipAt(clips as any, 1)?.id).toBe('a')
    expect(activeVisualClipAt(clips as any, 3)?.id).toBe('b')
    expect(activeVisualClipAt(clips as any, 6)).toBeNull()
  })
})

describe('resolveOverlayFormatKeyClient', () => {
  it('mirrors the server aspect mapping', () => {
    expect(resolveOverlayFormatKeyClient(1080, 1920)).toBe('fb_story')
    expect(resolveOverlayFormatKeyClient(1920, 1080)).toBe('tt_land')
    expect(resolveOverlayFormatKeyClient(1080, 1080)).toBe('ig_sq')
  })
})

describe('extractBannerLayers', () => {
  it('returns the layers for the given format key', () => {
    const canvasData = { fb_story: { layers: [{ id: 'l1' }], bgColor: '#000' } }
    expect(extractBannerLayers(canvasData, 'fb_story')).toEqual([{ id: 'l1' }])
  })
  it('returns [] when the format key is missing', () => {
    expect(extractBannerLayers({}, 'nope')).toEqual([])
  })
})
