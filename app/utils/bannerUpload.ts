type SupportedBannerUploadMime
  = | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'
    | 'video/mp4'
    | 'video/webm'

const MIME_EXTENSIONS: Record<SupportedBannerUploadMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm'
}

function canonicalMimeType(type: string): SupportedBannerUploadMime {
  const mimeType = type.split(';', 1)[0]?.trim().toLowerCase()
  if (!mimeType || !(mimeType in MIME_EXTENSIONS)) {
    throw new Error('Unsupported banner asset MIME type')
  }
  return mimeType as SupportedBannerUploadMime
}

function canonicalFileName(filename: string, mimeType: SupportedBannerUploadMime): string {
  if ([...filename].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })) {
    throw new Error('Filename contains control characters')
  }

  const rawFilename = filename.trim() || 'banner-asset'
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

async function sha256Hex(value: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', value)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function nextBannerUploadKey(): string {
  return `banner-upload:${globalThis.crypto.randomUUID()}`
}

export async function prepareBannerUploadRequest(file: File, key: string): Promise<{
  body: FormData
  headers: Record<string, string>
}> {
  const bytes = await file.arrayBuffer()
  const mimeType = canonicalMimeType(file.type)
  const fileName = canonicalFileName(file.name, mimeType)
  const contentSha256 = await sha256Hex(bytes)
  const identity = JSON.stringify({
    fileName,
    mimeType,
    size: bytes.byteLength,
    contentSha256
  })
  const requestDigest = await sha256Hex(new TextEncoder().encode(identity))
  const body = new FormData()
  body.append('file', file)

  return {
    body,
    headers: {
      'Idempotency-Key': key,
      'X-Banner-Upload-Digest': requestDigest
    }
  }
}
