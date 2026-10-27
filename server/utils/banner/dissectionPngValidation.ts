import { Buffer } from 'node:buffer'
import { createInflate } from 'node:zlib'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_EDGE = 4096
const MAX_CHUNKS = 10_000
const SRGB_CHROMATICITIES = [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000]
const MAX_PIXELS = 10_000_000
const STREAM_CHUNK_BYTES = 8 * 1024
const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function invalid(reason: string): never {
  throw new Error(`Invalid PNG: ${reason}`)
}

function checkCrc(bytes: Buffer, start: number, end: number) {
  let crc = 0xffffffff
  for (let i = start; i < end; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 255]! ^ (crc >>> 8)
  if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end)) invalid('chunk CRC mismatch')
}

/**
 * Strict upload subset: 8-bit, noninterlaced, colour types 0/2/3/4/6.
 * Only PLTE/tRNS and fixed-size sRGB/gAMA/cHRM/pHYs metadata are supported.
 * Caller must keep bytes unchanged until this promise settles. No pixel raster is
 * retained: 8 KiB input/output chunks and at most one indexed-colour scanline,
 * in addition to zlib's bounded internal window.
 */
export async function validateDissectionPng(bytes: Buffer): Promise<{ width: number, height: number }> {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) invalid('file exceeds 10 MiB')
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) invalid('signature')

  let width = 0, height = 0, channels = 0, color = -1
  let paletteEntries = 0, transparencySeen = false, dataClosed = false
  let chunkCount = 0, metadataSeen = 0, gamma = 0, chromaticitiesOffset = -1
  let firstData = -1, lastDataEnd = -1, compressedLength = 0, ended = false
  for (let offset = 8; offset < bytes.length;) {
    if (++chunkCount > MAX_CHUNKS) invalid('more than 10000 chunks')
    if (bytes.length - offset < 12) invalid('truncated chunk')
    const length = bytes.readUInt32BE(offset)
    if (length > 0x7fffffff || length > bytes.length - offset - 12) invalid('chunk bounds')
    const start = offset + 8, end = start + length
    for (let i = offset + 4; i < start; i++) {
      const c = bytes[i]!
      if (!(c >= 65 && c <= 90) && !(c >= 97 && c <= 122)) invalid('chunk type')
    }
    if (bytes[offset + 6]! & 32) invalid('reserved chunk type bit')
    const type = bytes.toString('ascii', offset + 4, start)
    checkCrc(bytes, offset + 4, end)
    if (offset === 8 && type !== 'IHDR') invalid('IHDR must be first')
    if (firstData !== -1 && type !== 'IDAT') dataClosed = true

    switch (type) {
      case 'IHDR': {
        if (offset !== 8 || length !== 13) invalid('IHDR order or length')
        width = bytes.readUInt32BE(start)
        height = bytes.readUInt32BE(start + 4)
        if (!width || !height || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) invalid('dimensions exceed 4096px or 10000000 pixels')
        color = bytes[start + 9]!
        channels = color === 0 || color === 3 ? 1 : color === 2 ? 3 : color === 4 ? 2 : color === 6 ? 4 : 0
        if (bytes[start + 8] !== 8 || !channels || bytes[start + 10] !== 0 || bytes[start + 11] !== 0 || bytes[start + 12] !== 0) invalid('requires standard 8-bit noninterlaced image')
        break
      }
      case 'sRGB':
      case 'gAMA':
      case 'cHRM':
      case 'pHYs': {
        const flag = type === 'sRGB' ? 1 : type === 'gAMA' ? 2 : type === 'cHRM' ? 4 : 8
        const size = type === 'sRGB' ? 1 : type === 'gAMA' ? 4 : type === 'cHRM' ? 32 : 9
        if ((metadataSeen & flag) || firstData !== -1 || (type !== 'pHYs' && paletteEntries) || length !== size) invalid('metadata order, duplicate or length')
        metadataSeen |= flag
        if (type === 'sRGB') {
          if (bytes[start]! > 3) invalid('sRGB rendering intent')
        } else {
          // PNG four-byte unsigned integers have a maximum of 2^31 - 1.
          for (let i = start; i + 4 <= end; i += 4) {
            if (bytes.readUInt32BE(i) > 0x7fffffff) invalid('metadata integer range')
          }
          if (type === 'gAMA') {
            gamma = bytes.readUInt32BE(start)
            if (!gamma) invalid('zero gamma')
          } else if (type === 'cHRM') chromaticitiesOffset = start
          else if (bytes[start + 8]! > 1) invalid('physical dimensions unit')
        }
        break
      }
      case 'PLTE':
        if (paletteEntries || transparencySeen || firstData !== -1 || color === 0 || color === 4 || !length || length % 3 || length > 768) invalid('palette order or length')
        paletteEntries = length / 3
        break
      case 'tRNS':
        if (transparencySeen || firstData !== -1) invalid('transparency order')
        if (color === 3 ? !paletteEntries || !length || length > paletteEntries : color === 0 ? length !== 2 : color === 2 ? length !== 6 : true) invalid('transparency colour type or length')
        // This strict 8-bit subset requires transparent sample values in range.
        if (color !== 3) for (let i = start; i < end; i += 2) {
          if (bytes.readUInt16BE(i) > 255) invalid('transparency sample range')
        }
        transparencySeen = true
        break
      case 'IDAT':
        if (dataClosed || (color === 3 && !paletteEntries)) invalid('image data order or missing palette')
        if (firstData === -1) firstData = offset
        lastDataEnd = end + 4
        compressedLength += length
        break
      case 'IEND':
        if (length || firstData === -1 || !compressedLength || end + 4 !== bytes.length) invalid('IEND or trailing bytes')
        ended = true
        break
      default:
        // Includes APNG, EXIF, unknown critical and compressed metadata. A small
        // explicit subset prevents silently accepting unvalidated metadata rules.
        invalid('unsupported chunk')
    }
    offset = end + 4
  }
  if (!ended) invalid('missing IEND')
  if (metadataSeen & 1) {
    if (gamma && gamma !== 45455) invalid('sRGB gamma conflict')
    if (chromaticitiesOffset !== -1) for (let i = 0; i < SRGB_CHROMATICITIES.length; i++) {
      if (bytes.readUInt32BE(chromaticitiesOffset + i * 4) !== SRGB_CHROMATICITIES[i]) invalid('sRGB chromaticity conflict')
    }
  }

  const rowBytes = width * channels
  const expectedLength = (rowBytes + 1) * height
  // Only indexed images need unfiltering: every other 8-bit sample is legal.
  // In-place previous/current row; upperLeft preserves the overwritten byte.
  const row = color === 3 ? Buffer.alloc(rowBytes) : null
  let outputLength = 0, rowPosition = 0, filter = 0, upperLeft = 0

  await new Promise<void>((resolve, reject) => {
    const inflate = createInflate({ chunkSize: STREAM_CHUNK_BYTES })
    let settled = false
    function fail(reason: string) {
      if (settled) return
      settled = true
      inflate.destroy()
      reject(new Error(`Invalid PNG: ${reason}`))
    }
    inflate.on('error', () => fail('invalid or truncated zlib stream'))
    inflate.on('data', (data: Buffer) => {
      if (settled) return
      if (data.length > expectedLength - outputLength) return fail('excess decompressed data')
      outputLength += data.length
      let at = 0
      while (at < data.length) {
        if (rowPosition === 0) {
          filter = data[at++]!
          if (filter > 4) return fail('illegal scanline filter')
          rowPosition = 1
          upperLeft = 0
        } else {
          const take = Math.min(data.length - at, rowBytes + 1 - rowPosition)
          if (row) {
            for (let i = 0; i < take; i++) {
              const x = rowPosition - 1 + i
              const left = x ? row[x - 1]! : 0, up = row[x]!
              let predictor = 0
              if (filter === 1) predictor = left
              else if (filter === 2) predictor = up
              else if (filter === 3) predictor = (left + up) >>> 1
              else if (filter === 4) {
                const p = left + up - upperLeft
                const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft)
                predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft
              }
              const index = (data[at + i]! + predictor) & 255
              if (index >= paletteEntries) return fail('pixel references missing palette entry')
              row[x] = index
              upperLeft = up
            }
          }
          at += take
          rowPosition += take
          if (rowPosition === rowBytes + 1) rowPosition = 0
        }
      }
    })
    inflate.on('end', () => {
      if (settled) return
      if (outputLength !== expectedLength || rowPosition !== 0) return fail('incomplete scanlines')
      // bytesWritten is actual engine consumption (proved in Node and workerd),
      // not our submitted-byte counter. Includes the zlib header and Adler-32.
      if (inflate.bytesWritten !== compressedLength) return fail('trailing compressed data')
      settled = true
      inflate.destroy()
      resolve()
    })

    // Re-walk the already validated consecutive IDAT region without a chunk
    // array or concatenated compressed copy. Only one bounded write is pending.
    let chunkOffset = firstData, inputOffset = firstData + 8
    function pump(error?: Error | null) {
      if (settled) return
      if (error) return fail('invalid zlib input')
      while (chunkOffset < lastDataEnd) {
        const end = chunkOffset + 8 + bytes.readUInt32BE(chunkOffset)
        if (inputOffset < end) {
          const next = Math.min(end, inputOffset + STREAM_CHUNK_BYTES)
          const input = bytes.subarray(inputOffset, next)
          inputOffset = next
          inflate.write(input, pump)
          return
        }
        chunkOffset = end + 4
        inputOffset = chunkOffset + 8
      }
      inflate.end()
    }
    pump()
  })
  return { width, height }
}
