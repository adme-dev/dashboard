import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLatestPageStudioCheckpoint } from '~~/server/utils/pageStudio/controlStore'

const database = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryOneFresh: vi.fn(),
  transaction: vi.fn()
}))
vi.mock('~~/server/utils/db', () => database)

const scope = { tenantId: 'tenant-a', clientId: 'client-a', siteId: 'site-a' }
const current = {
  checkpoint_id: 'checkpoint_saved',
  digest: 'a'.repeat(64),
  object_key: 'tenants/tenant-a/clients/client-a/sites/site-a/checkpoints/checkpoint_saved.json'
}

beforeEach(() => vi.resetAllMocks())

describe('Page Studio checkpoint read-after-write consistency', () => {
  it.each([null, { ...current, checkpoint_id: 'checkpoint_previous' }])(
    'returns the saved checkpoint when the shared query cache still holds %j',
    async (stale) => {
      database.queryOne.mockResolvedValue(stale)
      database.queryOneFresh.mockResolvedValue(current)

      await expect(getLatestPageStudioCheckpoint(scope)).resolves.toEqual({
        checkpointId: current.checkpoint_id,
        digest: current.digest,
        objectKey: current.object_key
      })
      expect(database.queryOne).not.toHaveBeenCalled()
      expect(database.queryOneFresh).toHaveBeenCalledWith(
        expect.stringContaining('site.current_checkpoint_id'),
        [scope.tenantId, scope.clientId, scope.siteId]
      )
    }
  )

  it('does not fall back to a cached checkpoint if the authoritative read fails', async () => {
    database.queryOne.mockResolvedValue(current)
    database.queryOneFresh.mockRejectedValue(new Error('Authoritative read unavailable'))
    await expect(getLatestPageStudioCheckpoint(scope)).rejects.toThrow('Authoritative read unavailable')
    expect(database.queryOne).not.toHaveBeenCalled()
  })
})
