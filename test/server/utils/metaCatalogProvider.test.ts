import { describe, expect, it, vi } from 'vitest'
import { createMetaCatalogProvider } from '~~/server/utils/metaCatalogProvider'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

describe('Meta catalogue Graph provider', () => {
  it('uses bearer authorization, reads granted permissions, and never places the token in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({
      data: [
        { permission: 'ads_read', status: 'granted' },
        { permission: 'catalog_management', status: 'declined' },
        { permission: 'business_management', status: 'granted' }
      ]
    }))
    const provider = createMetaCatalogProvider({ accessToken: 'super-secret', fetchImpl })

    await expect(provider.listGrantedPermissions()).resolves.toEqual(['ads_read', 'business_management'])

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toContain('/me/permissions')
    expect(String(url)).not.toContain('super-secret')
    expect(init.headers.Authorization).toBe('Bearer super-secret')
    expect(init.redirect).toBe('manual')
  })

  it('fails closed on Graph redirects without relying on the unsupported Workers error mode', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'https://example.invalid/token-capture' }
    }))
    const provider = createMetaCatalogProvider({ accessToken: 'secret-token', fetchImpl })

    await expect(provider.listGrantedPermissions()).rejects.toMatchObject({ status: 302 })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe('manual')
  })

  it('merges owned and client catalogues without duplicate identities', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/owned_product_catalogs')) {
        return json({ data: [{ id: 'catalog-1', name: 'Owned', vertical: 'vehicles' }] })
      }
      if (url.includes('/client_product_catalogs')) {
        return json({
          data: [
            { id: 'catalog-1', name: 'Owned duplicate', vertical: 'vehicles' },
            { id: 'catalog-2', name: 'Client vehicles', vertical: 'vehicles' }
          ]
        })
      }
      throw new Error(`unexpected URL ${url}`)
    })
    const provider = createMetaCatalogProvider({ accessToken: 'token', fetchImpl: fetchImpl as typeof fetch })

    await expect(provider.listBusinessCatalogs('business-1')).resolves.toEqual([
      { id: 'catalog-1', name: 'Owned', vertical: 'vehicles', ownership: 'owned' },
      { id: 'catalog-2', name: 'Client vehicles', vertical: 'vehicles', ownership: 'client' }
    ])
  })

  it('uses the documented scheduled-feed and immediate URL-upload edges', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/catalog-1/product_feeds')) return json({ id: 'product-feed-1' })
      if (url.endsWith('/product-feed-1/uploads')) return json({ id: 'upload-1' })
      throw new Error(`unexpected URL ${url} ${init?.method}`)
    })
    const provider = createMetaCatalogProvider({ accessToken: 'token', fetchImpl: fetchImpl as typeof fetch })
    const schedule = {
      interval: 'DAILY' as const,
      url: 'https://socials.driveagent.io/api/feeds/feed-1/serve',
      hour: 0,
      timezone: 'Australia/Melbourne'
    }

    await expect(provider.createProductFeed('catalog-1', { name: 'Dealer feed', schedule }))
      .resolves.toEqual({ id: 'product-feed-1' })
    await expect(provider.createProductFeedUpload('product-feed-1', schedule.url))
      .resolves.toEqual({ id: 'upload-1' })

    const createBody = new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body))
    const uploadBody = new URLSearchParams(String(fetchImpl.mock.calls[1]?.[1]?.body))
    expect(JSON.parse(createBody.get('schedule') || '{}')).toEqual(schedule)
    expect(uploadBody.get('url')).toBe(schedule.url)
    expect(String(fetchImpl.mock.calls)).not.toContain('access_token')
  })

  it('preserves Meta error code and message for readiness classification without exposing the token', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(json({
      error: { code: 100, message: 'This application has not been approved to use this api.' }
    }, 400)))
    const provider = createMetaCatalogProvider({ accessToken: 'secret-token', fetchImpl })

    await expect(provider.listBusinessCatalogs('business-1')).rejects.toMatchObject({
      data: { error: { code: 100, message: 'This application has not been approved to use this api.' } }
    })
    await expect(provider.listBusinessCatalogs('business-1')).rejects.not.toThrow(/secret-token/)
  })
})
