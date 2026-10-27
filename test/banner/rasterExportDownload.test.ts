import { describe, expect, it, vi } from 'vitest'
import { fetchBannerRasterExport } from '../../app/utils/bannerRasterExportDownload'

const result = { formatKey: 'mrec', url: '/api/agency/banner-studio/exports/11111111-1111-4111-8111-111111111111/download', fileSize: 3 }

describe('private raster export downloads', () => {
  it('fetches authenticated bytes for a Blob download without a popup', async () => {
    const fetcher = vi.fn(async () => new Response('png', { headers: { 'content-type': 'image/png' } }))
    const blob = await fetchBannerRasterExport(result, 'png', fetcher)
    expect(await blob.text()).toBe('png')
    expect(fetcher).toHaveBeenCalledWith(result.url, { credentials: 'same-origin', redirect: 'error' })
  })

  it.each([401, 403, 404, 503])('rejects an HTTP %s instead of saving an error page', async (status) => {
    await expect(fetchBannerRasterExport(result, 'png', async () => new Response('error page', { status })))
      .rejects.toThrow('Download failed')
  })

  it('rejects a login page, wrong format, empty file or truncated body', async () => {
    for (const response of [
      new Response('png', { headers: { 'content-type': 'text/html' } }),
      new Response('png', { headers: { 'content-type': 'image/jpeg' } }),
      new Response('', { headers: { 'content-type': 'image/png' } }),
      new Response('pn', { headers: { 'content-type': 'image/png' } })
    ]) {
      await expect(fetchBannerRasterExport(result, 'png', async () => response)).rejects.toThrow('Download failed')
    }
  })

  it('rejects unexpected destinations and sizes before fetching', async () => {
    const fetcher = vi.fn()
    for (const change of [{ url: 'https://other.example/file.png' }, { url: '//other.example/file.png' }, { fileSize: 0 }, { fileSize: 21 * 1024 * 1024 }]) {
      await expect(fetchBannerRasterExport({ ...result, ...change }, 'png', fetcher)).rejects.toThrow('Download failed')
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([['jpg', 'image/jpeg'], ['gif', 'image/gif']] as const)('accepts the exact %s media type', async (format, mime) => {
    const blob = await fetchBannerRasterExport(result, format, async () => new Response('123', { headers: { 'content-type': mime } }))
    expect(blob.type).toBe(mime)
  })
})
