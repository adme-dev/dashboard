import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import {
  generationRequestSchema,
  letteringRequestSchema,
  nativeArtworkStyleSchema
} from '../../../shared/bannerArtwork'
import {
  validateArtworkPng,
  validateLetteringWords,
  assertArtworkRevision
} from '../../../server/utils/banner/artworkValidation'

describe('artwork proposal boundaries', () => {
  it('requires saved scoped revision and bounds provider spend inputs', () => {
    expect(
      generationRequestSchema.safeParse({ prompt: 'draw a car' }).success
    ).toBe(false)
    expect(
      generationRequestSchema.safeParse({
        projectId: crypto.randomUUID(),
        sourceRevision: '2026-10-26T00:00:00.000Z',
        formatKey: 'mrec',
        prompt: 'draw a car',
        approvedCopy: [],
        referenceAssetIds: Array.from({ length: 9 }, () => crypto.randomUUID())
      }).success
    ).toBe(false)
    expect(
      letteringRequestSchema.safeParse({ mode: 'raster', wording: 'hello' })
        .success
    ).toBe(false)
  })
  it('rejects stale revisions and protected copy changes', () => {
    expect(() =>
      assertArtworkRevision('2026-10-26T00:00:00Z', '2026-10-25T00:00:00Z')
    ).toThrow()
    expect(() =>
      validateLetteringWords({ text: '$399 per month' }, '$499 per month')
    ).toThrow()
    expect(() =>
      validateLetteringWords({ text: 'GRAND OPENING' }, 'GRAND OPENING')
    ).not.toThrow()
    expect(() =>
      validateLetteringWords({ text: 'SALE', copyLocked: true }, 'OPENING')
    ).toThrow()
  })
  it('accepts real bounded PNG and requires transparent raster lettering', () => {
    const image = new PNG({ width: 2, height: 2 })
    image.data.fill(255)
    const bytes = PNG.sync.write(image)
    expect(validateArtworkPng(bytes, false)).toMatchObject({
      width: 2,
      height: 2
    })
    expect(() => validateArtworkPng(bytes, true)).toThrow()
    image.data[3] = 0
    expect(validateArtworkPng(PNG.sync.write(image), true)).toMatchObject({
      hasTransparency: true
    })
    expect(() => validateArtworkPng(Buffer.from('not png'), false)).toThrow()
    expect(() => validateArtworkPng(bytes.subarray(0, 25), false)).toThrow()
  })
  it('allows supported native style only without executable CSS or arbitrary patches', () => {
    expect(
      nativeArtworkStyleSchema.safeParse({
        fontSize: 70,
        color: '#ff0000',
        fontFamily: 'Arial',
        fontWeight: 800,
        fontStyle: 'italic',
        textAlign: 'center',
        lineHeight: 1.1,
        letterSpacing: '0px'
      }).success
    ).toBe(true)
    expect(
      nativeArtworkStyleSchema.safeParse({
        fontSize: 70,
        color: 'url(https://evil)',
        src: 'https://evil'
      }).success
    ).toBe(false)
  })
})

describe('owned JPEG reference normalisation', () => {
  it('normalises a real JPEG to validated PNG and rejects malformed JPEG', async () => {
    const { encode } = await import('jpeg-js')
    const { normaliseArtworkReference }
      = await import('../../../server/utils/banner/artworkValidation')
    const jpeg = encode(
      { width: 3, height: 2, data: Buffer.alloc(3 * 2 * 4, 255) },
      80
    ).data
    const image = normaliseArtworkReference(jpeg, 'image/jpeg')
    expect(validateArtworkPng(image.bytes, false)).toMatchObject({
      width: 3,
      height: 2
    })
    expect(() =>
      normaliseArtworkReference(
        Buffer.from([255, 216, 255, 192, 0, 2]),
        'image/jpeg'
      )
    ).toThrow()
  })
})

describe('full-size generation reference headers', () => {
  it('accepts A4 dimensions without decoding a pixel allocation', async () => {
    const { encode } = await import('jpeg-js')
    const { inspectArtworkReference }
      = await import('../../../server/utils/banner/artworkValidation')
    const jpeg = Buffer.from(
      encode({ width: 3, height: 2, data: Buffer.alloc(24, 255) }, 80).data
    )
    const marker = jpeg.indexOf(Buffer.from([255, 192]))
    jpeg.writeUInt16BE(3508, marker + 5)
    jpeg.writeUInt16BE(2480, marker + 7)
    expect(inspectArtworkReference(jpeg, 'image/jpeg')).toMatchObject({
      width: 2480,
      height: 3508
    })
    expect(() =>
      inspectArtworkReference(jpeg, 'image/jpeg', 4000000)
    ).toThrow()
  })
})
