import { describe, expect, it, vi } from 'vitest'
import { executeGoogleAdsQuery } from '~~/server/utils/googleAds/query'

const auth = { accessToken: 'access', developerToken: 'developer' }

describe('executeGoogleAdsQuery', () => {
  it('sanitizes the customer ID, flattens stream batches, and reports capped rows', async () => {
    const request = vi.fn().mockResolvedValue({
      data: [
        { results: [{ id: 1 }, { id: 2 }] },
        { results: [{ id: 3 }] },
      ],
      requestId: 'request-1',
    })

    const result = await executeGoogleAdsQuery({
      customerId: '123-456-7890',
      query: 'SELECT customer.id FROM customer',
      auth,
      maxRows: 2,
    }, { request })

    expect(result).toEqual({
      rows: [{ id: 1 }, { id: 2 }],
      more: 1,
      requestId: 'request-1',
    })
    expect(request).toHaveBeenCalledWith({
      path: '/customers/1234567890/googleAds:searchStream',
      method: 'POST',
      auth,
      body: { query: 'SELECT customer.id FROM customer\nLIMIT 3' },
      write: false,
    })
  })

  it('rejects an invalid customer ID before calling Google', async () => {
    const request = vi.fn()

    await expect(executeGoogleAdsQuery({
      customerId: '123 OR 1=1',
      query: 'SELECT customer.id FROM customer',
      auth,
    }, { request })).rejects.toThrow('Invalid Google Ads customer ID')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects an empty query before calling Google', async () => {
    const request = vi.fn()

    await expect(executeGoogleAdsQuery({
      customerId: '1234567890',
      query: '   ',
      auth,
    }, { request })).rejects.toThrow('Google Ads query is required')
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    ['SELECT customer.id FROM customer', 'SELECT customer.id FROM customer\nLIMIT 3'],
    ['SELECT customer.id FROM customer LIMIT 1', 'SELECT customer.id FROM customer LIMIT 1'],
    ['SELECT customer.id FROM customer LIMIT 500', 'SELECT customer.id FROM customer LIMIT 3'],
  ])('bounds the provider query before sending it: %s', async (query, expectedQuery) => {
    const request = vi.fn().mockResolvedValue({ data: [], requestId: undefined })

    await executeGoogleAdsQuery({
      customerId: '1234567890',
      query,
      auth,
      maxRows: 2,
    }, { request })

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      body: { query: expectedQuery },
    }))
  })

  it('caps requested rows at 10,000', async () => {
    const providerRows = Array.from({ length: 10_001 }, (_, id) => ({ id }))
    const request = vi.fn().mockResolvedValue({
      data: [{ results: providerRows }],
      requestId: undefined,
    })

    const result = await executeGoogleAdsQuery({
      customerId: '1234567890',
      query: 'SELECT customer.id FROM customer',
      auth,
      maxRows: 50_000,
    }, { request })

    expect(result.rows).toHaveLength(10_000)
    expect(result.more).toBe(1)
  })

  it('uses the safe default when maxRows is not finite', async () => {
    const request = vi.fn().mockResolvedValue({
      data: [{ results: [{ id: 1 }] }],
      requestId: undefined,
    })

    const result = await executeGoogleAdsQuery({
      customerId: '1234567890',
      query: 'SELECT customer.id FROM customer',
      auth,
      maxRows: Number.NaN,
    }, { request })

    expect(result.rows).toEqual([{ id: 1 }])
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      body: { query: 'SELECT customer.id FROM customer\nLIMIT 1001' },
    }))
  })
})
