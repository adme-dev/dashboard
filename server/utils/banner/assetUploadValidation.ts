import { createHash } from 'node:crypto'

export const MAX_BANNER_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_BANNER_VIDEO_BYTES = 100 * 1024 * 1024

export type SupportedBannerAssetMime
  = | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'
    | 'video/mp4'
    | 'video/webm'

export interface ValidatedBannerAssetUpload {
  buffer: Buffer
  fileName: string
  mimeType: SupportedBannerAssetMime
  size: number
  requestDigest: string
}

export interface BannerAssetUploadFile {
  filename?: string
  type?: string
  data: Uint8Array | Buffer
}

interface BannerAssetUploadDigestInput {
  fileName: string
  mimeType: SupportedBannerAssetMime
  size: number
  contentSha256: string
}

const MIME_EXTENSIONS: Record<SupportedBannerAssetMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm'
}

function hasBytes(buffer: Buffer, offset: number, bytes: number[]) {
  return buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte)
}

function detectBannerAssetMime(buffer: Buffer): SupportedBannerAssetMime | null {
  if (hasBytes(buffer, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (hasBytes(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (buffer.subarray(0, 6).equals(Buffer.from('GIF87a')) || buffer.subarray(0, 6).equals(Buffer.from('GIF89a'))) return 'image/gif'
  if (buffer.subarray(0, 4).equals(Buffer.from('RIFF')) && buffer.subarray(8, 12).equals(Buffer.from('WEBP'))) return 'image/webp'
  if (buffer.subarray(4, 8).equals(Buffer.from('ftyp'))) return 'video/mp4'
  if (hasBytes(buffer, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'
  return null
}

function normaliseFileName(filename: string | undefined, mimeType: SupportedBannerAssetMime): string {
  const suppliedFilename = filename || ''
  if ([...suppliedFilename].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })) {
    throw new Error('Filename contains control characters')
  }

  const rawFilename = suppliedFilename.trim() || 'banner-asset'
  const basename = rawFilename.split(/[\\/]/).pop() || ''
  const stem = basename.replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)

  if (stem.length < 6) {
    throw new Error('Filename must have a safe basename of at least six characters')
  }

  return `${stem}.${MIME_EXTENSIONS[mimeType]}`
}

function normaliseClaimedMimeType(type: string | undefined): string | null {
  if (!type?.trim()) return null
  return type.split(';', 1)[0].trim().toLowerCase()
}

export function digestBannerAssetUpload(input: BannerAssetUploadDigestInput): string {
  return createHash('sha256').update(JSON.stringify({
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
    contentSha256: input.contentSha256
  })).digest('hex')
}

export function validateBannerAssetUpload(file: BannerAssetUploadFile): ValidatedBannerAssetUpload {
  if (file.data.byteLength > MAX_BANNER_VIDEO_BYTES) {
    throw new Error('Banner asset upload exceeds the 100 MiB limit')
  }

  const buffer = Buffer.from(file.data)
  if (buffer.length === 0) throw new Error('Banner asset upload is empty')

  const mimeType = detectBannerAssetMime(buffer)
  if (!mimeType) throw new Error('Unsupported banner asset content')

  const claimedMimeType = normaliseClaimedMimeType(file.type)
  if (claimedMimeType && claimedMimeType !== mimeType) {
    throw new Error('Claimed MIME type does not match detected banner asset content')
  }

  const maximumSize = mimeType.startsWith('image/') ? MAX_BANNER_IMAGE_BYTES : MAX_BANNER_VIDEO_BYTES
  if (buffer.length > maximumSize) {
    throw new Error(`Banner ${mimeType.startsWith('image/') ? 'image' : 'video'} exceeds the ${maximumSize / 1024 / 1024} MiB limit`)
  }

  const fileName = normaliseFileName(file.filename, mimeType)
  const size = buffer.length
  const contentSha256 = createHash('sha256').update(buffer).digest('hex')

  return {
    buffer,
    fileName,
    mimeType,
    size,
    requestDigest: digestBannerAssetUpload({ fileName, mimeType, size, contentSha256 })
  }
}
