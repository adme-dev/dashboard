import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  transaction: vi.fn()
}))
const recordKnowledgeAudit = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('~~/server/utils/db', () => database)
vi.mock('~~/server/utils/boardKnowledge/repository', () => ({
  recordKnowledgeAudit: (...args: unknown[]) => recordKnowledgeAudit(...args)
}))

const {
  persistBoardKnowledgeIndexed,
  processBoardKnowledgeIndexing
} = await import('~~/server/utils/boardKnowledge/processIndexing')

const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111'
const DEPARTMENT_ID = '22222222-2222-4222-8222-222222222222'
const ARTICLE_ID = '33333333-3333-4333-8333-333333333333'
const VERSION_KEY = `sha256:${'a'.repeat(64)}`

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBMISSION_ID,
    departmentId: DEPARTMENT_ID,
    articleId: ARTICLE_ID,
    sourceVersionKey: VERSION_KEY,
    reviewStatus: 'approved' as const,
    extractionStatus: 'ready' as const,
    indexStatus: 'queued' as const,
    ...overrides
  }
}

function chunks() {
  return [0, 1].map(index => ({
    id: `44444444-4444-4444-8444-44444444444${index}`,
    articleId: ARTICLE_ID,
    submissionId: SUBMISSION_ID,
    departmentId: DEPARTMENT_ID,
    chunkIndex: index,
    content: `Cashflow passage ${index}`,
    contentHash: String(index + 1).repeat(64),
    vectorId: null,
    heading: 'Cash position',
    pageStart: index + 1,
    sheetName: null,
    slideNumber: null
  }))
}

function dependencies() {
  return {
    loadSubmission: vi.fn(async () => submission()),
    claimSubmission: vi.fn(async () => ({ claimed: true, operation: 'index' as const, leaseUpdatedAt: '2026-08-04T02:00:00.000Z' })),
    loadChunks: vi.fn(async () => chunks()),
    upsertChunks: vi.fn(async (_context: unknown, input: Array<{ chunkId: string, contentHash: string }>) => input.map(chunk => ({
      chunkId: chunk.chunkId,
      vectorId: `knowledge:${chunk.chunkId}:${chunk.contentHash.slice(0, 24)}`
    }))),
    deleteVectors: vi.fn(async (_context: unknown, ids: string[]) => ids.length),
    persistIndexed: vi.fn(async () => undefined),
    persistRemoved: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    recordVersionMismatch: vi.fn(async () => undefined)
  }
}

describe('Board Knowledge indexing processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks approved knowledge indexed only after every current chunk is upserted', async () => {
    const deps = dependencies()

    await expect(processBoardKnowledgeIndexing({}, {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: VERSION_KEY
    }, deps)).resolves.toEqual({ status: 'indexed', chunkCount: 2 })

    expect(deps.upsertChunks).toHaveBeenCalledWith({}, expect.arrayContaining([
      expect.objectContaining({ scopeKey: `board:${DEPARTMENT_ID}` })
    ]))
    expect(deps.persistIndexed).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: SUBMISSION_ID,
      expectedChunkCount: 2,
      vectors: expect.arrayContaining([expect.objectContaining({ chunkId: chunks()[0].id })])
    }))
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('fails without marking indexed when the vector response is incomplete', async () => {
    const deps = dependencies()
    deps.upsertChunks.mockResolvedValueOnce([{
      chunkId: chunks()[0].id,
      vectorId: 'knowledge:only-one'
    }])

    await expect(processBoardKnowledgeIndexing({}, {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: VERSION_KEY
    }, deps)).rejects.toThrow('knowledge_vector_parity_failed')

    expect(deps.persistIndexed).not.toHaveBeenCalled()
    expect(deps.markFailed).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'VECTOR_PARITY_FAILED'
    }))
  })

  it('de-indexes archived knowledge using only stored vector ids', async () => {
    const deps = dependencies()
    const archivedChunks = chunks().map((chunk, index) => ({ ...chunk, vectorId: `stored-${index}` }))
    deps.loadSubmission.mockResolvedValueOnce(submission({ reviewStatus: 'archived' }))
    deps.claimSubmission.mockResolvedValueOnce({ claimed: true, operation: 'remove', leaseUpdatedAt: '2026-08-04T02:00:00.000Z' })
    deps.loadChunks.mockResolvedValueOnce(archivedChunks)

    await expect(processBoardKnowledgeIndexing({}, {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: VERSION_KEY
    }, deps)).resolves.toEqual({ status: 'removed', chunkCount: 2 })

    expect(deps.deleteVectors).toHaveBeenCalledWith({}, ['stored-0', 'stored-1'])
    expect(deps.persistRemoved).toHaveBeenCalled()
    expect(deps.upsertChunks).not.toHaveBeenCalled()
  })

  it('keeps the submission indexing when persisted chunk/vector parity is incomplete', async () => {
    const statements: string[] = []
    const query = vi.fn(async (sql: string) => {
      statements.push(sql)
      if (/SELECT[\s\S]*board_knowledge_submissions[\s\S]*FOR UPDATE/i.test(sql)) {
        return { rows: [{
          id: SUBMISSION_ID,
          department_id: DEPARTMENT_ID,
          ai_knowledge_article_id: ARTICLE_ID,
          source_version_key: VERSION_KEY,
          review_status: 'approved',
          extraction_status: 'ready',
          index_status: 'indexing',
          updated_at: '2026-08-04T02:00:00.000Z'
        }] }
      }
      if (/COUNT\(vector_id\)/i.test(sql)) return { rows: [{ expected_count: 2, indexed_count: 1 }] }
      return { rows: [] }
    })
    database.transaction.mockImplementation(async callback => callback({ query }))

    await expect(persistBoardKnowledgeIndexed({
      submissionId: SUBMISSION_ID,
      expectedVersionKey: VERSION_KEY,
      leaseUpdatedAt: '2026-08-04T02:00:00.000Z',
      expectedChunkCount: 2,
      vectors: chunks().map(chunk => ({
        chunkId: chunk.id,
        vectorId: `k:${chunk.id}:${chunk.contentHash.slice(0, 16)}`,
        contentHash: chunk.contentHash
      }))
    })).rejects.toThrow('knowledge_vector_parity_failed')

    expect(statements.some(sql => /SET index_status = 'indexed'/i.test(sql))).toBe(false)
    expect(recordKnowledgeAudit).not.toHaveBeenCalled()
  })
})
