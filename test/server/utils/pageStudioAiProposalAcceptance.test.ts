import { describe, expect, it } from 'vitest'
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
const input: PageStudioAiProposalAcceptanceInput = {
  authorRole: 'agency',
  baseDigest: 'b'.repeat(64),
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

function transactionWithRows(rows: unknown[][], queries: string[]) {
  return async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => {
    const db: PageStudioControlQueryClient = {
      async query<T>(sql: string) {
        queries.push(sql)
        return { rows: (rows.shift() ?? []) as T[] }
      }
    }
    return callback(db)
  }
}

describe('acceptPageStudioAiProposal', () => {
  it('persists checkpoint, submitted version, pointers, and audits in one transaction', async () => {
    const queries: string[] = []
    const versionId = '10000000-0000-4000-8000-000000000099'
    const result = await acceptPageStudioAiProposal(input, {
      runTransaction: transactionWithRows([
        [{ current_checkpoint_id: 'checkpoint_base', current_digest: input.baseDigest, current_version_id: null }],
        [],
        [],
        [],
        [{
          author_id: input.checkpoint.userId,
          author_role: input.authorRole,
          checkpoint_id: input.checkpoint.checkpointId,
          created_at: input.checkpoint.createdAt,
          digest,
          id: versionId,
          status: 'in_review',
          summary: input.summary
        }],
        [],
        [],
        [],
        []
      ], queries)
    })

    expect(result).toEqual({ checkpointId: input.checkpoint.checkpointId, versionId })
    expect(queries.filter(sql => /INSERT INTO page_studio_checkpoints/.test(sql))).toHaveLength(1)
    expect(queries.filter(sql => /INSERT INTO page_studio_versions/.test(sql))).toHaveLength(1)
    expect(queries.filter(sql => /UPDATE page_studio_sites/.test(sql))).toHaveLength(1)
    expect(queries.filter(sql => /INSERT INTO page_studio_audit_events/.test(sql))).toHaveLength(3)
  })

  it('rejects a stale base before any mutation', async () => {
    const queries: string[] = []
    await expect(acceptPageStudioAiProposal(input, {
      runTransaction: transactionWithRows([
        [{ current_checkpoint_id: 'checkpoint_newer', current_digest: 'c'.repeat(64), current_version_id: null }],
        []
      ], queries)
    })).rejects.toMatchObject<PageStudioControlError>({ code: 'BASE_DIGEST_MISMATCH' })

    expect(queries.some(sql => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
  })

  it('replays an exact accepted request without another mutation', async () => {
    const queries: string[] = []
    const versionId = '10000000-0000-4000-8000-000000000099'
    const result = await acceptPageStudioAiProposal(input, {
      runTransaction: transactionWithRows([
        [{ current_checkpoint_id: input.checkpoint.checkpointId, current_digest: digest, current_version_id: versionId }],
        [{
          author_id: input.checkpoint.userId,
          author_role: input.authorRole,
          checkpoint_id: input.checkpoint.checkpointId,
          created_at: input.checkpoint.createdAt,
          digest,
          id: versionId,
          status: 'in_review',
          summary: input.summary
        }]
      ], queries)
    })

    expect(result).toEqual({ checkpointId: input.checkpoint.checkpointId, versionId })
    expect(queries.some(sql => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
  })
})
