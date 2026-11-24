import { describe, expect, it } from 'vitest'
import {
  blendBounds,
  compositeErase,
  coverageFromMask,
  coverageShare,
  featherCoverage,
  featherRadiusFor,
  maskMatchesPicture,
  modelFrameSize,
  paintHighlight,
  resizeCoverage,
  resizeImage,
  ringToneCorrection,
  type CoverageMap,
  type RgbaImage,
} from '~~/workers/asset-intelligence/src/eraseComposite'

function solid(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < width * height; index += 1) data.set(rgba, index * 4)
  return { width, height, data }
}

function pixel(image: RgbaImage, x: number, y: number): number[] {
  return [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)]
}

/** A transparent brush mask with an opaque painted rectangle. */
function brushMask(width: number, height: number, rect: { x: number; y: number; w: number; h: number }): RgbaImage {
  const mask = solid(width, height, [0, 0, 0, 0])
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) mask.data.set([0, 255, 150, 235], (y * width + x) * 4)
  }
  return mask
}

function coverageRect(width: number, height: number, rect: { x: number; y: number; w: number; h: number }): CoverageMap {
  return coverageFromMask(brushMask(width, height, rect))
}

describe('erase compositing maths', () => {
  describe('model frame size', () => {
    it('keeps the shape, stays near one megapixel and snaps to the 16px grid', () => {
      expect(modelFrameSize(3840, 2160)).toEqual({ width: 1328, height: 752 })
      expect(modelFrameSize(1080, 1920)).toEqual({ width: 752, height: 1328 })
      expect(modelFrameSize(4000, 4000)).toEqual({ width: 1008, height: 1008 })
      for (const [width, height] of [[3840, 2160], [1080, 1920], [4000, 4000], [6000, 2000]] as const) {
        const frame = modelFrameSize(width, height)
        expect(frame.width % 16).toBe(0)
        expect(frame.height % 16).toBe(0)
        expect(frame.width * frame.height).toBeLessThanOrEqual(1_050_000)
        expect(Math.abs(frame.width / frame.height - width / height) / (width / height)).toBeLessThan(0.03)
      }
    })

    it('does not enlarge a small picture for the model', () => {
      expect(modelFrameSize(1024, 576)).toEqual({ width: 1024, height: 576 })
      expect(modelFrameSize(640, 360)).toEqual({ width: 640, height: 368 })
    })
  })

  describe('reading the painted mask', () => {
    it('reads brush strokes from alpha on a transparent mask', () => {
      const coverage = coverageRect(20, 10, { x: 4, y: 2, w: 6, h: 3 })
      expect(coverage.data[2 * 20 + 4]).toBeCloseTo(235 / 255)
      expect(coverage.data[0]).toBe(0)
      expect(coverageShare(coverage)).toBeCloseTo(18 / 200)
    })

    it('reads a fully opaque mask as white-on-black', () => {
      const mask = solid(4, 2, [0, 0, 0, 255])
      mask.data.set([255, 255, 255, 255], 4)
      const coverage = coverageFromMask(mask)
      expect([...coverage.data]).toEqual([0, 1, 0, 0, 0, 0, 0, 0])
    })

    it('reports an unpainted mask as empty', () => {
      expect(coverageShare(coverageFromMask(solid(8, 8, [0, 0, 0, 0])))).toBe(0)
    })

    it('accepts a mask of the same shape at any size and rejects one painted on another frame', () => {
      expect(maskMatchesPicture({ width: 1024, height: 576 }, { width: 3840, height: 2160 })).toBe(true)
      expect(maskMatchesPicture({ width: 1280, height: 719 }, { width: 1920, height: 1080 })).toBe(true)
      // The old fixed 9:16 canvas against a 16:9 picture.
      expect(maskMatchesPicture({ width: 540, height: 960 }, { width: 1920, height: 1080 })).toBe(false)
      expect(maskMatchesPicture({ width: 1000, height: 1000 }, { width: 1920, height: 1080 })).toBe(false)
    })

    it('keeps the painted area in the same place when the mask is resized', () => {
      // Painted: the right half of the top half.
      const coverage = coverageRect(100, 50, { x: 50, y: 0, w: 50, h: 25 })
      const resized = resizeCoverage(coverage, 400, 300)
      const at = (u: number, v: number) => resized.data[Math.floor(v * 300) * 400 + Math.floor(u * 400)]!
      expect(at(0.75, 0.25)).toBeGreaterThan(0.9)
      expect(at(0.25, 0.25)).toBe(0)
      expect(at(0.75, 0.75)).toBe(0)
      expect(coverageShare(resized)).toBeCloseTo(0.25, 1)
    })
  })

  describe('soft edge', () => {
    const coverage = coverageRect(100, 100, { x: 40, y: 40, w: 20, h: 20 })
    const blend = featherCoverage(coverage, 4)
    const at = (x: number, y: number) => blend.data[y * 100 + x]!

    it('applies the edit in full across the painted area', () => {
      for (const [x, y] of [[40, 40], [50, 50], [59, 59], [40, 59]] as const) expect(at(x, y)).toBe(1)
    })

    it('fades out just outside the painted area and reaches exactly zero', () => {
      expect(at(37, 50)).toBeGreaterThan(0.3)
      expect(at(37, 50)).toBeLessThan(1)
      expect(at(33, 50)).toBeGreaterThan(0)
      expect(at(33, 50)).toBeLessThan(at(37, 50))
      // Beyond twice the radius nothing is touched.
      expect(at(30, 50)).toBe(0)
      expect(at(50, 70)).toBe(0)
      expect(at(0, 0)).toBe(0)
    })

    it('scales the edge with the frame', () => {
      expect(featherRadiusFor(1024, 576)).toBe(8)
      expect(featherRadiusFor(200, 100)).toBe(2)
    })

    it('finds the changed region in the size of the full picture', () => {
      const region = blendBounds(blend, { width: 1000, height: 2000 })!
      // Painted 40..59 plus an 8px fade each side at blend scale, scaled x10 and x20.
      expect(region.x).toBeGreaterThanOrEqual(300)
      expect(region.x).toBeLessThanOrEqual(320)
      expect(region.x + region.width).toBeGreaterThanOrEqual(680)
      expect(region.x + region.width).toBeLessThanOrEqual(700)
      expect(region.y).toBeGreaterThanOrEqual(600)
      expect(region.y + region.height).toBeLessThanOrEqual(1400)
      expect(blendBounds(featherCoverage(coverageFromMask(solid(10, 10, [0, 0, 0, 0])), 2), { width: 10, height: 10 })).toBeNull()
    })
  })

  describe('highlight for the model', () => {
    it('tints only the painted area green and leaves the rest alone', () => {
      const image = solid(10, 10, [200, 100, 50, 255])
      const highlighted = paintHighlight(image, coverageRect(10, 10, { x: 2, y: 2, w: 3, h: 3 }))
      expect(pixel(highlighted, 3, 3)).toEqual([80, 193, 110, 255])
      expect(pixel(highlighted, 8, 8)).toEqual([200, 100, 50, 255])
      // The input picture is not modified.
      expect(pixel(image, 3, 3)).toEqual([200, 100, 50, 255])
    })

    it('refuses a coverage map of the wrong size', () => {
      expect(() => paintHighlight(solid(10, 10, [0, 0, 0, 255]), coverageRect(5, 5, { x: 0, y: 0, w: 1, h: 1 }))).toThrow('must match')
    })
  })

  describe('pasting the result back', () => {
    it('changes only the painted region and keeps the original size', () => {
      // A 4000x2000 original, a model result at a quarter of the size.
      const original = solid(400, 200, [10, 20, 30, 255])
      const before = new Uint8Array(original.data)
      const model = solid(100, 50, [240, 230, 220, 255])
      const coverage = coverageRect(100, 50, { x: 60, y: 10, w: 20, h: 10 })
      const region = compositeErase(original, model, featherCoverage(coverage, 2))!

      expect(original.width).toBe(400)
      expect(original.height).toBe(200)
      // Centre of the painted area (u 0.7, v 0.3) takes the model's pixels in full.
      expect(pixel(original, 280, 60)).toEqual([240, 230, 220, 255])
      // Far from it nothing moved by a single bit.
      expect(pixel(original, 20, 20)).toEqual([10, 20, 30, 255])
      expect(pixel(original, 380, 180)).toEqual([10, 20, 30, 255])
      let changedOutside = 0
      for (let y = 0; y < 200; y += 1) {
        for (let x = 0; x < 400; x += 1) {
          const inside = x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height
          if (inside) continue
          const offset = (y * 400 + x) * 4
          if (original.data[offset] !== before[offset] || original.data[offset + 1] !== before[offset + 1] || original.data[offset + 2] !== before[offset + 2]) changedOutside += 1
        }
      }
      expect(changedOutside).toBe(0)
      // The changed region is the painted area plus its fade, not the whole frame.
      expect(region.width * region.height).toBeLessThan(400 * 200 * 0.2)
      expect(region.x).toBeGreaterThan(200)
    })

    it('blends on the fade and never touches alpha', () => {
      const original = solid(100, 100, [0, 0, 0, 128])
      const model = solid(100, 100, [200, 200, 200, 255])
      compositeErase(original, model, featherCoverage(coverageRect(100, 100, { x: 40, y: 40, w: 20, h: 20 }), 4))
      const edge = pixel(original, 37, 50)
      expect(edge[0]).toBeGreaterThan(0)
      expect(edge[0]).toBeLessThan(200)
      expect(edge[3]).toBe(128)
      expect(pixel(original, 50, 50)).toEqual([200, 200, 200, 128])
    })

    it('lines the result up by position when the model returns another shape or size', () => {
      // Model result: left half red, right half blue, at an odd size.
      const model = solid(64, 48, [255, 0, 0, 255])
      for (let y = 0; y < 48; y += 1) for (let x = 32; x < 64; x += 1) model.data.set([0, 0, 255, 255], (y * 64 + x) * 4)
      const original = solid(300, 100, [9, 9, 9, 255])
      // Paint a block wholly in the right half.
      const coverage = coverageRect(150, 50, { x: 110, y: 20, w: 20, h: 10 })
      compositeErase(original, model, featherCoverage(coverage, 1))
      expect(pixel(original, 240, 50)).toEqual([0, 0, 255, 255])
      // And one wholly in the left half.
      const left = solid(300, 100, [9, 9, 9, 255])
      compositeErase(left, model, featherCoverage(coverageRect(150, 50, { x: 20, y: 20, w: 20, h: 10 }), 1))
      expect(pixel(left, 60, 50)).toEqual([255, 0, 0, 255])
    })

    it('measures the model\'s tone drift on the ring outside the painted area and corrects for it', () => {
      // The model returns the same scene 12 levels brighter and slightly blue.
      const reference = solid(100, 100, [100, 110, 120, 255])
      const model = solid(50, 50, [112, 122, 140, 255])
      const painted = coverageRect(100, 100, { x: 40, y: 40, w: 20, h: 20 })
      const blend = featherCoverage(painted, 4)
      const correction = ringToneCorrection(reference, model, painted, blend)
      expect(correction.map(Math.round)).toEqual([-12, -12, -20])

      // With the correction the pasted patch matches its surroundings exactly.
      const original = solid(100, 100, [100, 110, 120, 255])
      compositeErase(original, model, blend, correction)
      expect(pixel(original, 50, 50)).toEqual([100, 110, 120, 255])
      expect(pixel(original, 37, 50)).toEqual([100, 110, 120, 255])
    })

    it('ignores the painted area itself when measuring drift, and caps an implausible shift', () => {
      const reference = solid(100, 100, [100, 100, 100, 255])
      const model = solid(100, 100, [100, 100, 100, 255])
      // The object under the mask is gone in the model's version: very different there, same elsewhere.
      for (let y = 40; y < 60; y += 1) for (let x = 40; x < 60; x += 1) model.data.set([250, 0, 0, 255], (y * 100 + x) * 4)
      const painted = coverageRect(100, 100, { x: 40, y: 40, w: 20, h: 20 })
      expect(ringToneCorrection(reference, model, painted, featherCoverage(painted, 4))).toEqual([0, 0, 0])
      const wild = solid(100, 100, [255, 255, 255, 255])
      expect(ringToneCorrection(reference, wild, painted, featherCoverage(painted, 4))).toEqual([-40, -40, -40])
      expect(ringToneCorrection(reference, model, coverageFromMask(solid(100, 100, [0, 0, 0, 0])), featherCoverage(coverageFromMask(solid(100, 100, [0, 0, 0, 0])), 4))).toEqual([0, 0, 0])
    })

    it('does nothing when nothing is painted', () => {
      const original = solid(20, 20, [1, 2, 3, 255])
      const before = new Uint8Array(original.data)
      expect(compositeErase(original, solid(20, 20, [9, 9, 9, 255]), featherCoverage(coverageFromMask(solid(20, 20, [0, 0, 0, 0])), 2))).toBeNull()
      expect(original.data).toEqual(before)
    })
  })

  it('resizes pictures by position', () => {
    const image = solid(4, 2, [0, 0, 0, 255])
    for (let y = 0; y < 2; y += 1) for (let x = 2; x < 4; x += 1) image.data.set([255, 255, 255, 255], (y * 4 + x) * 4)
    const resized = resizeImage(image, 40, 20)
    expect(pixel(resized, 5, 10)).toEqual([0, 0, 0, 255])
    expect(pixel(resized, 35, 10)).toEqual([255, 255, 255, 255])
  })
})
