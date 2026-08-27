import { describe, expect, it, vi } from 'vitest'
import {
  MetaCatalogProviderError,
  createMetaProductCatalog,
  deleteMetaProductCatalog,
  listMetaBusinesses,
  listMetaProductCatalogs,
  updateMetaProductCatalog,
} from '~~/server/utils/metaCatalogClient'

describe('Meta catalog client', () => {
  it('paginates and stably sorts accessible Businesses', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: '2', name: 'Zulu' }], paging: { next: 'https://graph.facebook.com/page-2?after=cursor&access_token=provider-token' } })
      .mockResolvedValueOnce({ data: [{ id: '1', name: 'Alpha' }] })

    await expect(listMetaBusinesses('secret-token', fetchImpl)).resolves.toEqual([
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Zulu' },
    ])
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://graph.facebook.com/page-2?after=cursor', {
      headers: { Authorization: 'Bearer secret-token' },
    })
  })

  it('does not send the bearer token to a non-Meta pagination host', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      data: [{ id: '1', name: 'Dealer Group' }],
      paging: { next: 'https://attacker.example/collect' },
    })

    await expect(listMetaBusinesses('secret-token', fetchImpl)).rejects.toThrow('invalid pagination URL')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('normalizes catalog pages and missing counts', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        data: [{ id: 'cat-2', name: 'Vehicles', vertical: 'vehicles', owner_business: { id: 'biz-1', name: 'Dealer Group' } }],
        paging: { next: 'https://graph.facebook.com/catalog-page-2' },
      })
      .mockResolvedValueOnce({
        data: [{ id: 'cat-1', name: 'Commerce', product_count: '12', feed_count: 1, business: { id: 'biz-1', name: 'Dealer Group' } }],
      })

    const catalogs = await listMetaProductCatalogs('biz-1', 'secret-token', fetchImpl)

    expect(catalogs).toEqual([
      expect.objectContaining({ id: 'cat-1', productCount: 12, feedCount: 1, businessId: 'biz-1' }),
      expect.objectContaining({ id: 'cat-2', productCount: null, feedCount: null, businessId: 'biz-1' }),
    ])
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://graph.facebook.com/catalog-page-2', {
      headers: { Authorization: 'Bearer secret-token' },
    })
  })

  it('creates and re-reads a catalog with the requested vertical', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ id: 'cat-1' })
      .mockResolvedValueOnce({ id: 'cat-1', name: 'Dealer Vehicles', vertical: 'vehicles', owner_business: { id: 'biz-1' } })

    const catalog = await createMetaProductCatalog('biz-1', 'secret-token', {
      name: 'Dealer Vehicles',
      vertical: 'vehicles',
    }, fetchImpl)

    expect(catalog.id).toBe('cat-1')
    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.stringContaining('/biz-1/owned_product_catalogs'), {
      method: 'POST',
      body: { name: 'Dealer Vehicles', vertical: 'vehicles' },
      headers: { Authorization: 'Bearer secret-token' },
    })
  })

  it('renames by POST and re-reads the node', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ id: 'cat-1', name: 'Renamed catalog' })

    await updateMetaProductCatalog('cat-1', 'secret-token', { name: 'Renamed catalog' }, fetchImpl)

    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.stringContaining('/cat-1'), {
      method: 'POST',
      body: { name: 'Renamed catalog' },
      headers: { Authorization: 'Bearer secret-token' },
    })
  })

  it('deletes without a force flag', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ success: true })

    await deleteMetaProductCatalog('cat-1', 'secret-token', fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/cat-1'), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer secret-token' },
    })
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('allow_delete_catalog_with_live_product_set')
  })

  it('returns safe provider diagnostics without token-bearing URLs', async () => {
    const fetchImpl = vi.fn().mockRejectedValue({
      statusCode: 403,
      data: { error: { message: 'Provider saw secret-token at https://graph.facebook.com/cat-1?access_token=secret-token', code: 200, error_subcode: 99, type: 'OAuthException', fbtrace_id: 'trace-1' } },
    })

    const error = await listMetaBusinesses('secret-token', fetchImpl).catch(value => value)

    expect(error).toBeInstanceOf(MetaCatalogProviderError)
    expect(error).toMatchObject({ httpStatus: 403, code: 200, subcode: 99, type: 'OAuthException', traceId: 'trace-1' })
    expect(JSON.stringify({ message: error.message, ...error })).not.toContain('secret-token')
  })
})
