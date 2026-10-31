import { describe, expect, it } from 'vitest'
import { bannerAssetLayer, bannerAssetType } from '../../app/utils/banner-media'
import { coverImageCrop, moveImageCrop, resizeImageCrop, type CropCorner } from '../../app/utils/banner-crop'
import { bannerImageCropCss } from '../../shared/bannerImageCrop'
import type { BannerAsset } from '../../app/types/banner-studio'

const asset = (mimeType: string) => ({ id: 'asset', name: 'Media', url: '/media', mimeType } as BannerAsset)
describe('media insertion', () => {
  it.each(['image/png', 'video/mp4', 'audio/mpeg'])('inserts %s as the correct playable layer type', (mime) => {
    const layer = bannerAssetLayer(asset(mime), { w: 300, h: 250 })
    expect(layer.type).toBe(mime.split('/')[0])
    expect(layer.src).toBe('/media')
    expect(layer.animIn).toBe('none')
    if (layer.type !== 'audio') {
      expect(layer.fit).toBe('contain')
      expect(layer.x! + layer.w!).toBeLessThanOrEqual(300)
      expect(layer.y! + layer.h!).toBeLessThanOrEqual(250)
    }
  })
  it('does not turn font or document assets into broken image layers', () => {
    expect(bannerAssetType(asset('font/woff2'))).toBeUndefined()
    expect(() => bannerAssetLayer(asset('application/pdf'), { w: 300, h: 250 })).toThrow('Choose an image')
  })
})

describe('non-destructive image crop', () => {
  it('fills wide and tall frames without distorting source pixels', () => {
    for (const image of [{ w: 1200, h: 800 }, { w: 800, h: 1200 }]) for (const frame of [{ w: 300, h: 250 }, { w: 1080, h: 1920 }]) {
      const crop = coverImageCrop(image, frame)
      expect(image.w * crop.w / (image.h * crop.h)).toBeCloseTo(frame.w / frame.h)
      expect(bannerImageCropCss(crop)).not.toBe('')
    }
  })
  it('clamps movement to source bounds while retaining crop size', () => {
    const crop = { x: 0.1, y: 0.2, w: 0.4, h: 0.5 }
    expect(moveImageCrop(crop, -5, 5)).toEqual({ x: 0, y: 0.5, w: 0.4, h: 0.5 })
    expect(crop).toEqual({ x: 0.1, y: 0.2, w: 0.4, h: 0.5 })
  })
  it('keeps all four resize handles bounded and proportional, including extreme drags', () => {
    for (const corner of ['nw', 'ne', 'sw', 'se'] as CropCorner[]) for (const dx of [-10, -0.3, 0, 0.2, 10]) for (const dy of [-10, 0.1, 10]) {
      const original = { x: 0.1, y: 0.2, w: 0.6, h: 0.4 }
      const next = resizeImageCrop(original, corner, dx, dy)
      expect(next.x).toBeGreaterThanOrEqual(-0.000001)
      expect(next.y).toBeGreaterThanOrEqual(-0.000001)
      expect(next.x + next.w).toBeLessThanOrEqual(1.000001)
      expect(next.y + next.h).toBeLessThanOrEqual(1.000001)
      expect(next.w / next.h).toBeCloseTo(original.w / original.h)
      expect(next.w).toBeGreaterThan(0)
      expect(bannerImageCropCss(next)).not.toBe('')
    }
  })
})
