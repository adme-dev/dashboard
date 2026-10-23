import { describe, expect, it } from 'vitest'
import { findArtworkBounds, fitArtworkToText } from '../../app/utils/banner-artwork'
import { bannerImageCropCss } from '../../shared/bannerImageCrop'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as buildServerHTML } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

describe('Generated typography placement', () => {
  it('trims a flat background while retaining the entire lettering and punctuation', () => {
    const pixels = new Uint8ClampedArray(100 * 100 * 4)
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
    for (let y = 40; y < 60; y++) for (let x = 10; x < 90; x++) pixels[(y * 100 + x) * 4] = 255
    const bounds = findArtworkBounds(pixels, 100, 100)
    expect(bounds.x).toBeLessThanOrEqual(0.1)
    expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(0.9)
    expect(bounds.y).toBeLessThanOrEqual(0.4)
    expect(bounds.y + bounds.h).toBeGreaterThanOrEqual(0.6)
    expect(bounds.h).toBeLessThan(0.3)
  })
  it('keeps textured backgrounds intact rather than guessing a crop', () => {
    const pixels = new Uint8ClampedArray(100 * 100 * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = (i / 4) % 2 ? 255 : 0
      pixels[i + 3] = 255
    }
    expect(findArtworkBounds(pixels, 100, 100)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
  it('places artwork at readable width and natural aspect, not inside a 40px text slot', () => {
    const placed = fitArtworkToText({ x: 125, y: 725, w: 750, h: 40 }, { width: 1024, height: 1024, crop: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 } }, { w: 1000, h: 1000 })
    expect(placed.w).toBe(750)
    expect(placed.h).toBe(187.5)
    expect(placed.y + placed.h / 2).toBe(745)
    expect(placed.w / placed.h).toBe(4)
  })
  it('keeps a large artwork on the canvas without distorting it', () => {
    const placed = fitArtworkToText({ x: 125, y: 925, w: 750, h: 40 }, { width: 1024, height: 1024, crop: { x: 0, y: 0, w: 1, h: 1 } }, { w: 1000, h: 1000 })
    expect(placed.y + placed.h).toBeLessThanOrEqual(1000)
    expect(placed.w).toBe(placed.h)
  })
  it('exports the crop identically in browser and server, and keeps original text hidden', () => {
    const layer = { id: 1, name: 'Effect', type: 'image', x: 0, y: 0, w: 300, h: 100, zIndex: 1, opacity: 1, src: '/art.png', imageCrop: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 }, startTime: 0, endTime: 5 } as Layer
    const original = { ...layer, id: 2, type: 'text', text: 'Original', hidden: true } as Layer
    for (const builder of [buildBannerHTML, buildServerHTML]) {
      const html = builder('custom_300x250', [layer, original], { includeAnimations: false })
      expect(html).toContain(bannerImageCropCss(layer.imageCrop))
      expect(html).toContain('display:none!important')
    }
    expect(bannerImageCropCss({ x: 0, y: 0, w: 0, h: 1 })).toBe('')
  })
})
