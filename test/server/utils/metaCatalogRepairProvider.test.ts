import { describe, expect, it, vi } from 'vitest'
import { createMetaCatalogProvider } from '~~/server/utils/metaCatalogProvider'

describe('catalogue repair provider contracts', () => {
  it('uses Vehicles creation and structured set rules on exact Graph edges', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: '123456' }), { status: 200 }))
    const provider = createMetaCatalogProvider({ accessToken: 'private-token', fetchImpl })
    await provider.createVehicleCatalog('999999', { name: 'Dealer Vehicles' })
    const filter = { and: [{ custom_label_0: { is_any: ['new', 'demo'] } }] }
    await provider.createProductSet('123456', { name: 'New & Demo', filter })
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/\/999999\/owned_product_catalogs$/)
    expect(new URLSearchParams(fetchImpl.mock.calls[0][1].body).get('vertical')).toBe('vehicles')
    expect(String(fetchImpl.mock.calls[1][0])).toMatch(/\/123456\/product_sets$/)
    expect(JSON.parse(new URLSearchParams(fetchImpl.mock.calls[1][1].body).get('filter')!)).toEqual(filter)
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).includes('private-token'))).toBe(true)
  })

  it('explicitly requests upload counters and error types without row samples or source URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: '555555' }), { status: 200 }))
    await createMetaCatalogProvider({ accessToken: 'private-token', fetchImpl }).getProductFeed('555555')
    const fields = new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('fields')!
    expect(fields).toContain('error_count')
    expect(fields).toContain('errors.limit(100){error_type,severity,total_count}')
    expect(fields).not.toContain('samples')
  })
})
