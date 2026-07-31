import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execute: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  execute: mocks.execute,
  queryOne: vi.fn(),
  queryRows: vi.fn()
}))

describe('Search Console sync lease persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue(1)
  })

  it('guards every shared map and connection update with the current lease token', async () => {
    const { updateSearchConsoleSyncRun } = await import(
      '~~/server/utils/searchAuthority/sync'
    )

    await updateSearchConsoleSyncRun('run-id', {
      status: 'failed',
      leaseToken: '22222222-2222-4222-8222-222222222222',
      errors: [{ message: 'Search Console sync lease ownership was lost' }]
    })

    expect(mocks.execute).toHaveBeenCalledTimes(4)
    for (const [sql, params] of mocks.execute.mock.calls.slice(1)) {
      expect(sql).toContain('sync_lease_token')
      expect(params).toContain('22222222-2222-4222-8222-222222222222')
    }
  })
})
