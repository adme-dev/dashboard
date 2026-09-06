import { describe, expect, it, vi } from 'vitest'
import {
  acceptPageStudioAiProposal,
  PageStudioControlError,
  type PageStudioAiProposalAcceptanceInput,
  type PageStudioControlQueryClient
} from '../../../server/utils/pageStudio/controlStore'

const digest = 'a'.repeat(64)
const scope = {
  clientId: '10000000-0000-4000-8000-000000000001',
  siteId: 'a27135dc-1374-475c-a56d-7e60310425bb',
  tenantId: 'page-studio-staging'
}
const input: PageStudioAiProposalAcceptanceInput & { expectedCheckpointId: string } = {
  authorRole: 'agency',
  baseDigest: 'b'.repeat(64),
  expectedCheckpointId: 'checkpoint_base',
  checkpoint: {
    checkpointId: 'checkpoint_ai_proposal_1',
    createdAt: '2026-09-02T00:00:00.000Z',
    digest,
    etag: 'etag-ai-proposal-1',
    objectKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/checkpoint_ai_proposal_1.json`,
    scope,
    userId: '10000000-0000-4000-8000-000000000002'
  },
  idempotencyKey: 'accept_proposal_1',
  summary: 'Add the approved campaign section'
}

const versionId = '10000000-0000-4000-8000-000000000099'
const version = {
  author_id: input.checkpoint.userId,
  author_role: input.authorRole,
  checkpoint_id: input.checkpoint.checkpointId,
  created_at: input.checkpoint.createdAt,
  digest,
  id: versionId,
  status: 'in_review',
  summary: input.summary
}
const receiptMetadata = {
  commitProtocol: 'cas-v1',
  expectedCheckpointId: input.expectedCheckpointId,
  baseDigest: input.baseDigest
}

function database(options: {
  head?: string | null
  currentDigest?: string
  replay?: boolean
  versionStatus?: 'approved' | 'rejected' | 'published'
  receiptMetadata?: Record<string, unknown>
} = {}) {
  const queries: string[] = []
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    queries.push(sql)
    if (sql.includes('FROM page_studio_sites')) return { rows: [{
      current_checkpoint_id: options.head === undefined ? input.expectedCheckpointId : options.head,
      current_digest: options.currentDigest ?? input.baseDigest,
      current_version_id: options.replay ? versionId : null
    }] }
    if (sql.includes('FROM page_studio_versions')) return { rows: options.replay ? [{ ...version, status: options.versionStatus ?? version.status }] : [] }
    if (sql.includes('FROM page_studio_checkpoints')) return { rows: options.replay
      ? [{
          id: input.checkpoint.checkpointId,
          tenant_id: scope.tenantId,
          client_id: scope.clientId,
          site_id: scope.siteId,
          digest,
          object_key: input.checkpoint.objectKey,
          etag: input.checkpoint.etag,
          author_id: input.checkpoint.userId,
          created_at: input.checkpoint.createdAt
        }]
      : [] }
    if (sql.includes('FROM page_studio_audit_events')) {
      const metadata = Object.hasOwn(options, 'receiptMetadata') ? options.receiptMetadata : receiptMetadata
      return { rows: metadata === undefined ? [] : [{ metadata }] }
    }
    if (sql.includes('INSERT INTO page_studio_versions')) return { rows: [version] }
    if (sql.includes('INSERT INTO page_studio_checkpoints')) return { rows: [{ id: input.checkpoint.checkpointId }] }
    return { rows: [] }
  })
  return {
    queries,
    query,
    runTransaction: async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) =>
      callback({ query } as PageStudioControlQueryClient)
  }
}

describe('acceptPageStudioAiProposal', () => {
  it('persists checkpoint, submitted version, pointers, and audits in one transaction', async () => {
    const db = database()
    const result = await acceptPageStudioAiProposal(input, db)
    const { queries } = db

    expect(result).toEqual({
      acknowledged: true,
      checkpointId: input.checkpoint.checkpointId,
      currentCheckpointId: input.checkpoint.checkpointId,
      isCurrent: true,
      versionId
    })
    expect(queries.filter(sql => /INSERT INTO page_studio_checkpoints/.test(sql))).toHaveLength(1)
    expect(queries.filter(sql => /INSERT INTO page_studio_versions/.test(sql))).toHaveLength(1)
    expect(queries.filter(sql => /UPDATE page_studio_sites/.test(sql))).toHaveLength(1)
    expect(queries.filter(sql => /INSERT INTO page_studio_audit_events/.test(sql))).toHaveLength(3)
    const audit = db.query.mock.calls.find(([sql, params]) =>
      sql.includes('INSERT INTO page_studio_audit_events') && params?.[5] === 'workspace.checkpointed')
    expect(JSON.parse(String(audit?.[1]?.[9]))).toMatchObject(receiptMetadata)
  })

  it('rejects a stale base before any mutation', async () => {
    const db = database({ currentDigest: 'c'.repeat(64) })
    await expect(acceptPageStudioAiProposal(input, db))
      .rejects.toMatchObject<PageStudioControlError>({ code: 'BASE_DIGEST_MISMATCH' })

    expect(db.queries.some(sql => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
  })

  it('rejects a different durable checkpoint even when its digest equals the base (ABA)', async () => {
    const db = database({ head: 'checkpoint_same_content_new_identity' })
    await expect(acceptPageStudioAiProposal(input, db)).rejects.toMatchObject({
      code: 'CHECKPOINT_BASE_MISMATCH', statusCode: 409
    })
    expect(db.queries.some(sql => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
  })

  it.each([undefined, null, ''])('rejects missing or invalid runtime checkpoint base %s before writes', async (expectedCheckpointId) => {
    const db = database()
    const invalid = { ...input, expectedCheckpointId } as unknown as PageStudioAiProposalAcceptanceInput
    await expect(acceptPageStudioAiProposal(invalid, db)).rejects.toBeInstanceOf(PageStudioControlError)
    expect(db.queries.some(sql => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
  })

  it.each([input.checkpoint.checkpointId, 'checkpoint_later_edit', null])(
    'acknowledges exact retry at current head %s without rewinding it', async (head) => {
      const db = database({ head, currentDigest: digest, replay: true })
      await expect(acceptPageStudioAiProposal(input, db)).resolves.toEqual({
        acknowledged: true,
        checkpointId: input.checkpoint.checkpointId,
        currentCheckpointId: head,
        isCurrent: head === input.checkpoint.checkpointId,
        versionId
      })
      expect(db.queries.some(sql => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
      expect(db.queries.some(sql => sql.includes('FROM page_studio_audit_events'))).toBe(true)
    }
  )

  it.each([
    { expectedCheckpointId: 'checkpoint_different_base' },
    { baseDigest: 'd'.repeat(64) }
  ])('rejects changed retry base %j even when accepted version metadata still matches', async (change) => {
    const db = database({ head: 'checkpoint_later_edit', currentDigest: digest, replay: true })
    await expect(acceptPageStudioAiProposal({ ...input, ...change }, db))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(db.queries.some(sql => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
  })

  it.each(['approved', 'rejected', 'published'] as const)(
    'acknowledges an exact retry after the version becomes %s without reverting its review state', async (versionStatus) => {
      const db = database({ head: 'checkpoint_later_edit', currentDigest: digest, replay: true, versionStatus })
      await expect(acceptPageStudioAiProposal(input, db)).resolves.toEqual({
        acknowledged: true,
        checkpointId: input.checkpoint.checkpointId,
        currentCheckpointId: 'checkpoint_later_edit',
        isCurrent: false,
        versionId
      })
      expect(db.queries.some(sql => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
      expect(db.queries.some(sql => sql.includes('FROM page_studio_audit_events'))).toBe(true)
    }
  )

  it('rejects an accepted version replay without its immutable audit base receipt', async () => {
    const db = database({ head: input.checkpoint.checkpointId, replay: true, receiptMetadata: undefined })
    await expect(acceptPageStudioAiProposal(input, db)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.queries.some(sql => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
  })
})
