// A small PNG reader and writer on top of node:zlib.
// The usual pure-JS PNG libraries rely on zlib internals that the Workers runtime does not have.
import { Buffer } from 'node:buffer'
import { deflateSync, inflateSync } from 'node:zlib'
import type { RgbaImage } from './eraseComposite'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const CHANNELS_BY_COLOR_TYPE: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

let crcTable: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) crc = crcTable[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Decodes an 8-bit, non-interlaced PNG of any colour type to RGBA. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  for (let index = 0; index < SIGNATURE.length; index += 1) {
    if (bytes[index] !== SIGNATURE[index]) throw new Error('The picture is not a PNG.')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  let palette: Uint8Array | null = null
  let transparency: Uint8Array | null = null
  const idat: Uint8Array[] = []
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!)
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      bitDepth = body[8]!
      colorType = body[9]!
      interlace = body[12]!
    } else if (type === 'PLTE') palette = body
    else if (type === 'tRNS') transparency = body
    else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  const channels = CHANNELS_BY_COLOR_TYPE[colorType]
  if (!width || !height || !channels) throw new Error('The PNG picture could not be read.')
  if (bitDepth !== 8) throw new Error(`This PNG uses ${bitDepth}-bit channels. Only 8-bit PNG pictures can be edited.`)
  if (interlace) throw new Error('Interlaced PNG pictures cannot be edited.')
  if (colorType === 3 && !palette) throw new Error('The PNG picture could not be read.')

  const raw = inflateSync(Buffer.concat(idat.map(chunk => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))))
  const stride = width * channels
  if (raw.length < (stride + 1) * height) throw new Error('The PNG picture is incomplete.')
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!
    const rowIn = y * (stride + 1) + 1
    const rowOut = y * stride
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[rowOut + x - channels]! : 0
      const up = y > 0 ? pixels[rowOut - stride + x]! : 0
      const upLeft = y > 0 && x >= channels ? pixels[rowOut - stride + x - channels]! : 0
      let value = raw[rowIn + x]!
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) value += paeth(left, up, upLeft)
      else if (filter !== 0) throw new Error('The PNG picture could not be read.')
      pixels[rowOut + x] = value & 0xff
    }
  }

  if (colorType === 6) return { width, height, data: pixels }
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const out = index * 4
    if (colorType === 2) {
      data[out] = pixels[index * 3]!
      data[out + 1] = pixels[index * 3 + 1]!
      data[out + 2] = pixels[index * 3 + 2]!
      data[out + 3] = 255
    } else if (colorType === 0 || colorType === 4) {
      const grey = pixels[index * channels]!
      data[out] = grey
      data[out + 1] = grey
      data[out + 2] = grey
      data[out + 3] = colorType === 4 ? pixels[index * 2 + 1]! : 255
    } else {
      const entry = pixels[index]!
      data[out] = palette![entry * 3] ?? 0
      data[out + 1] = palette![entry * 3 + 1] ?? 0
      data[out + 2] = palette![entry * 3 + 2] ?? 0
      data[out + 3] = transparency && entry < transparency.length ? transparency[entry]! : 255
    }
  }
  return { width, height, data }
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

/** Encodes RGBA as a lossless 8-bit PNG. */
export function encodePng(image: RgbaImage): Uint8Array {
  const stride = image.width * 4
  // Filter type 0 (none) on every row: fast, and deflate does the rest.
  const raw = new Uint8Array((stride + 1) * image.height)
  for (let y = 0; y < image.height; y += 1) {
    raw.set(image.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, image.width)
  view.setUint32(4, image.height)
  header.set([8, 6, 0, 0, 0], 8)
  // Level 3: several times faster than the default on large pictures for a few percent more bytes.
  const compressed = deflateSync(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength), { level: 3 })
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let cursor = 0
  for (const part of parts) { out.set(part, cursor); cursor += part.length }
  return out
}
