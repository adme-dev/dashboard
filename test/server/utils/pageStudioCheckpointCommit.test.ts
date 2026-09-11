import { describe, expect, it, vi } from 'vitest'
import { commitPageStudioCheckpoint, type PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'

const scope = { tenantId: 'tenant-alpha', clientId: '22222222-2222-4222-8222-222222222222', siteId: '11111111-1111-4111-8111-111111111111' }
const checkpoint = { checkpointId: 'seed_checkpoint', createdAt: '2026-09-09T00:00:00.000Z', digest: 'a'.repeat(64), etag: 'etag', scope, userId: '33333333-3333-4333-8333-333333333333', objectKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/seed_checkpoint.json` }
function database(head: string | null, existing = false) {
  const query = vi.fn(async (sql: string, _params: unknown[] = []) => {
    if (sql.includes('FROM page_studio_sites')) return { rows: [{ id: scope.siteId, current_checkpoint_id: head }] }
    if (sql.includes('FROM page_studio_checkpoints')) return { rows: existing ? [{ id: checkpoint.checkpointId, tenant_id: scope.tenantId, client_id: scope.clientId, site_id: scope.siteId, digest: checkpoint.digest, object_key: checkpoint.objectKey, etag: checkpoint.etag, author_id: checkpoint.userId, created_at: checkpoint.createdAt }] : [] }
    if (sql.includes('INSERT INTO page_studio_checkpoints')) return { rows: [{ id: checkpoint.checkpointId }] }
    return { rows: [] }
  })
  return { query, runTransaction: async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => callback({ query } as PageStudioControlQueryClient) }
}
describe('conditional Page Studio checkpoint commits', () => {
  it('creates the first head only when the expected head is empty', async () => {
    const db = database(null)
    await expect(commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId: null }, db)).resolves.toEqual({ acknowledged: true, checkpointId: checkpoint.checkpointId, currentCheckpointId: checkpoint.checkpointId, isCurrent: true })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(true)
    expect(db.query.mock.calls.filter(([sql]) => sql.includes('UPDATE page_studio_sites'))).toHaveLength(1)
  })
  it('rejects a stale base before inserting or auditing', async () => {
    const db = database('customer_checkpoint')
    await expect(commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId: null }, db)).rejects.toMatchObject({ code: 'CHECKPOINT_NOT_CURRENT', statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => /INSERT|UPDATE page_studio_sites/.test(sql))).toBe(false)
  })
  it('acknowledges an exact retry after customer edits without restoring its head', async () => {
    const db = database('customer_checkpoint', true)
    await expect(commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId: null }, db)).resolves.toEqual({ acknowledged: true, checkpointId: checkpoint.checkpointId, currentCheckpointId: 'customer_checkpoint', isCurrent: false })
    expect(db.query.mock.calls.some(([sql]) => /INSERT|UPDATE page_studio_sites/.test(sql))).toBe(false)
  })
  it('accepts a matching nonempty base and rejects changed immutable replay', async () => {
    await expect(commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId: 'previous' }, database('previous'))).resolves.toMatchObject({ isCurrent: true })
    await expect(commitPageStudioCheckpoint({ checkpoint: { ...checkpoint, digest: 'b'.repeat(64) }, expectedCheckpointId: null }, database('customer_checkpoint', true))).rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT' })
  })
  it('requires an explicit expected head and validates scope before a transaction', async () => {
    const db = database(null)
    await expect(commitPageStudioCheckpoint({ checkpoint } as never, db)).rejects.toThrow()
    await expect(commitPageStudioCheckpoint({ checkpoint: { ...checkpoint, objectKey: 'foreign' }, expectedCheckpointId: null }, db)).rejects.toMatchObject({ code: 'CHECKPOINT_SCOPE_INVALID' })
    expect(db.query).not.toHaveBeenCalled()
  })
})
