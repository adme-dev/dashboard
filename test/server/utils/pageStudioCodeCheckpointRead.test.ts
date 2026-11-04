import { describe, expect, it, vi } from 'vitest'
import { getLatestPageStudioCheckpoint } from '~~/server/utils/pageStudio/checkpointRead'

const scope = { tenantId: 'tenant', clientId: 'client', siteId: 'site' }
const binding = { formatVersion: 1, kind: 'code-pages', operationId: 'import_one', indexDigest: 'a'.repeat(64), contentDigest: 'b'.repeat(64) }
const row = { checkpoint_id: 'checkpoint', digest: 'c'.repeat(64), object_key: 'key' }
describe('native checkpoint pointer code identity', () => {
  it('retains the accepted immutable audit binding on a cold read', async () => {
    const queryOne = vi.fn().mockResolvedValue({ ...row, code_content: binding })
    expect(await getLatestPageStudioCheckpoint(scope, { queryOne })).toEqual({ checkpointId: row.checkpoint_id, digest: row.digest, objectKey: row.object_key, codeContent: binding })
    expect(queryOne.mock.calls[0][0]).toContain('workspace.checkpointed')
  })
  it('preserves historical typed pointer shape', async () => {
    expect(await getLatestPageStudioCheckpoint(scope, { queryOne: vi.fn().mockResolvedValue(row) })).toEqual({ checkpointId: row.checkpoint_id, digest: row.digest, objectKey: row.object_key })
  })
  it('fails on malformed stored binding instead of dropping it', async () => {
    await expect(getLatestPageStudioCheckpoint(scope, { queryOne: vi.fn().mockResolvedValue({ ...row, code_content: { ...binding, operationId: '../escape' } }) })).rejects.toThrow()
  })
})
