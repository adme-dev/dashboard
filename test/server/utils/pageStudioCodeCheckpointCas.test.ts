import { describe, expect, it, vi } from 'vitest'
import { commitPageStudioCheckpoint, commitPageStudioEditorCheckpoint } from '~~/server/utils/pageStudio/controlStore'
import { PageStudioCheckpointCommitSchema } from '~~/server/utils/pageStudio/controlSchemas'
import { codeFixture } from '../../fixtures/pageStudioCodeContent'

function database(input: Awaited<ReturnType<typeof codeFixture>>['input'], options: { pageLimit?: number, currentBinding?: unknown, replayBinding?: unknown, replay?: boolean, head?: string } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('pages_per_site_limit')) return { rows: [{ pages_per_site_limit: options.pageLimit ?? 20 }] }
    if (sql.includes('FROM page_studio_sites')) return { rows: [{ id: input.checkpoint.scope.siteId, current_checkpoint_id: options.head ?? 'base' }] }
    if (sql.includes('FROM page_studio_checkpoints')) return { rows: options.replay
      ? [{ id: input.checkpoint.checkpointId, tenant_id: input.checkpoint.scope.tenantId, client_id: input.checkpoint.scope.clientId,
          site_id: input.checkpoint.scope.siteId, digest: input.checkpoint.digest, object_key: input.checkpoint.objectKey, etag: input.checkpoint.etag, author_id: input.checkpoint.userId, created_at: input.checkpoint.createdAt }]
      : [] }
    if (sql.includes('FROM page_studio_audit_events')) return { rows: [{ metadata: { commitProtocol: 'cas-v1', expectedCheckpointId: 'base', ...(options.replayBinding ? { codeContent: options.replayBinding } : {}) }, code_content: options.currentBinding ?? null }] }
    if (sql.includes('FROM page_studio_login_sessions')) return { rows: [{ token_hash: 'test' }] }
    if (sql.includes('SELECT session.nonce')) return { rows: [{ nonce: 'test_nonce_long_enough' }] }
    if (sql.includes('INSERT INTO page_studio_checkpoints')) return { rows: [{ id: input.checkpoint.checkpointId }] }
    return { rows: [] }
  })
  return { query, runTransaction: async (fn: (db: { query: typeof query }) => Promise<unknown>) => fn({ query }) }
}
function session(f: Awaited<ReturnType<typeof codeFixture>>) {
  const now = Math.floor(Date.now() / 1000)
  return { ...f.input.checkpoint.scope, userId: f.input.checkpoint.userId, role: 'agency' as const, nonce: 'test_nonce_long_enough', issuedAt: now - 1, expiresAt: now + 600,
    capabilities: ['source:edit', 'workspace:checkpoint'] }
}

describe('native code-page checkpoint admission', () => {
  it('accepts strict metadata but requires a non-null base in the editor adapter', async () => {
    const f = await codeFixture()
    expect(PageStudioCheckpointCommitSchema.safeParse(f.input).success).toBe(true)
    const db = database(f.input)
    await expect(commitPageStudioEditorCheckpoint({ ...f.input, expectedCheckpointId: null }, session(f), { ...db, env: { PAGE_STUDIO_CHECKPOINTS: f.bucket } } as never)).rejects.toThrow()
    expect(db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false)
  })
  it('rejects the generic/provisioning path before any native mutation', async () => {
    const f = await codeFixture()
    const db = database(f.input)
    await expect(commitPageStudioCheckpoint(f.input, db as never)).rejects.toMatchObject({ code: 'CODE_CONTENT_REQUIRES_EDITOR' })
    expect(db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false)
  })
  it('accepts agency AI-zero import and binds the audit to exact content', async () => {
    const f = await codeFixture()
    const db = database(f.input)
    await expect(commitPageStudioEditorCheckpoint(f.input, session(f), { ...db, env: { PAGE_STUDIO_CHECKPOINTS: f.bucket } } as never)).resolves.toMatchObject({ acknowledged: true, isCurrent: true })
    const call = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO page_studio_audit_events'))
    expect(call).toBeDefined()
  })
  it('enforces actual verified route count against the locked native allowance', async () => {
    const f = await codeFixture()
    const db = database(f.input, { pageLimit: 0 })
    await expect(commitPageStudioEditorCheckpoint(f.input, session(f), { ...db, env: { PAGE_STUDIO_CHECKPOINTS: f.bucket } } as never)).rejects.toMatchObject({ code: 'CODE_CONTENT_PAGE_LIMIT' })
    expect(db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false)
  })
  it('rejects a missing source edit capability', async () => {
    const f = await codeFixture()
    const db = database(f.input)
    await expect(commitPageStudioEditorCheckpoint(f.input, { ...session(f), capabilities: ['workspace:checkpoint'] }, { ...db, env: { PAGE_STUDIO_CHECKPOINTS: f.bucket } } as never)).rejects.toThrow()
    expect(db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false)
  })
  it('compares immutable code identity on a superseded retry', async () => {
    const f = await codeFixture()
    const db = database(f.input, { replay: true, head: 'newer', replayBinding: { ...f.input.checkpoint.codeContent, indexDigest: 'a'.repeat(64) } })
    await expect(commitPageStudioEditorCheckpoint(f.input, session(f), { ...db, env: { PAGE_STUDIO_CHECKPOINTS: f.bucket } } as never)).rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT' })
  })
  it('refuses a typed save that would drop the current code binding', async () => {
    const f = await codeFixture()
    const db = database(f.input, { currentBinding: f.input.checkpoint.codeContent })
    const { codeContent: _, ...typed } = f.input.checkpoint
    await expect(commitPageStudioCheckpoint({ ...f.input, checkpoint: typed }, db as never)).rejects.toMatchObject({ code: 'CODE_CONTENT_DOWNGRADE' })
    expect(db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false)
  })
})
