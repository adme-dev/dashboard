import { describe, expect, it, vi } from 'vitest'
import { commitPageStudioCheckpoint, type PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'
import { PageStudioCheckpointCommitSchema } from '~~/server/utils/pageStudio/controlSchemas'

const scope = {
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const checkpoint = {
  checkpointId: 'checkpoint_new',
  createdAt: '2026-09-06T00:00:00.000Z',
  digest: 'a'.repeat(64),
  etag: 'etag-new',
  objectKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/checkpoint_new.json`,
  scope,
  userId: '33333333-3333-4333-8333-333333333333'
}

function database(head: string | null, replay = false, metadata: unknown = undefined) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM page_studio_sites')) return { rows: [{ id: scope.siteId, current_checkpoint_id: head }] }
    if (sql.includes('FROM page_studio_checkpoints')) return { rows: replay
      ? [{
          id: checkpoint.checkpointId, tenant_id: scope.tenantId, client_id: scope.clientId,
          site_id: scope.siteId, digest: checkpoint.digest, object_key: checkpoint.objectKey,
          etag: checkpoint.etag, author_id: checkpoint.userId, created_at: checkpoint.createdAt
        }]
      : [] }
    if (sql.includes('FROM page_studio_audit_events')) return { rows: metadata === undefined ? [] : [{ metadata }] }
    if (sql.includes('INSERT INTO page_studio_checkpoints')) return { rows: [{ id: checkpoint.checkpointId }] }
    return { rows: [] }
  })
  return {
    query,
    runTransaction: async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) =>
      callback({ query } as PageStudioControlQueryClient)
  }
}

describe('guarded checkpoint commit', () => {
  it('requires an explicit revision, with null reserved for an empty site', () => {
    expect(PageStudioCheckpointCommitSchema.safeParse({ checkpoint }).success).toBe(false)
    expect(PageStudioCheckpointCommitSchema.safeParse({ checkpoint, expectedCheckpointId: '' }).success).toBe(false)
    expect(PageStudioCheckpointCommitSchema.safeParse({ checkpoint, expectedCheckpointId: null }).success).toBe(true)
    expect(PageStudioCheckpointCommitSchema.safeParse({ checkpoint, expectedCheckpointId: 'checkpoint_base', force: true }).success).toBe(false)
  })

  it.each([null, 'checkpoint_old'])('rejects stale base %s before writing any checkpoint or audit', async (expectedCheckpointId) => {
    const db = database('checkpoint_current')
    await expect(commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId }, db))
      .rejects.toMatchObject({ code: 'CHECKPOINT_BASE_MISMATCH', statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false)
  })

  it('returns a receipt for a newly committed head', async () => {
    const db = database('checkpoint_base')
    await expect(commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId: 'checkpoint_base' }, db))
      .resolves.toEqual({ acknowledged: true, checkpointId: checkpoint.checkpointId, currentCheckpointId: checkpoint.checkpointId, isCurrent: true })
  })

  it('acknowledges a superseded retry without claiming that it is still current', async () => {
    const db = database('checkpoint_newer', true, { commitProtocol: 'cas-v1', expectedCheckpointId: 'checkpoint_base' })
    await expect(commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId: 'checkpoint_base' }, db))
      .resolves.toEqual({ acknowledged: true, checkpointId: checkpoint.checkpointId, currentCheckpointId: 'checkpoint_newer', isCurrent: false })
    expect(db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false)
  })

  it.each([undefined, { commitProtocol: 'cas-v1', expectedCheckpointId: 'different_base' }])(
    'rejects reuse of an operation without its matching durable base receipt', async (metadata) => {
      const db = database('checkpoint_newer', true, metadata)
      await expect(commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId: 'checkpoint_base' }, db))
        .rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT', statusCode: 409 })
    }
  )
})
