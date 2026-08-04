import type { H3Event } from 'h3'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import {
  recordKnowledgeAudit,
  type BoardKnowledgeQueryClient
} from '~~/server/utils/boardKnowledge/repository'
import type {
  BoardKnowledgeExtractionStatus,
  BoardKnowledgeIndexStatus,
  BoardKnowledgeReviewStatus
} from '~~/server/utils/boardKnowledge/types'
import {
  deleteKnowledgeVectors,
  upsertKnowledgeChunks,
  type KnowledgeVectorChunkInput,
  type KnowledgeVectorWriteResult
} from '~~/server/utils/boardKnowledge/vectorize'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VECTOR_BATCH_SIZE = 100

export interface BoardKnowledgeIndexingContext {
  event?: H3Event
}

export interface BoardKnowledgeIndexingPayload {
  submissionId: string
  expectedVersionKey: string
}

export interface IndexingSubmission {
  id: string
  departmentId: string
  articleId: string | null
  sourceVersionKey: string
  reviewStatus: BoardKnowledgeReviewStatus
  extractionStatus: BoardKnowledgeExtractionStatus
  indexStatus: BoardKnowledgeIndexStatus
}

export interface IndexingChunk {
  id: string
  articleId: string
  submissionId: string
  departmentId: string
  chunkIndex: number
  content: string
  contentHash: string
  vectorId: string | null
  heading: string | null
  pageStart: number | null
  sheetName: string | null
  slideNumber: number | null
}

interface IndexingSubmissionRow {
  id: string
  department_id: string
  ai_knowledge_article_id: string | null
  source_version_key: string
  review_status: BoardKnowledgeReviewStatus
  extraction_status: BoardKnowledgeExtractionStatus
  index_status: BoardKnowledgeIndexStatus
  updated_at: string | Date
}

interface IndexingChunkRow {
  id: string
  article_id: string
  submission_id: string
  department_id: string
  chunk_index: number
  content: string
  content_hash: string
  vector_id: string | null
  heading: string | null
  page_start: number | null
  sheet_name: string | null
  slide_number: number | null
}

export interface BoardKnowledgeIndexClaim {
  claimed: boolean
  operation?: 'index' | 'remove'
  leaseUpdatedAt?: string
  status?: 'already_indexed' | 'already_removed' | 'already_processing' | 'not_queued'
}

interface PersistIndexedInput {
  submissionId: string
  expectedVersionKey: string
  leaseUpdatedAt: string
  expectedChunkCount: number
  vectors: Array<KnowledgeVectorWriteResult & { contentHash: string }>
}

interface PersistRemovedInput {
  submissionId: string
  expectedVersionKey: string
  leaseUpdatedAt: string
  removedVectorCount: number
}

interface MarkFailedInput {
  submissionId: string
  expectedVersionKey: string
  leaseUpdatedAt: string
  errorCode: string
}

interface RecordVersionMismatchInput {
  submissionId: string
  expectedVersionKey: string
  actualVersionKey: string
}

export interface BoardKnowledgeIndexingDependencies {
  loadSubmission: (submissionId: string) => Promise<IndexingSubmission | null>
  claimSubmission: (payload: BoardKnowledgeIndexingPayload) => Promise<BoardKnowledgeIndexClaim>
  loadChunks: (submissionId: string) => Promise<IndexingChunk[]>
  upsertChunks: typeof upsertKnowledgeChunks
  deleteVectors: typeof deleteKnowledgeVectors
  persistIndexed: (input: PersistIndexedInput) => Promise<void>
  persistRemoved: (input: PersistRemovedInput) => Promise<void>
  markFailed: (input: MarkFailedInput) => Promise<void>
  recordVersionMismatch: (input: RecordVersionMismatchInput) => Promise<void>
}

class KnowledgeIndexingError extends Error {
  constructor(readonly errorCode: string, message: string) {
    super(message)
    this.name = 'KnowledgeIndexingError'
  }
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function mapSubmission(row: IndexingSubmissionRow): IndexingSubmission {
  return {
    id: row.id,
    departmentId: row.department_id,
    articleId: row.ai_knowledge_article_id,
    sourceVersionKey: row.source_version_key,
    reviewStatus: row.review_status,
    extractionStatus: row.extraction_status,
    indexStatus: row.index_status
  }
}

function mapChunk(row: IndexingChunkRow): IndexingChunk {
  return {
    id: row.id,
    articleId: row.article_id,
    submissionId: row.submission_id,
    departmentId: row.department_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    contentHash: row.content_hash,
    vectorId: row.vector_id,
    heading: row.heading,
    pageStart: row.page_start,
    sheetName: row.sheet_name,
    slideNumber: row.slide_number
  }
}

export async function loadBoardKnowledgeIndexingSubmission(submissionId: string): Promise<IndexingSubmission | null> {
  const row = await queryOne<IndexingSubmissionRow>(`
    SELECT id, department_id, ai_knowledge_article_id, source_version_key,
      review_status, extraction_status, index_status, updated_at
    FROM board_knowledge_submissions
    WHERE id = $1
  `, [submissionId])
  return row ? mapSubmission(row) : null
}

export async function loadBoardKnowledgeIndexingChunks(submissionId: string): Promise<IndexingChunk[]> {
  const rows = await queryRows<IndexingChunkRow>(`
    SELECT id, article_id, submission_id, department_id, chunk_index,
      content, content_hash, vector_id, heading, page_start, sheet_name, slide_number
    FROM ai_knowledge_chunks
    WHERE submission_id = $1
    ORDER BY chunk_index
  `, [submissionId])
  return rows.map(mapChunk)
}

function operationFor(row: IndexingSubmissionRow): 'index' | 'remove' | null {
  if (row.review_status === 'approved' && row.extraction_status === 'ready' && row.ai_knowledge_article_id) return 'index'
  if (row.review_status === 'archived' || row.review_status === 'rejected') return 'remove'
  return null
}

export async function claimBoardKnowledgeIndexing(
  payload: BoardKnowledgeIndexingPayload
): Promise<BoardKnowledgeIndexClaim> {
  return transaction(async (databaseClient) => {
    const client = databaseClient as unknown as BoardKnowledgeQueryClient
    const locked = await client.query(`
      SELECT id, department_id, ai_knowledge_article_id, source_version_key,
        review_status, extraction_status, index_status, updated_at
      FROM board_knowledge_submissions
      WHERE id = $1
      FOR UPDATE
    `, [payload.submissionId])
    const row = locked.rows?.[0] as IndexingSubmissionRow | undefined
    if (!row) throw new KnowledgeIndexingError('SUBMISSION_NOT_FOUND', 'Knowledge submission not found')
    if (row.source_version_key !== payload.expectedVersionKey) return { claimed: false, status: 'not_queued' }
    if (row.index_status === 'indexing') return { claimed: false, status: 'already_processing' }

    const operation = operationFor(row)
    if (operation === 'index' && row.index_status === 'indexed') return { claimed: false, status: 'already_indexed' }
    if (operation === 'remove' && row.index_status === 'removed') return { claimed: false, status: 'already_removed' }
    if (row.index_status !== 'queued' || !operation) return { claimed: false, status: 'not_queued' }

    const updated = await client.query(`
      UPDATE board_knowledge_submissions
      SET index_status = 'indexing', updated_at = NOW()
      WHERE id = $1 AND source_version_key = $2 AND index_status = 'queued'
      RETURNING updated_at
    `, [payload.submissionId, payload.expectedVersionKey])
    const lease = updated.rows?.[0] as { updated_at: string | Date } | undefined
    if (!lease) return { claimed: false, status: 'not_queued' }
    return { claimed: true, operation, leaseUpdatedAt: iso(lease.updated_at) }
  })
}

async function lockIndexingLease(
  client: BoardKnowledgeQueryClient,
  input: { submissionId: string, expectedVersionKey: string, leaseUpdatedAt: string }
): Promise<IndexingSubmissionRow> {
  const locked = await client.query(`
    SELECT id, department_id, ai_knowledge_article_id, source_version_key,
      review_status, extraction_status, index_status, updated_at
    FROM board_knowledge_submissions
    WHERE id = $1
    FOR UPDATE
  `, [input.submissionId])
  const row = locked.rows?.[0] as IndexingSubmissionRow | undefined
  if (!row
    || row.source_version_key !== input.expectedVersionKey
    || row.index_status !== 'indexing'
    || iso(row.updated_at) !== input.leaseUpdatedAt) {
    throw new KnowledgeIndexingError('INDEXING_LEASE_STALE', 'Knowledge indexing lease changed')
  }
  return row
}

export async function persistBoardKnowledgeIndexed(input: PersistIndexedInput): Promise<void> {
  await transaction(async (databaseClient) => {
    const client = databaseClient as unknown as BoardKnowledgeQueryClient
    const row = await lockIndexingLease(client, input)
    if (operationFor(row) !== 'index') throw new KnowledgeIndexingError('INDEXING_LEASE_STALE', 'Knowledge approval changed')

    await client.query(`
      UPDATE ai_knowledge_chunks chunk
      SET vector_id = vectors.vector_id, updated_at = NOW()
      FROM jsonb_to_recordset($2::jsonb) AS vectors(chunk_id UUID, content_hash TEXT, vector_id TEXT)
      WHERE chunk.submission_id = $1
        AND chunk.id = vectors.chunk_id
        AND chunk.content_hash = vectors.content_hash
    `, [input.submissionId, JSON.stringify(input.vectors.map(vector => ({
      chunk_id: vector.chunkId,
      content_hash: vector.contentHash,
      vector_id: vector.vectorId
    })))])

    const parity = await client.query(`
      SELECT
        COUNT(*)::integer AS expected_count,
        COUNT(vector_id)::integer AS indexed_count
      FROM ai_knowledge_chunks
      WHERE submission_id = $1
    `, [input.submissionId])
    const counts = parity.rows?.[0] as { expected_count: number, indexed_count: number } | undefined
    if (!counts
      || Number(counts.expected_count) !== input.expectedChunkCount
      || Number(counts.indexed_count) !== input.expectedChunkCount) {
      throw new KnowledgeIndexingError('VECTOR_PARITY_FAILED', 'knowledge_vector_parity_failed')
    }

    await client.query(`
      UPDATE board_knowledge_submissions
      SET index_status = 'indexed', updated_at = NOW()
      WHERE id = $1
    `, [input.submissionId])
    await recordKnowledgeAudit({
      submissionId: input.submissionId,
      action: 'index_success',
      actorId: null,
      previousState: { index: 'indexing' },
      nextState: { index: 'indexed' },
      metadata: { chunkCount: input.expectedChunkCount }
    }, client)
  })
}

export async function persistBoardKnowledgeRemoved(input: PersistRemovedInput): Promise<void> {
  await transaction(async (databaseClient) => {
    const client = databaseClient as unknown as BoardKnowledgeQueryClient
    const row = await lockIndexingLease(client, input)
    if (operationFor(row) !== 'remove') throw new KnowledgeIndexingError('INDEXING_LEASE_STALE', 'Knowledge archive changed')
    await client.query('UPDATE ai_knowledge_chunks SET vector_id = NULL, updated_at = NOW() WHERE submission_id = $1', [input.submissionId])
    await client.query(`UPDATE board_knowledge_submissions SET index_status = 'removed', updated_at = NOW() WHERE id = $1`, [input.submissionId])
    await recordKnowledgeAudit({
      submissionId: input.submissionId,
      action: 'deindex',
      actorId: null,
      previousState: { index: 'indexing' },
      nextState: { index: 'removed' },
      metadata: { vectorCount: input.removedVectorCount }
    }, client)
  })
}

export async function markBoardKnowledgeIndexingFailed(input: MarkFailedInput): Promise<void> {
  await transaction(async (databaseClient) => {
    const client = databaseClient as unknown as BoardKnowledgeQueryClient
    const failed = await client.query(`
      UPDATE board_knowledge_submissions
      SET index_status = 'failed', updated_at = NOW()
      WHERE id = $1
        AND source_version_key = $2
        AND index_status = 'indexing'
        AND updated_at = $3::timestamptz
      RETURNING id
    `, [input.submissionId, input.expectedVersionKey, input.leaseUpdatedAt])
    if (!failed.rows?.[0]) return
    await recordKnowledgeAudit({
      submissionId: input.submissionId,
      action: 'index_failure',
      actorId: null,
      previousState: { index: 'indexing' },
      nextState: { index: 'failed' },
      metadata: { errorCode: input.errorCode.slice(0, 100) }
    }, client)
  })
}

export async function recordBoardKnowledgeIndexVersionMismatch(input: RecordVersionMismatchInput): Promise<void> {
  await recordKnowledgeAudit({
    submissionId: input.submissionId,
    action: 'source_version_mismatch',
    actorId: null,
    metadata: {
      phase: 'indexing',
      expectedVersionKey: input.expectedVersionKey,
      actualVersionKey: input.actualVersionKey
    }
  })
}

const DEFAULT_DEPENDENCIES: BoardKnowledgeIndexingDependencies = {
  loadSubmission: loadBoardKnowledgeIndexingSubmission,
  claimSubmission: claimBoardKnowledgeIndexing,
  loadChunks: loadBoardKnowledgeIndexingChunks,
  upsertChunks: upsertKnowledgeChunks,
  deleteVectors: deleteKnowledgeVectors,
  persistIndexed: persistBoardKnowledgeIndexed,
  persistRemoved: persistBoardKnowledgeRemoved,
  markFailed: markBoardKnowledgeIndexingFailed,
  recordVersionMismatch: recordBoardKnowledgeIndexVersionMismatch
}

function safeFailure(error: unknown): KnowledgeIndexingError {
  if (error instanceof KnowledgeIndexingError) return error
  return new KnowledgeIndexingError('VECTOR_INDEX_FAILED', 'knowledge_vector_index_failed')
}

export async function processBoardKnowledgeIndexing(
  context: BoardKnowledgeIndexingContext,
  payload: BoardKnowledgeIndexingPayload,
  dependencies: BoardKnowledgeIndexingDependencies = DEFAULT_DEPENDENCIES
): Promise<
  | { status: 'already_indexed' | 'already_removed' | 'already_processing' | 'not_queued' }
  | { status: 'indexed' | 'removed', chunkCount: number }
> {
  if (!UUID_PATTERN.test(payload.submissionId)
    || !payload.expectedVersionKey
    || payload.expectedVersionKey.length > 500) {
    throw new KnowledgeIndexingError('INVALID_INDEX_PAYLOAD', 'Knowledge indexing request is invalid')
  }

  const submission = await dependencies.loadSubmission(payload.submissionId)
  if (!submission) throw new KnowledgeIndexingError('SUBMISSION_NOT_FOUND', 'Knowledge submission not found')
  if (submission.sourceVersionKey !== payload.expectedVersionKey) {
    await dependencies.recordVersionMismatch({
      submissionId: submission.id,
      expectedVersionKey: payload.expectedVersionKey,
      actualVersionKey: submission.sourceVersionKey
    })
    throw new KnowledgeIndexingError('SOURCE_VERSION_MISMATCH', 'Knowledge source version changed')
  }

  const claim = await dependencies.claimSubmission(payload)
  if (!claim.claimed || !claim.operation || !claim.leaseUpdatedAt) {
    return { status: claim.status || 'not_queued' }
  }

  try {
    const chunks = await dependencies.loadChunks(payload.submissionId)
    if (claim.operation === 'remove') {
      const vectorIds = chunks.map(chunk => chunk.vectorId).filter((id): id is string => Boolean(id))
      await dependencies.deleteVectors(context, vectorIds)
      await dependencies.persistRemoved({
        submissionId: submission.id,
        expectedVersionKey: payload.expectedVersionKey,
        leaseUpdatedAt: claim.leaseUpdatedAt,
        removedVectorCount: vectorIds.length
      })
      return { status: 'removed', chunkCount: chunks.length }
    }

    if (!submission.articleId || !chunks.length) {
      throw new KnowledgeIndexingError('NO_KNOWLEDGE_CHUNKS', 'knowledge_vector_parity_failed')
    }
    const vectorInputs: KnowledgeVectorChunkInput[] = chunks.map(chunk => ({
      chunkId: chunk.id,
      submissionId: chunk.submissionId,
      articleId: chunk.articleId,
      departmentId: chunk.departmentId,
      chunkIndex: chunk.chunkIndex,
      contentHash: chunk.contentHash,
      scopeKey: `board:${chunk.departmentId}`,
      heading: chunk.heading,
      pageStart: chunk.pageStart,
      sheetName: chunk.sheetName,
      slideNumber: chunk.slideNumber,
      content: chunk.content
    }))
    const vectors: KnowledgeVectorWriteResult[] = []
    for (let offset = 0; offset < vectorInputs.length; offset += VECTOR_BATCH_SIZE) {
      vectors.push(...await dependencies.upsertChunks(context, vectorInputs.slice(offset, offset + VECTOR_BATCH_SIZE)))
    }
    const contentHashById = new Map(chunks.map(chunk => [chunk.id, chunk.contentHash]))
    const completeVectors = vectors.flatMap((vector) => {
      const contentHash = contentHashById.get(vector.chunkId)
      return contentHash ? [{ ...vector, contentHash }] : []
    })
    if (completeVectors.length !== chunks.length || new Set(completeVectors.map(vector => vector.chunkId)).size !== chunks.length) {
      throw new KnowledgeIndexingError('VECTOR_PARITY_FAILED', 'knowledge_vector_parity_failed')
    }
    await dependencies.persistIndexed({
      submissionId: submission.id,
      expectedVersionKey: payload.expectedVersionKey,
      leaseUpdatedAt: claim.leaseUpdatedAt,
      expectedChunkCount: chunks.length,
      vectors: completeVectors
    })
    return { status: 'indexed', chunkCount: chunks.length }
  } catch (error) {
    const failure = safeFailure(error)
    await dependencies.markFailed({
      submissionId: submission.id,
      expectedVersionKey: payload.expectedVersionKey,
      leaseUpdatedAt: claim.leaseUpdatedAt,
      errorCode: failure.errorCode
    }).catch(() => undefined)
    throw failure
  }
}
