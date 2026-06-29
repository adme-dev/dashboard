import { describe, expect, it, vi } from 'vitest'

const mockKvDelete = vi.fn()

vi.mock('~~/server/utils/kv', () => ({
  kvDelete: (...args: unknown[]) => mockKvDelete(...args),
}))

const { invalidateSpendPeriodCaches } = await import('~~/server/utils/socialSpendCache')

describe('invalidateSpendPeriodCaches', () => {
  it('invalidates spend and analytics overview caches for the edited period, client, and platform', async () => {
    mockKvDelete.mockResolvedValue(undefined)

    await invalidateSpendPeriodCaches({} as any, {
      tenantId: 'tenant-1',
      period: '2026-06',
      platform: 'google_ads',
      clientId: 'client-1',
    })

    const keys = mockKvDelete.mock.calls.map(([, key]) => key)
    expect(keys).toEqual(expect.arrayContaining([
      'spend:summary:tenant-1:2026-06:all',
      'spend:summary:tenant-1:2026-06:google_ads',
      'spend:summary:tenant-1:2026-06:google',
      'spend:google:accounts:2026-06',
      'spend:daily:google:2026-06',
      'analytics:overview:all:2026-06-01:2026-06-30:all',
      'analytics:overview:all:2026-06-01:2026-06-30:google_ads',
      'analytics:overview:all:2026-06-01:2026-06-30:google',
      'analytics:overview:client-1:2026-06-01:2026-06-30:all',
      'analytics:overview:client-1:2026-06-01:2026-06-30:google_ads',
      'analytics:overview:client-1:2026-06-01:2026-06-30:google',
    ]))
  })
})
