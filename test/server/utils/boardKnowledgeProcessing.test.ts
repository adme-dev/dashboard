import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const mockQueryOne = vi.fn()
const mockTransaction = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const {
  persistBoardKnowledgeDraft,
  processBoardKnowledgeExtraction
} = await import('~~/server/utils/boardKnowledge/processExtraction')

const SUBMISSION_ID = '10000000-0000-4000-8000-000000000001'
const BOARD_ID = '20000000-0000-4000-8000-000000000002'
const SOURCE_ID = '30000000-0000-4000-8000-000000000003'
const USER_ID = '40000000-0000-4000-8000-000000000004'
const VERSION = 'record:source-v1'
const BYTES = new TextEncoder().encode('Synthetic payable policy for testing only.')
const CHECKSUM = createHash('sha256').update(BYTES).digest('hex')

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBMISSION_ID,
    departmentId: BOARD_ID,
    sourceType: 'board_file' as const,
    sourceId: SOURCE_ID,
    fileName: 'policy.txt',
    mimeType: 'text/plain',
    sourceVersionKey: VERSION,
    sourceChecksumSha256: null,
    submittedBy: USER_ID,
    extractionStatus: 'queued' as const,
    ...overrides
  }
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: 'board_file' as const,
    sourceId: SOURCE_ID,
    departmentId: BOARD_ID,
    fileName: 'policy.txt',
    mimeType: 'text/plain',
    size: BYTES.byteLength,
    storageKey: 'attachments/synthetic-policy.txt',
    checksum: null,
    versionKey: VERSION,
    task: null,
    ...overrides
  }
}

function nativeResult(overrides: Record<string, unknown> = {}) {
  return {
    outcome: 'usable' as const,
    method: 'native' as const,
    blocks: [{ kind: 'text' as const, content: 'Synthetic payable policy for testing only.' }],
    metrics: { characters: 42, blankRatio: 0, replacementRatio: 0 },
    warnings: [],
    errorCode: null,
    ...overrides
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    loadSubmission: vi.fn().mockResolvedValue(submission()),
    claimSubmission: vi.fn().mockResolvedValue({ claimed: true, leaseUpdatedAt: '2026-08-04T01:00:00.000Z' }),
    resolveSource: vi.fn().mockResolvedValue(source()),
    download: vi.fn().mockResolvedValue(BYTES),
    extractNative: vi.fn().mockResolvedValue(nativeResult()),
    extractAi: vi.fn(),
    buildChunks: vi.fn().mockReturnValue([{
      chunkIndex: 0,
      content: 'Synthetic payable policy for testing only.',
      contentHash: CHECKSUM,
      tokenEstimate: 11,
      heading: null,
      pageStart: null,
      pageEnd: null,
      sheetName: null,
      slideNumber: null
    }]),
    persistDraft: vi.fn().mockResolvedValue({ articleId: '50000000-0000-4000-8000-000000000005' }),
    markFailed: vi.fn().mockResolvedValue(undefined),
    recordVersionMismatch: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as Parameters<typeof processBoardKnowledgeExtraction>[2]
}

describe('processBoardKnowledgeExtraction', () => {
  it('persists a checksum and unpublished draft from usable native extraction', async () => {
    const deps = dependencies()

    const result = await processBoardKnowledgeExtraction({}, {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: VERSION
    }, deps)

    expect(deps.extractAi).not.toHaveBeenCalled()
    expect(deps.persistDraft).toHaveBeenCalledWith(expect.objectContaining({
      submission: expect.objectContaining({ id: SUBMISSION_ID }),
      checksumSha256: CHECKSUM,
      extractionMethod: 'native',
      article: expect.objectContaining({
        reviewStatus: 'draft',
        isPublished: false
      }),
      chunks: expect.arrayContaining([expect.objectContaining({ chunkIndex: 0 })])
    }))
    expect(result).toMatchObject({ status: 'ready', method: 'native', checksumSha256: CHECKSUM, chunkCount: 1 })
  })

  it('escalates insufficient native text to the assigned AI extractor', async () => {
    const deps = dependencies({
      extractNative: vi.fn().mockResolvedValue(nativeResult({
        outcome: 'needs_ai',
        blocks: [],
        errorCode: 'NATIVE_TEXT_INSUFFICIENT'
      })),
      extractAi: vi.fn().mockResolvedValue({
        method: 'gemini',
        provider: 'google-ai-studio',
        model: 'google-ai-studio/gemini-3.6-flash',
        blocks: [{ kind: 'heading', content: 'Recovered policy', pageStart: 1, pageEnd: 1 }],
        warnings: ['SCAN_OCR_USED'],
        confidence: 0.94
      })
    })

    const result = await processBoardKnowledgeExtraction({ event: {} as never }, {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: VERSION
    }, deps)

    expect(deps.extractAi).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: SUBMISSION_ID,
      documentClass: 'pdf_layout_recovery',
      batchNumber: 1,
      bytes: BYTES
    }))
    expect(deps.persistDraft).toHaveBeenCalledWith(expect.objectContaining({
      extractionMethod: 'gemini',
      extractionProvider: 'google-ai-studio',
      extractionModel: 'google-ai-studio/gemini-3.6-flash',
      warnings: expect.arrayContaining(['NATIVE_TEXT_INSUFFICIENT', 'SCAN_OCR_USED'])
    }))
    expect(result).toMatchObject({ status: 'ready', method: 'gemini' })
  })

  it('is idempotent when the immutable submission version is already ready', async () => {
    const deps = dependencies({
      loadSubmission: vi.fn().mockResolvedValue(submission({ extractionStatus: 'ready' }))
    })

    const result = await processBoardKnowledgeExtraction({}, {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: VERSION
    }, deps)

    expect(result).toEqual({ status: 'already_ready' })
    expect(deps.claimSubmission).not.toHaveBeenCalled()
    expect(deps.download).not.toHaveBeenCalled()
  })

  it('refuses a stale job before downloading source content', async () => {
    const deps = dependencies()

    await expect(processBoardKnowledgeExtraction({}, {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: 'record:stale-v0'
    }, deps)).rejects.toThrow('knowledge_source_version_mismatch')

    expect(deps.recordVersionMismatch).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: SUBMISSION_ID,
      expectedVersionKey: 'record:stale-v0',
      actualVersionKey: VERSION
    }))
    expect(deps.claimSubmission).not.toHaveBeenCalled()
    expect(deps.download).not.toHaveBeenCalled()
  })

  it('marks a claimed extraction failed with a bounded safe error', async () => {
    const deps = dependencies({
      download: vi.fn().mockRejectedValue(new Error('secret storage path and provider internals'))
    })

    await expect(processBoardKnowledgeExtraction({}, {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: VERSION
    }, deps)).rejects.toThrow('document_extraction_failed')

    expect(deps.markFailed).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: SUBMISSION_ID,
      expectedVersionKey: VERSION,
      leaseUpdatedAt: '2026-08-04T01:00:00.000Z',
      errorCode: 'DOCUMENT_EXTRACTION_FAILED',
      errorMessage: 'Document extraction failed'
    }))
    expect(JSON.stringify(deps.markFailed.mock.calls)).not.toContain('secret storage path')
  })
})

describe('persistBoardKnowledgeDraft', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockTransaction.mockReset()
  })

  it('replaces draft chunks and marks ready in one processing-lease transaction', async () => {
    const query = vi.fn().mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (/SELECT id, source_version_key/i.test(sql)) {
        return { rows: [{ id: SUBMISSION_ID, extraction_status: 'processing', source_version_key: VERSION, updated_at: '2026-08-04T01:00:00.000Z' }] }
      }
      if (/INSERT INTO ai_knowledge_articles/i.test(sql)) {
        return { rows: [{ id: '50000000-0000-4000-8000-000000000005' }] }
      }
      if (/extraction_status = 'ready'/i.test(sql)) return { rows: [{ id: SUBMISSION_ID }] }
      return { rows: [] }
    })
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback({ query }))

    await persistBoardKnowledgeDraft({
      submission: submission(),
      expectedVersionKey: VERSION,
      leaseUpdatedAt: '2026-08-04T01:00:00.000Z',
      checksumSha256: CHECKSUM,
      extractionMethod: 'native',
      extractionProvider: null,
      extractionModel: null,
      metrics: { characters: 42 },
      warnings: [],
      article: {
        title: 'policy.txt',
        content: 'Synthetic payable policy for testing only.',
        reviewStatus: 'draft',
        isPublished: false
      },
      chunks: [{
        chunkIndex: 0,
        content: 'Synthetic payable policy for testing only.',
        contentHash: CHECKSUM,
        tokenEstimate: 11,
        heading: null,
        pageStart: null,
        pageEnd: null,
        sheetName: null,
        slideNumber: null
      }]
    })

    const sql = query.mock.calls.map(call => String(call[0])).join('\n')
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(sql).toMatch(/FOR UPDATE/i)
    expect(sql).toMatch(/INSERT INTO ai_knowledge_articles/i)
    expect(sql).toMatch(/review_status[\s\S]*is_published/i)
    expect(sql).toMatch(/DELETE FROM ai_knowledge_chunks/i)
    expect(sql).toMatch(/INSERT INTO ai_knowledge_chunks/i)
    expect(sql).toMatch(/extraction_status = 'ready'/i)
    expect(sql).toMatch(/INSERT INTO board_knowledge_audit/i)
    const chunkInsert = query.mock.calls.find(call => /INSERT INTO ai_knowledge_chunks/i.test(String(call[0])))
    expect(JSON.parse(String(chunkInsert?.[1]?.[3]))).toEqual([expect.objectContaining({
      chunk_index: 0,
      content_hash: CHECKSUM,
      token_estimate: 11
    })])
  })
})
