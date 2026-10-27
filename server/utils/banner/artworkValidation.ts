import { createError } from 'h3'
import { createHash } from 'node:crypto'
import { letteringRepairRegionSchema, type LetteringRepairRegion } from '../../../shared/bannerLetteringRepair'
import { PNG } from 'pngjs'
import { decode as decodeJpeg } from 'jpeg-js'
import {
  isBannerCopyLayerProtected,
  isSafeBannerRewrite
} from '../../../shared/bannerCopyProtection'

/** Reject animation and unhandled orientation metadata before decoding. */
export function assertStaticRepairSource(bytes: Buffer, mimeType: string) {
  if (mimeType === 'image/png') {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset)
      const type = bytes.toString('ascii', offset + 4, offset + 8)
      if (['acTL', 'fcTL', 'fdAT', 'eXIf'].includes(type))
        throw createError({ statusCode: 400, statusMessage: 'Animated or orientation-tagged sources require a reviewed static image' })
      if (offset + length + 12 > bytes.length) break // PNG validation rejects malformed chunks.
      offset += length + 12
    }
  } else if (mimeType === 'image/jpeg') {
    // EXIF orientation is applied by browsers but not jpeg-js. Conservatively
    // reject EXIF-bearing JPEGs until explicit orientation mapping is supported.
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset++] !== 0xff) break
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]!
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      const length = bytes.readUInt16BE(offset)
      if (length < 2 || offset + length > bytes.length) break
      if (marker === 0xe1 && bytes.toString('ascii', offset + 2, offset + 8) === 'Exif\0\0')
        throw createError({ statusCode: 400, statusMessage: 'EXIF-tagged JPEGs require a reviewed orientation-normalised source' })
      offset += length
    }
  }
}

export function cropLetteringRepairReference(source: Buffer, region: LetteringRepairRegion) {
  const parsed = letteringRepairRegionSchema.safeParse(region)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid lettering repair region' })
  const { width, height } = validateArtworkPng(source, false)
  const x = Math.ceil(region.x * width), y = Math.ceil(region.y * height)
  const w = Math.floor((region.x + region.w) * width) - x
  const h = Math.floor((region.y + region.h) * height) - y
  if (w < 1 || h < 1) throw createError({ statusCode: 400, statusMessage: 'Select a region containing at least one complete source pixel' })
  const decoded = PNG.sync.read(source, { checkCRC: true })
  const crop = new PNG({ width: w, height: h })
  for (let row = 0; row < h; row++)
    decoded.data.copy(crop.data, row * w * 4, ((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4)
  return { bytes: PNG.sync.write(crop), pixelRegion: { x, y, w, h } }
}

/** Replace RGBA only inside the approved integer rectangle; never blend/re-encode
 * untouched pixels through a lossy codec. Nearest-neighbour scaling is explicit
 * and deterministic; visual seams and the generated repair still need review. */
export function compositeLetteringRepair(source: Buffer, generated: Buffer, region: { x: number, y: number, w: number, h: number }) {
  const { width, height } = validateArtworkPng(source, false)
  validateArtworkPng(generated, false)
  if (!Object.values(region).every(Number.isSafeInteger) || region.x < 0 || region.y < 0 || region.w < 1 || region.h < 1 || region.x + region.w > width || region.y + region.h > height)
    throw createError({ statusCode: 400, statusMessage: 'Repair pixel bounds exceed source dimensions' })
  const output = PNG.sync.read(source, { checkCRC: true })
  const patch = PNG.sync.read(generated, { checkCRC: true })
  for (let y = 0; y < region.h; y++) for (let x = 0; x < region.w; x++) {
    const from = (Math.floor(y * patch.height / region.h) * patch.width + Math.floor(x * patch.width / region.w)) * 4
    const to = ((region.y + y) * width + region.x + x) * 4
    patch.data.copy(output.data, to, from, from + 4)
  }
  const bytes = PNG.sync.write(output)
  if (bytes.length > 20 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Repaired background exceeds the output byte budget' })
  return { bytes, width, height, sha256: createHash('sha256').update(bytes).digest('hex') }
}

export function assertArtworkRevision(saved: string | Date, requested: string) {
  if (new Date(saved).getTime() !== new Date(requested).getTime())
    throw createError({
      statusCode: 409,
      statusMessage: 'Artwork changed; save and request a new proposal'
    })
}
export function validateLetteringWords(
  layer: {
    text?: string
    copyLocked?: boolean
    feedBindings?: Array<{ property: string }>
  },
  wording: string
) {
  if (
    !isSafeBannerRewrite(
      layer.text || '',
      wording,
      isBannerCopyLayerProtected(layer)
    )
  )
    throw createError({
      statusCode: 400,
      statusMessage: 'Approved commercial or legal wording cannot be changed'
    })
}
export function validateArtworkPng(bytes: Uint8Array, transparency: boolean) {
  const b = Buffer.from(bytes)
  if (
    b.length < 33
    || b.length > 20 * 1024 * 1024
    || !b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw createError({
      statusCode: 502,
      statusMessage: 'Image provider returned an invalid PNG'
    })
  const width = b.readUInt32BE(16),
    height = b.readUInt32BE(20)
  if (
    !width
    || !height
    || width > 4096
    || height > 4096
    || width * height > 16777216
  )
    throw createError({
      statusCode: 502,
      statusMessage: 'Image output exceeds supported dimensions'
    })
  try {
    // pngjs bounds noninterlaced inflation, but its Adam7 path calls bare
    // inflateSync. Reject unsupported encoding before any decoder allocation.
    if (b.readUInt32BE(8) !== 13 || b.toString('ascii', 12, 16) !== 'IHDR'
      || b[24] !== 8 || ![0, 2, 3, 4, 6].includes(b[25]!)
      || b[26] !== 0 || b[27] !== 0 || b[28] !== 0) throw new Error('Unsupported PNG encoding')
    let offset = 8
    let chunks = 0
    let ended = false
    while (offset < b.length) {
      if (++chunks > 10000 || offset + 12 > b.length) throw new Error('Invalid PNG chunk bounds')
      const size = b.readUInt32BE(offset)
      const end = offset + size + 12
      const kind = b.toString('ascii', offset + 4, offset + 8)
      if (end > b.length || (kind === 'IHDR' && offset !== 8)
        || ['acTL', 'fcTL', 'fdAT'].includes(kind)) throw new Error('Unsupported PNG chunk')
      if (kind === 'IEND') {
        if (size !== 0 || end !== b.length) throw new Error('Invalid PNG end')
        ended = true
      }
      offset = end
    }
    if (!ended) throw new Error('Missing PNG end')
    const decoded = PNG.sync.read(b, { checkCRC: true })
    if (decoded.width !== width || decoded.height !== height || decoded.data.length !== width * height * 4)
      throw new Error('Invalid decoded PNG')
    let hasTransparency = false,
      hasVisiblePixels = false,
      hasClearEdges = true
    for (let i = 3; i < decoded.data.length; i += 4) {
      if (decoded.data[i]! < 255) hasTransparency = true
      if (decoded.data[i]! > 0) hasVisiblePixels = true
    }
    for (let x = 0; x < width; x++)
      if (
        decoded.data[x * 4 + 3]! > 8
        || decoded.data[((height - 1) * width + x) * 4 + 3]! > 8
      )
        hasClearEdges = false
    for (let y = 0; y < height; y++)
      if (
        decoded.data[y * width * 4 + 3]! > 8
        || decoded.data[(y * width + width - 1) * 4 + 3]! > 8
      )
        hasClearEdges = false
    if (!hasVisiblePixels || (transparency && !hasTransparency))
      throw new Error('Invalid alpha')
    return { width, height, hasTransparency, hasClearEdges }
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: transparency
        ? 'Lettering output must be a valid PNG with transparency and visible pixels'
        : 'Image provider returned an invalid PNG'
    })
  }
}

/** Check JPEG SOF dimensions before a bounded decoder can allocate pixel buffers. */
function jpegDimensions(bytes: Buffer) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG')
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG segment')
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]!
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length)
      throw new Error('Invalid JPEG length')
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) throw new Error('Invalid JPEG frame')
      return {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3)
      }
    }
    offset += length
  }
  throw new Error('Unsupported JPEG frame')
}

export function normaliseArtworkReference(
  input: Uint8Array,
  mimeType: string,
  maximumPixels = 4194304
) {
  const bytes = Buffer.from(input)
  if (bytes.length > 20 * 1024 * 1024)
    throw createError({
      statusCode: 413,
      statusMessage: 'Reference image is too large'
    })
  if (mimeType === 'image/png') {
    if (
      bytes.length < 24
      || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > maximumPixels
    )
      throw createError({
        statusCode: 413,
        statusMessage: 'Reference pixels exceed the remaining safe budget'
      })
    return { bytes, ...validateArtworkPng(bytes, false) }
  }
  if (mimeType !== 'image/jpeg')
    throw createError({
      statusCode: 400,
      statusMessage: 'Artwork references must be PNG or JPEG'
    })
  try {
    const dimensions = jpegDimensions(bytes)
    if (
      !dimensions.width
      || !dimensions.height
      || dimensions.width > 4096
      || dimensions.height > 4096
      || dimensions.width * dimensions.height > maximumPixels
    )
      throw new Error('JPEG dimensions exceed limit')
    const decoded = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: false,
      maxResolutionInMP: maximumPixels / 1000000,
      maxMemoryUsageInMB: 64
    })
    const png = new PNG({ width: decoded.width, height: decoded.height })
    png.data = Buffer.from(decoded.data)
    const normalised = PNG.sync.write(png)
    return { bytes: normalised, ...validateArtworkPng(normalised, false) }
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage:
        'JPEG reference is invalid or exceeds 4096px / 4 megapixels'
    })
  }
}

/** Generation references are forwarded unchanged; inspect headers without allocating pixel buffers. */
export function inspectArtworkReference(
  bytes: Buffer,
  mimeType: string,
  maximumPixels = 16777216
) {
  let dimensions: { width: number, height: number }
  if (mimeType === 'image/jpeg') {
    try {
      dimensions = jpegDimensions(bytes)
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'JPEG reference header is invalid' })
    }
  } else if (
    mimeType === 'image/png'
    && bytes.length >= 45
    && bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && bytes.toString('ascii', 12, 16) === 'IHDR'
      && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND'
  )
    dimensions = {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20)
    }
  else
    throw createError({
      statusCode: 400,
      statusMessage: 'Reference image header is invalid'
    })
  if (
    !dimensions.width
    || !dimensions.height
    || dimensions.width > 4096
    || dimensions.height > 4096
    || dimensions.width * dimensions.height > maximumPixels
  )
    throw createError({
      statusCode: 413,
      statusMessage:
        'Reference dimensions exceed 4096px / 16 megapixels or the combined budget'
    })
  return { ...dimensions, hasTransparency: false, hasClearEdges: false }
}
