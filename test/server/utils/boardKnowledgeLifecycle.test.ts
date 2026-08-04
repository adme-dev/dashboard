import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('~~/server/utils/db', () => db)

import {
  canTransition,
  guardKnowledgeSourceDeletion,
  transitionSubmission
} from '~~/server/utils/boardKnowledge/lifecycle'

const BOARD_ID = '11111111-1111-4111-8111-111111111111'
const FILE_ID = '22222222-2222-4222-8222-222222222222'
const SUBMISSION_ID = '33333333-3333-4333-8333-333333333333'
const ARTICLE_ID = '44444444-4444-4444-8444-444444444444'
const UPDATED_AT = '2026-08-04T01:00:00.000Z'

function submissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBMISSION_ID,
    department_id: BOARD_ID,
    source_type: 'board_file',
    source_entity_id: FILE_ID,
    source_file_name: 'Cashflow policy.pdf',
    source_mime_type: 'application/pdf',
    source_size: '2048',
    source_version_key: 'sha256:abc',
    source_checksum_sha256: 'abc',
    source_deleted_at: null,
    submitted_by: 'user-1',
    submitted_at: UPDATED_AT,
    review_status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    review_reason: null,
    extraction_status: 'ready',
    extraction_method: 'native',
    extraction_provider: null,
    extraction_model: null,
    extraction_started_at: UPDATED_AT,
    extraction_completed_at: UPDATED_AT,
    extraction_metrics: {},
    extraction_warnings: [],
    extraction_error_code: null,
    extraction_error_message: null,
    index_status: 'not_indexed',
    ai_knowledge_article_id: ARTICLE_ID,
    created_at: UPDATED_AT,
    updated_at: UPDATED_AT,
    ...overrides
  }
}

describe('board knowledge transition rules', () => {
  it('allows approval only after extraction is ready', () => {
    expect(canTransition({ review: 'pending', extraction: 'ready', index: 'not_indexed' }, 'approve')).toBe(true)
    expect(canTransition({ review: 'pending', extraction: 'processing', index: 'not_indexed' }, 'approve')).toBe(false)
    expect(canTransition({ review: 'approved', extraction: 'ready', index: 'indexed' }, 'approve')).toBe(false)
  })

  it('allows extraction retry only for a pending failed submission', () => {
    expect(canTransition({ review: 'pending', extraction: 'failed', index: 'not_indexed' }, 'retry')).toBe(true)
    expect(canTransition({ review: 'rejected', extraction: 'ready', index: 'not_indexed' }, 'retry')).toBe(false)
  })

  it('blocks archival while extraction or indexing is actively mutating state', () => {
    expect(canTransition({ review: 'pending', extraction: 'processing', index: 'not_indexed' }, 'archive')).toBe(false)
    expect(canTransition({ review: 'approved', extraction: 'ready', index: 'indexing' }, 'archive')).toBe(false)
    expect(canTransition({ review: 'approved', extraction: 'ready', index: 'indexed' }, 'archive')).toBe(true)
  })
})

describe('board knowledge transactional lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a stale reviewer decision before changing publication state', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [submissionRow()] })
    db.transaction.mockImplementation(async callback => callback({ query }))

    await expect(transitionSubmission({
      submissionId: SUBMISSION_ID,
      departmentId: BOARD_ID,
      actorId: 'manager-1',
      action: 'approve',
      expectedUpdatedAt: '2026-08-04T01:00:01.000Z'
    })).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Knowledge submission changed; refresh and try again'
    })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('publishes the draft, supersedes the prior approval, queues indexing, and audits atomically', async () => {
    const query = vi.fn(async (sql: string) => {
      if (/SELECT[\s\S]*FOR UPDATE/i.test(sql)) return { rows: [submissionRow()] }
      if (/UPDATE board_knowledge_submissions[\s\S]*review_status = 'archived'[\s\S]*RETURNING ai_knowledge_article_id/i.test(sql)) {
        return { rows: [{ ai_knowledge_article_id: 'old-article' }] }
      }
      if (/UPDATE board_knowledge_submissions[\s\S]*review_status = 'approved'/i.test(sql)) {
        return { rows: [submissionRow({
          review_status: 'approved',
          reviewed_by: 'manager-1',
          reviewed_at: '2026-08-04T01:05:00.000Z',
          index_status: 'queued',
          updated_at: '2026-08-04T01:05:00.000Z'
        })] }
      }
      return { rows: [] }
    })
    db.transaction.mockImplementation(async callback => callback({ query }))

    const result = await transitionSubmission({
      submissionId: SUBMISSION_ID,
      departmentId: BOARD_ID,
      actorId: 'manager-1',
      action: 'approve',
      expectedUpdatedAt: UPDATED_AT
    })

    expect(result).toMatchObject({ reviewStatus: 'approved', indexStatus: 'queued' })
    const statements = query.mock.calls.map(call => String(call[0]))
    expect(query.mock.calls.some(call => (
      /UPDATE ai_knowledge_articles[\s\S]*is_published = \$2[\s\S]*review_status = \$3/i.test(String(call[0]))
      && JSON.stringify(call[1]) === JSON.stringify([ARTICLE_ID, true, 'approved', 'manager-1'])
    ))).toBe(true)
    expect(query.mock.calls.some(call => (
      /UPDATE ai_knowledge_articles[\s\S]*is_published = false/i.test(String(call[0]))
      && JSON.stringify(call[1]) === JSON.stringify([['old-article']])
    ))).toBe(true)
    const supersededUnpublish = query.mock.calls.find(call => (
      /UPDATE ai_knowledge_articles[\s\S]*is_published = false/i.test(String(call[0]))
      && JSON.stringify(call[1]) === JSON.stringify([['old-article']])
    ))
    expect(String(supersededUnpublish?.[0])).not.toMatch(/review_status\s*=/i)
    expect(statements.at(-1)).toMatch(/INSERT INTO board_knowledge_audit/i)
  })

  it('unpublishes an approved article before archiving its submission', async () => {
    const query = vi.fn(async (sql: string) => {
      if (/SELECT[\s\S]*FOR UPDATE/i.test(sql)) {
        return { rows: [submissionRow({ review_status: 'approved', index_status: 'indexed' })] }
      }
      if (/UPDATE board_knowledge_submissions[\s\S]*review_status = 'archived'/i.test(sql)) {
        return { rows: [submissionRow({
          review_status: 'archived',
          index_status: 'queued',
          updated_at: '2026-08-04T01:05:00.000Z'
        })] }
      }
      return { rows: [] }
    })
    db.transaction.mockImplementation(async callback => callback({ query }))

    await transitionSubmission({
      submissionId: SUBMISSION_ID,
      departmentId: BOARD_ID,
      actorId: 'manager-1',
      action: 'archive',
      expectedUpdatedAt: UPDATED_AT
    })

    const statements = query.mock.calls.map(call => String(call[0]))
    const unpublishIndex = query.mock.calls.findIndex(call => (
      /UPDATE ai_knowledge_articles[\s\S]*is_published = false[\s\S]*WHERE id = \$1/i.test(String(call[0]))
      && JSON.stringify(call[1]) === JSON.stringify([ARTICLE_ID, 'manager-1'])
    ))
    const archiveIndex = statements.findIndex(sql => /UPDATE board_knowledge_submissions[\s\S]*review_status = 'archived'/i.test(sql))
    expect(unpublishIndex).toBeGreaterThan(0)
    expect(archiveIndex).toBeGreaterThan(unpublishIndex)
    expect(statements[unpublishIndex]).not.toMatch(/review_status\s*=/i)
  })
})

describe('board knowledge source deletion guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    [null, 'clear'],
    [{ review_status: 'pending', extraction_status: 'processing', index_status: 'not_indexed' }, 'blocked_extraction'],
    [{ review_status: 'approved', extraction_status: 'ready', index_status: 'indexed' }, 'archive_required'],
    [{ review_status: 'archived', extraction_status: 'ready', index_status: 'removed' }, 'clear']
  ])('returns an explicit deletion decision for state %#', async (row, expected) => {
    db.queryOne.mockResolvedValueOnce(row)

    await expect(guardKnowledgeSourceDeletion({
      departmentId: BOARD_ID,
      sourceType: 'board_file',
      sourceId: FILE_ID
    })).resolves.toBe(expected)
  })
})
