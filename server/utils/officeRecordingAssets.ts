import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

function isSafeStorageKey(value: string) {
  return Boolean(value)
    && !value.startsWith('/')
    && !value.split('/').some(segment => segment === '..')
}

function localUploadUrl(key: string) {
  return `/api/_uploads/${encodeURI(key).replace(/#/g, '%23')}`
}

export async function resolveOfficeRecordingAssetUrl(key?: string | null) {
  const value = key?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    // Treat non-URL values as storage keys below.
  }

  if (value.startsWith('/api/_uploads/') && !value.split('/').some(segment => segment === '..')) {
    return value
  }

  if (!isSafeStorageKey(value)) return null

  const publicUrl = getPublicUrl(value)
  if (publicUrl) return publicUrl
  if (isStorageConfigured()) return getPresignedDownloadUrl(value, 60 * 60)
  return localUploadUrl(value)
}
