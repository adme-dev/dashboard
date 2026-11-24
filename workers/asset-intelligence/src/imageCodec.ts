// PNG and JPEG in and out of raw RGBA. The worker has no canvas, so decoding is done in JavaScript.
import jpeg from 'jpeg-js'
import { decodePng, encodePng } from './pngCodec'
import type { RgbaImage } from './eraseComposite'

export type PictureFormat = 'png' | 'jpeg'

// Decoded size cap. 24MP of RGBA is about 96MB, close to a worker's memory ceiling.
export const MAX_PICTURE_PIXELS = 24_000_000

/** Identifies a picture by its first bytes. Content types on stored objects are not reliable. */
export function sniffPictureFormat(bytes: Uint8Array): PictureFormat | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  return null
}

/** Reads width and height from the header without decoding the pixels. */
export function readPictureSize(bytes: Uint8Array): { width: number; height: number } | null {
  const format = sniffPictureFormat(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (format === 'png' && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) }
  if (format === 'jpeg') {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]!
      // Start-of-frame markers carry the size; 0xC4, 0xC8 and 0xCC are tables, not frames.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
      }
      offset += 2 + view.getUint16(offset + 2)
    }
  }
  return null
}

export function decodePicture(bytes: Uint8Array): RgbaImage {
  const format = sniffPictureFormat(bytes)
  if (!format) throw new Error('Only PNG and JPEG pictures can be edited.')
  const size = readPictureSize(bytes)
  if (!size || !size.width || !size.height) throw new Error('The picture could not be read.')
  if (size.width * size.height > MAX_PICTURE_PIXELS) {
    throw new Error(`The picture is too large to edit (${size.width} x ${size.height}). The limit is 24 megapixels.`)
  }
  if (format === 'png') return decodePng(bytes)
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512, maxResolutionInMP: 24 })
  return { width: decoded.width, height: decoded.height, data: decoded.data }
}

export { encodePng }

export function encodeJpeg(image: RgbaImage, quality = 92): Uint8Array {
  const encoded = jpeg.encode({ width: image.width, height: image.height, data: image.data }, quality)
  return new Uint8Array(encoded.data.buffer, encoded.data.byteOffset, encoded.data.byteLength)
}
