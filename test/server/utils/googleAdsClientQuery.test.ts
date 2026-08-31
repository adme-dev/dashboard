import { beforeEach, describe, expect, it, vi } from 'vitest'

const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({
  ofetch: (...args: unknown[]) => ofetchMock(...args),
}))

import { gaqlQuery } from '~~/server/utils/googleAdsClient'

beforeEach(() => ofetchMock.mockReset())

describe('gaqlQuery compatibility adapter', () => {
  it('preserves the legacy return shape while enforcing the internal row cap', async () => {
    const rows = Array.from({ length: 1_001 }, (_, id) => ({ customer: { id } }))
    ofetchMock.mockResolvedValue([{ results: rows }])

    const result = await gaqlQuery(
      '123-456-7890',
      'access',
      'developer',
      'SELECT customer.id FROM customer',
      '098-765-4321',
      0,
    )

    expect(result).toHaveLength(1_000)
    expect(result[0]).toEqual({ customer: { id: 0 } })
    expect(result[999]).toEqual({ customer: { id: 999 } })
  })
})
