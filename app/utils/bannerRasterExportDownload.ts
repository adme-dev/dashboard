import type { ImageExportResult } from '../types/banner-studio'

const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif' } as const

/** Download only the authenticated raster route and reject error/truncated bodies. */
export async function fetchBannerRasterExport(
  result: ImageExportResult,
  format: keyof typeof mimeTypes,
  fetcher: typeof fetch = fetch
): Promise<Blob> {
  const failed = () => new Error('Download failed. Please try again.')
  if (!/^\/api\/agency\/banner-studio\/exports\/[a-f0-9-]{36}\/download$/.test(result.url)
    || !Number.isSafeInteger(result.fileSize) || result.fileSize < 1 || result.fileSize > 20 * 1024 * 1024) throw failed()
  const response = await fetcher(result.url, { credentials: 'same-origin', redirect: 'error' })
  if (!response.ok || response.headers.get('content-type')?.split(';')[0]?.trim() !== mimeTypes[format]) {
    await response.body?.cancel().catch(() => {})
    throw failed()
  }
  const blob = await response.blob()
  if (blob.size !== result.fileSize) throw failed()
  return blob
}
