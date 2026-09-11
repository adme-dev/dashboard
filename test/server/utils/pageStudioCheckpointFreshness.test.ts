import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLatestPageStudioCheckpoint } from '~~/server/utils/pageStudio/controlStore'

const reads = vi.hoisted(() => ({ cached: vi.fn(), fresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({
  queryOne: reads.cached,
  queryOneFresh: reads.fresh,
  transaction: vi.fn()
}))

const scope = {
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const oldHead = { checkpoint_id: 'old-head', digest: 'a'.repeat(64), object_key: 'old-key' }

describe('Page Studio checkpoint read freshness', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the committed editor head when the general connection still holds an older result', async () => {
    reads.cached.mockResolvedValue(oldHead)
    reads.fresh.mockResolvedValue({ checkpoint_id: 'new-head', digest: 'b'.repeat(64), object_key: 'new-key' })

    await expect(getLatestPageStudioCheckpoint(scope)).resolves.toEqual({
      checkpointId: 'new-head', digest: 'b'.repeat(64), objectKey: 'new-key'
    })
    expect(reads.cached).not.toHaveBeenCalled()
    expect(reads.fresh).toHaveBeenCalledWith(expect.stringContaining('site.current_checkpoint_id'), [
      scope.tenantId, scope.clientId, scope.siteId
    ])
  })

  it('does not resurrect a removed head from a cached result', async () => {
    reads.cached.mockResolvedValue(oldHead)
    reads.fresh.mockResolvedValue(null)

    await expect(getLatestPageStudioCheckpoint(scope)).resolves.toBeNull()
    expect(reads.cached).not.toHaveBeenCalled()
  })
})
