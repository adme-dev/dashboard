export const EMAIL_IMAGE_ASSET_MAX_BYTES = 200 * 1024 * 1024

export const EMAIL_IMAGE_ASSET_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
] as const

export const EMAIL_IMAGE_ASSET_ACCEPT = EMAIL_IMAGE_ASSET_MIME_TYPES.join(',')

export interface EdmImageAsset {
  id: string
  name: string
  mimeType: string
  fileSize: number
  r2Key: string
  url: string
  thumbnailUrl: string | null
  tags: string[]
  uploadedBy: string
  clientId?: string | null
  createdAt: string
}

export function emailImageAssetStorageName(fileName: string): string {
  const fallback = 'email-image'
  const cleaned = (fileName || fallback).trim()
  const ext = cleaned.includes('.') ? cleaned.split('.').pop()?.toLowerCase() : ''
  const base = cleaned
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback
  return ext ? `${base}.${ext}` : base
}

export function normaliseEmailImageAssetUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return encodeURI(trimmed).replace(/#/g, '%23')
}

export function isAllowedEmailImageMime(mimeType: string | null | undefined): boolean {
  return EMAIL_IMAGE_ASSET_MIME_TYPES.includes((mimeType || '').toLowerCase() as typeof EMAIL_IMAGE_ASSET_MIME_TYPES[number])
}

export function isWithinEmailImageAssetLimit(size: number): boolean {
  return Number.isFinite(size) && size >= 0 && size <= EMAIL_IMAGE_ASSET_MAX_BYTES
}

export function formatEmailImageAssetSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
