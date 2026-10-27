import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { letteringRepairRequestSchema } from '../../../shared/bannerLetteringRepair'
import * as repair from '../../../server/utils/banner/artworkValidation'

const request = { projectId: '00000000-0000-4000-8000-000000000001', sourceRevision: '2026-10-26T00:00:00Z', formatKey: 'mrec', layerId: 1, sourceWording: 'SALE', wording: 'OPENING', regionReviewed: true, region: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }
describe('lettering repair contract and pixel enforcement', () => {
  it.each([
    { x: -0.1, y: 0, w: 0.5, h: 0.5 }, { x: 0.8, y: 0, w: 0.3, h: 0.5 },
    { x: 0, y: 0, w: 0, h: 0.5 }, { x: 0, y: NaN, w: 1, h: 1 },
    { x: 0, y: 0, w: Infinity, h: 1 }, { x: 0, y: 0.9, w: 1, h: 0.2 }
  ])('rejects invalid bounds %j', (region) => {
    expect(letteringRepairRequestSchema.safeParse({ ...request, region }).success).toBe(false)
  })
  it('requires reviewed region and exact nonblank wording', () => {
    expect(letteringRepairRequestSchema.safeParse(request).success).toBe(true)
    expect(letteringRepairRequestSchema.safeParse({ ...request, regionReviewed: false }).success).toBe(false)
    expect(letteringRepairRequestSchema.safeParse({ ...request, wording: ' ' }).success).toBe(false)
  })
  it('crops only source pixels and replaces only the inward-rounded region, preserving RGBA outside', () => {
    const source = new PNG({ width: 7, height: 6 })
    for (let i = 0; i < source.data.length; i++) source.data[i] = (i * 19) % 256
    const sourceBytes = PNG.sync.write(source)
    const crop = repair.cropLetteringRepairReference(sourceBytes, { x: 0.2, y: 0.2, w: 0.6, h: 0.6 })
    expect(crop.pixelRegion).toEqual({ x: 2, y: 2, w: 3, h: 2 })
    const decodedCrop = PNG.sync.read(crop.bytes)
    expect([...decodedCrop.data.subarray(0, 4)]).toEqual([...source.data.subarray((2 * 7 + 2) * 4, (2 * 7 + 3) * 4)])
    const patch = new PNG({ width: 2, height: 2 })
    patch.data.fill(127)
    const output = repair.compositeLetteringRepair(sourceBytes, PNG.sync.write(patch), crop.pixelRegion)
    const decoded = PNG.sync.read(output.bytes)
    expect([decoded.width, decoded.height]).toEqual([7, 6])
    for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) {
      const offset = (y * 7 + x) * 4
      const inside = x >= 2 && x < 5 && y >= 2 && y < 4
      expect([...decoded.data.subarray(offset, offset + 4)]).toEqual(inside ? [127, 127, 127, 127] : [...source.data.subarray(offset, offset + 4)])
    }
    expect(PNG.sync.read(sourceBytes).data).toEqual(source.data)
  })
  it('rejects subpixel and invalid image repairs', () => {
    const png = new PNG({ width: 4, height: 4 })
    png.data.fill(255)
    const source = PNG.sync.write(png)
    expect(() => repair.cropLetteringRepairReference(source, { x: 0.1, y: 0.1, w: 0.01, h: 0.01 })).toThrow()
    expect(() => repair.compositeLetteringRepair(source, Buffer.from('invalid'), { x: 1, y: 1, w: 2, h: 2 })).toThrow()
    expect(() => repair.compositeLetteringRepair(source, source, { x: 3, y: 3, w: 2, h: 2 })).toThrow()
  })
  it.each(['acTL', 'fcTL', 'fdAT', 'eXIf'])('rejects unsafe PNG metadata %s before pixel decode', (type) => {
    const png = new PNG({ width: 2, height: 2 })
    png.data.fill(255)
    const original = PNG.sync.write(png)
    const chunk = Buffer.alloc(12)
    chunk.write(type, 4, 'ascii')
    const tagged = Buffer.concat([original.subarray(0, 33), chunk, original.subarray(33)])
    expect(() => repair.assertStaticRepairSource(original, 'image/png')).not.toThrow()
    expect(() => repair.assertStaticRepairSource(tagged, 'image/png')).toThrow(/Animated or orientation/)
  })
  it('rejects EXIF-tagged JPEG before normalization loses orientation metadata', async () => {
    const { encode } = await import('jpeg-js')
    const jpeg = Buffer.from(encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 80).data)
    const exif = Buffer.from([0xff, 0xe1, 0, 8, 69, 120, 105, 102, 0, 0])
    expect(() => repair.assertStaticRepairSource(jpeg, 'image/jpeg')).not.toThrow()
    expect(() => repair.assertStaticRepairSource(Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]), 'image/jpeg')).toThrow(/EXIF/)
  })
})
