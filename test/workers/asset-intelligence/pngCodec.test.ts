import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { decodePng, encodePng } from '~~/workers/asset-intelligence/src/pngCodec'
import { decodePicture, readPictureSize, sniffPictureFormat, encodeJpeg } from '~~/workers/asset-intelligence/src/imageCodec'

function gradient(width: number, height: number) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set([x * 7 % 256, y * 13 % 256, (x + y) * 3 % 256, (x * y) % 256], (y * width + x) * 4)
  }
  return { width, height, data }
}

describe('worker PNG codec', () => {
  it('round-trips RGBA without loss', () => {
    const image = gradient(37, 23)
    const decoded = decodePng(encodePng(image))
    expect([decoded.width, decoded.height]).toEqual([37, 23])
    expect(decoded.data).toEqual(image.data)
  })

  it('writes PNGs a reference decoder reads identically', () => {
    const image = gradient(19, 11)
    const reference = PNG.sync.read(Buffer.from(encodePng(image)))
    expect([reference.width, reference.height]).toEqual([19, 11])
    expect(new Uint8Array(reference.data)).toEqual(image.data)
  })

  it.each([
    ['RGBA with adaptive filters', { colorType: 6 as const, filterType: -1 }],
    ['RGBA, Paeth filter', { colorType: 6 as const, filterType: 4 }],
    ['RGBA, Average filter', { colorType: 6 as const, filterType: 3 }],
    ['RGB', { colorType: 2 as const, filterType: -1 }],
    ['greyscale with alpha', { colorType: 4 as const, filterType: -1 }],
    ['greyscale', { colorType: 0 as const, filterType: -1 }],
  ])('reads %s PNGs written by a reference encoder', (_name, options) => {
    const image = gradient(41, 29)
    const png = new PNG({ width: 41, height: 29 })
    png.data = Buffer.from(image.data)
    const encoded = PNG.sync.write(png, { colorType: options.colorType, filterType: options.filterType, inputHasAlpha: true })
    const expected = PNG.sync.read(encoded)
    const decoded = decodePng(new Uint8Array(encoded))
    expect([decoded.width, decoded.height]).toEqual([41, 29])
    expect(decoded.data).toEqual(new Uint8Array(expected.data))
  })

  it('reads the transparent brush mask a browser canvas produces', () => {
    // Fully transparent except one opaque stroke pixel.
    const mask = { width: 8, height: 4, data: new Uint8Array(8 * 4 * 4) }
    mask.data.set([0, 255, 150, 235], (1 * 8 + 5) * 4)
    const decoded = decodePng(encodePng(mask))
    expect(decoded.data[(1 * 8 + 5) * 4 + 3]).toBe(235)
    expect(decoded.data[3]).toBe(0)
  })

  it('refuses what it cannot read with a plain reason', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow('not a PNG')
    const png = new PNG({ width: 4, height: 4, bitDepth: 16 })
    png.data = Buffer.alloc(4 * 4 * 8)
    const sixteenBit = PNG.sync.write(png, { bitDepth: 16, colorType: 6, inputHasAlpha: true })
    expect(() => decodePng(new Uint8Array(sixteenBit))).toThrow('Only 8-bit PNG pictures can be edited.')
  })

  it('identifies pictures by their bytes and reads their size from the header', () => {
    const png = encodePng(gradient(64, 48))
    const jpeg = encodeJpeg(gradient(80, 32))
    expect(sniffPictureFormat(png)).toBe('png')
    expect(sniffPictureFormat(jpeg)).toBe('jpeg')
    expect(sniffPictureFormat(new TextEncoder().encode('ftypmp42 video'))).toBeNull()
    expect(readPictureSize(png)).toEqual({ width: 64, height: 48 })
    expect(readPictureSize(jpeg)).toEqual({ width: 80, height: 32 })
    const decoded = decodePicture(jpeg)
    expect([decoded.width, decoded.height]).toEqual([80, 32])
    expect(() => decodePicture(new TextEncoder().encode('not a picture at all'))).toThrow('Only PNG and JPEG pictures can be edited.')
  })
})
