export type SupportedBannerAssetMime
  = | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'
    | 'video/mp4'
    | 'video/webm'

export interface BannerAssetIdentity {
  fileName: string
  mimeType: SupportedBannerAssetMime
  size: number
  contentSha256: string
}

export interface BannerAssetIdentityInput {
  bytes: Uint8Array
  filename?: string
  claimedMimeType?: string
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

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  return bytes.byteLength >= offset + expected.length
    && expected.every((byte, index) => bytes[offset + index] === byte)
}

function hasAscii(bytes: Uint8Array, offset: number, expected: string): boolean {
  return hasBytes(bytes, offset, Array.from(expected, character => character.charCodeAt(0)))
}

export function detectBannerAssetMime(bytes: Uint8Array): SupportedBannerAssetMime | null {
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (hasAscii(bytes, 0, 'GIF87a') || hasAscii(bytes, 0, 'GIF89a')) return 'image/gif'
  if (hasAscii(bytes, 0, 'RIFF') && hasAscii(bytes, 8, 'WEBP')) return 'image/webp'
  if (hasAscii(bytes, 4, 'ftyp')) return 'video/mp4'
  if (hasBytes(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'
  return null
}

function normaliseClaimedMimeType(type: string | undefined): string | null {
  if (!type?.trim()) return null
  return type.split(';', 1)[0]!.trim().toLowerCase()
}

export function canonicalBannerAssetFileName(
  filename: string | undefined,
  mimeType: SupportedBannerAssetMime
): string {
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

export function canonicalBannerAssetIdentity(input: BannerAssetIdentityInput): BannerAssetIdentity {
  const mimeType = detectBannerAssetMime(input.bytes)
  if (!mimeType) throw new Error('Unsupported banner asset content')

  const claimedMimeType = normaliseClaimedMimeType(input.claimedMimeType)
  if (claimedMimeType && claimedMimeType !== mimeType) {
    throw new Error('Claimed MIME type does not match detected banner asset content')
  }

  if (!/^[a-f0-9]{64}$/i.test(input.contentSha256)) {
    throw new Error('Content SHA-256 must be a 64-character hexadecimal digest')
  }

  return {
    fileName: canonicalBannerAssetFileName(input.filename, mimeType),
    mimeType,
    size: input.bytes.byteLength,
    contentSha256: input.contentSha256.toLowerCase()
  }
}

export function serializeBannerAssetIdentity(identity: BannerAssetIdentity): string {
  return JSON.stringify({
    fileName: identity.fileName,
    mimeType: identity.mimeType,
    size: identity.size,
    contentSha256: identity.contentSha256
  })
}
