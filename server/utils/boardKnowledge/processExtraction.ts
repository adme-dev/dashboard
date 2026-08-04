import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { queryOne, transaction } from '~~/server/utils/db'
import { downloadFileBuffer } from '~~/server/utils/storage'
import { extractDocumentWithAi } from '~~/server/utils/boardKnowledge/extractAi'
import { buildKnowledgeChunks, type KnowledgeChunkDraft } from '~~/server/utils/boardKnowledge/chunking'
import { extractNativeDocument, type ExtractionBlock, type NativeExtractionResult } from '~~/server/utils/boardKnowledge/extractNative'
import {
  recordKnowledgeAudit,
  resolveKnowledgeSource,
  type BoardKnowledgeQueryClient,
  type ResolvedKnowledgeSource
} from '~~/server/utils/boardKnowledge/repository'
import type {
  BoardKnowledgeExtractionMethod,
  BoardKnowledgeExtractionStatus,
  BoardKnowledgeSourceType
} from '~~/server/utils/boardKnowledge/types'

const MAX_EXTRACTED_CHARACTERS = 2_000_000
const MAX_WARNING_COUNT = 100

export interface BoardKnowledgeProcessingContext {
  event?: H3Event
}

export interface BoardKnowledgeExtractionPayload {
  submissionId: string
  expectedVersionKey: string
}

export interface ExtractionSubmission {
  id: string
  departmentId: string
  sourceType: BoardKnowledgeSourceType
  sourceId: string
  fileName: string
  mimeType: string
  sourceVersionKey: string
  sourceChecksumSha256: string | null
  submittedBy: string
  extractionStatus: BoardKnowledgeExtractionStatus
}

interface ExtractionSubmissionRow {
  id: string
  department_id: string
  source_type: BoardKnowledgeSourceType
  source_entity_id: string
  source_file_name: string
  source_mime_type: string
  source_version_key: string
  source_checksum_sha256: string | null
  submitted_by: string
  extraction_status: BoardKnowledgeExtractionStatus
  updated_at: string | Date
}

export interface BoardKnowledgeExtractionClaim {
  claimed: boolean
  leaseUpdatedAt?: string
  status?: 'already_ready' | 'already_processing' | 'not_queued'
}

export interface PersistBoardKnowledgeDraftInput {
  submission: ExtractionSubmission
  expectedVersionKey: string
  leaseUpdatedAt: string
  checksumSha256: string
  extractionMethod: BoardKnowledgeExtractionMethod
  extractionProvider: string | null
  extractionModel: string | null
  metrics: Record<string, unknown>
  warnings: string[]
  article: {
    title: string
    content: string
    reviewStatus: 'draft'
    isPublished: false
  }
  chunks: KnowledgeChunkDraft[]
}

interface MarkExtractionFailedInput {
  submissionId: string
  expectedVersionKey: string
  leaseUpdatedAt: string
  errorCode: string
  errorMessage: string
}

interface RecordVersionMismatchInput {
  submissionId: string
  expectedVersionKey: string
  actualVersionKey: string
}

export interface BoardKnowledgeExtractionDependencies {
  loadSubmission: (submissionId: string) => Promise<ExtractionSubmission | null>
  claimSubmission: (payload: BoardKnowledgeExtractionPayload) => Promise<BoardKnowledgeExtractionClaim>
  resolveSource: (departmentId: string, sourceType: BoardKnowledgeSourceType, sourceId: string) => Promise<ResolvedKnowledgeSource>
  download: (storageKey: string) => Promise<Uint8Array>
  extractNative: typeof extractNativeDocument
  extractAi: typeof extractDocumentWithAi
  buildChunks: (result: NativeExtractionResult) => KnowledgeChunkDraft[]
  persistDraft: (input: PersistBoardKnowledgeDraftInput) => Promise<{ articleId: string }>
  markFailed: (input: MarkExtractionFailedInput) => Promise<void>
  recordVersionMismatch: (input: RecordVersionMismatchInput) => Promise<void>
}

class KnowledgeProcessingError extends Error {
  constructor(
    readonly errorCode: string,
    readonly safeMessage: string,
    readonly publicCode = 'document_extraction_failed'
  ) {
    super(publicCode)
    this.name = 'KnowledgeProcessingError'
  }
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function mapSubmission(row: ExtractionSubmissionRow): ExtractionSubmission {
  return {
    id: row.id,
    departmentId: row.department_id,
    sourceType: row.source_type,
    sourceId: row.source_entity_id,
    fileName: row.source_file_name,
    mimeType: row.source_mime_type,
    sourceVersionKey: row.source_version_key,
    sourceChecksumSha256: row.source_checksum_sha256,
    submittedBy: row.submitted_by,
    extractionStatus: row.extraction_status
  }
}

export async function loadBoardKnowledgeExtractionSubmission(submissionId: string): Promise<ExtractionSubmission | null> {
  const row = await queryOne<ExtractionSubmissionRow>(`
    SELECT id, department_id, source_type, source_entity_id, source_file_name,
      source_mime_type, source_version_key, source_checksum_sha256, submitted_by,
      extraction_status, updated_at
    FROM board_knowledge_submissions
    WHERE id = $1
  `, [submissionId])
  return row ? mapSubmission(row) : null
}

export async function claimBoardKnowledgeExtraction(
  payload: BoardKnowledgeExtractionPayload
): Promise<BoardKnowledgeExtractionClaim> {
  return transaction(async (databaseClient) => {
    const client = databaseClient as unknown as BoardKnowledgeQueryClient
    const locked = await client.query(`
      SELECT id, source_version_key, extraction_status, updated_at
      FROM board_knowledge_submissions
      WHERE id = $1
      FOR UPDATE
    `, [payload.submissionId])
    const row = locked.rows?.[0] as Pick<ExtractionSubmissionRow, 'id' | 'source_version_key' | 'extraction_status' | 'updated_at'> | undefined
    if (!row) throw new KnowledgeProcessingError('SUBMISSION_NOT_FOUND', 'Knowledge submission not found')
    if (row.source_version_key !== payload.expectedVersionKey) {
      return { claimed: false, status: 'not_queued' }
    }
    if (row.extraction_status === 'ready') return { claimed: false, status: 'already_ready' }
    if (row.extraction_status === 'processing') return { claimed: false, status: 'already_processing' }
    if (row.extraction_status !== 'queued') return { claimed: false, status: 'not_queued' }

    const updated = await client.query(`
      UPDATE board_knowledge_submissions
      SET
        extraction_status = 'processing',
        extraction_started_at = NOW(),
        extraction_completed_at = NULL,
        extraction_error_code = NULL,
        extraction_error_message = NULL,
        updated_at = NOW()
      WHERE id = $1 AND source_version_key = $2 AND extraction_status = 'queued'
      RETURNING updated_at
    `, [payload.submissionId, payload.expectedVersionKey])
    const updatedRow = updated.rows?.[0] as { updated_at: string | Date } | undefined
    if (!updatedRow) return { claimed: false, status: 'not_queued' }

    await recordKnowledgeAudit({
      submissionId: payload.submissionId,
      action: 'extraction_start',
      actorId: null,
      previousState: { extraction: row.extraction_status },
      nextState: { extraction: 'processing' },
      metadata: { expectedVersionKey: payload.expectedVersionKey }
    }, client)
    return { claimed: true, leaseUpdatedAt: iso(updatedRow.updated_at) }
  })
}

function assertProcessingLease(row: ExtractionSubmissionRow | undefined, input: PersistBoardKnowledgeDraftInput): void {
  if (!row
    || row.extraction_status !== 'processing'
    || row.source_version_key !== input.expectedVersionKey
    || iso(row.updated_at) !== input.leaseUpdatedAt) {
    throw new KnowledgeProcessingError('PROCESSING_LEASE_STALE', 'Knowledge extraction lease changed')
  }
}

export async function persistBoardKnowledgeDraft(
  input: PersistBoardKnowledgeDraftInput
): Promise<{ articleId: string }> {
  return transaction(async (databaseClient) => {
    const client = databaseClient as unknown as BoardKnowledgeQueryClient
    const locked = await client.query(`
      SELECT id, source_version_key, extraction_status, updated_at
      FROM board_knowledge_submissions
      WHERE id = $1
      FOR UPDATE
    `, [input.submission.id])
    assertProcessingLease(locked.rows?.[0] as ExtractionSubmissionRow | undefined, input)

    const articleResult = await client.query(`
      INSERT INTO ai_knowledge_articles (
        title, content, category, tags, source, author_id, is_published,
        review_status, department_id, board_knowledge_submission_id,
        source_entity_type, source_entity_id, updated_at
      ) VALUES ($1, $2, 'board_knowledge', ARRAY['board knowledge', 'document'],
        $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (board_knowledge_submission_id)
        WHERE board_knowledge_submission_id IS NOT NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        source = EXCLUDED.source,
        author_id = EXCLUDED.author_id,
        is_published = EXCLUDED.is_published,
        review_status = EXCLUDED.review_status,
        department_id = EXCLUDED.department_id,
        source_entity_type = EXCLUDED.source_entity_type,
        source_entity_id = EXCLUDED.source_entity_id,
        updated_at = NOW()
      RETURNING id
    `, [
      input.article.title,
      input.article.content,
      input.submission.sourceType,
      input.submission.submittedBy,
      input.article.isPublished,
      input.article.reviewStatus,
      input.submission.departmentId,
      input.submission.id,
      input.submission.sourceType,
      input.submission.sourceId
    ])
    const articleRow = articleResult.rows?.[0] as { id: string } | undefined
    if (!articleRow) throw new KnowledgeProcessingError('DRAFT_ARTICLE_WRITE_FAILED', 'Knowledge draft could not be saved')

    await client.query('DELETE FROM ai_knowledge_chunks WHERE article_id = $1', [articleRow.id])
    const chunkRows = input.chunks.map(chunk => ({
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      heading: chunk.heading,
      page_start: chunk.pageStart,
      page_end: chunk.pageEnd,
      sheet_name: chunk.sheetName,
      slide_number: chunk.slideNumber,
      content_hash: chunk.contentHash,
      token_estimate: chunk.tokenEstimate
    }))
    await client.query(`
      INSERT INTO ai_knowledge_chunks (
        article_id, submission_id, department_id, chunk_index, content,
        heading, page_start, page_end, sheet_name, slide_number,
        content_hash, token_estimate
      )
      SELECT $1, $2, $3, chunk_index, content, heading, page_start, page_end,
        sheet_name, slide_number, content_hash, token_estimate
      FROM jsonb_to_recordset($4::jsonb) AS chunk(
        chunk_index INTEGER,
        content TEXT,
        heading TEXT,
        page_start INTEGER,
        page_end INTEGER,
        sheet_name TEXT,
        slide_number INTEGER,
        content_hash TEXT,
        token_estimate INTEGER
      )
      ORDER BY chunk_index
    `, [articleRow.id, input.submission.id, input.submission.departmentId, JSON.stringify(chunkRows)])

    const ready = await client.query(`
      UPDATE board_knowledge_submissions
      SET
        source_checksum_sha256 = $4,
        extraction_status = 'ready',
        extraction_method = $5,
        extraction_provider = $6,
        extraction_model = $7,
        extraction_completed_at = NOW(),
        extraction_metrics = $8::jsonb,
        extraction_warnings = $9::jsonb,
        extraction_error_code = NULL,
        extraction_error_message = NULL,
        ai_knowledge_article_id = $10,
        updated_at = NOW()
      WHERE id = $1
        AND source_version_key = $2
        AND extraction_status = 'processing'
        AND updated_at = $3::timestamptz
      RETURNING id
    `, [
      input.submission.id,
      input.expectedVersionKey,
      input.leaseUpdatedAt,
      input.checksumSha256,
      input.extractionMethod,
      input.extractionProvider,
      input.extractionModel,
      JSON.stringify(input.metrics),
      JSON.stringify(input.warnings.slice(0, MAX_WARNING_COUNT)),
      articleRow.id
    ])
    if (!ready.rows?.[0]) throw new KnowledgeProcessingError('PROCESSING_LEASE_STALE', 'Knowledge extraction lease changed')

    await recordKnowledgeAudit({
      submissionId: input.submission.id,
      action: 'extraction_success',
      actorId: null,
      previousState: { extraction: 'processing' },
      nextState: { extraction: 'ready' },
      metadata: {
        method: input.extractionMethod,
        chunkCount: input.chunks.length,
        checksumSha256: input.checksumSha256
      }
    }, client)
    return { articleId: articleRow.id }
  })
}

export async function markBoardKnowledgeExtractionFailed(input: MarkExtractionFailedInput): Promise<void> {
  await transaction(async (databaseClient) => {
    const client = databaseClient as unknown as BoardKnowledgeQueryClient
    const failed = await client.query(`
      UPDATE board_knowledge_submissions
      SET
        extraction_status = 'failed',
        extraction_completed_at = NOW(),
        extraction_error_code = $4,
        extraction_error_message = $5,
        updated_at = NOW()
      WHERE id = $1
        AND source_version_key = $2
        AND extraction_status = 'processing'
        AND updated_at = $3::timestamptz
      RETURNING id
    `, [
      input.submissionId,
      input.expectedVersionKey,
      input.leaseUpdatedAt,
      input.errorCode.slice(0, 100),
      input.errorMessage.slice(0, 1000)
    ])
    if (!failed.rows?.[0]) return
    await recordKnowledgeAudit({
      submissionId: input.submissionId,
      action: 'extraction_failure',
      actorId: null,
      previousState: { extraction: 'processing' },
      nextState: { extraction: 'failed' },
      metadata: { errorCode: input.errorCode.slice(0, 100) }
    }, client)
  })
}

export async function recordBoardKnowledgeVersionMismatch(input: RecordVersionMismatchInput): Promise<void> {
  await recordKnowledgeAudit({
    submissionId: input.submissionId,
    action: 'source_version_mismatch',
    actorId: null,
    metadata: {
      expectedVersionKey: input.expectedVersionKey,
      actualVersionKey: input.actualVersionKey
    }
  })
}

const DEFAULT_DEPENDENCIES: BoardKnowledgeExtractionDependencies = {
  loadSubmission: loadBoardKnowledgeExtractionSubmission,
  claimSubmission: claimBoardKnowledgeExtraction,
  resolveSource: resolveKnowledgeSource,
  download: downloadFileBuffer,
  extractNative: extractNativeDocument,
  extractAi: extractDocumentWithAi,
  buildChunks: buildKnowledgeChunks,
  persistDraft: persistBoardKnowledgeDraft,
  markFailed: markBoardKnowledgeExtractionFailed,
  recordVersionMismatch: recordBoardKnowledgeVersionMismatch
}

function extractionDocument(blocks: ExtractionBlock[]): string {
  const content = blocks.map(block => block.content.trim()).filter(Boolean).join('\n\n')
  if (!content || content.length > MAX_EXTRACTED_CHARACTERS) {
    throw new KnowledgeProcessingError('EXTRACTED_TEXT_LIMIT', 'Extracted document text exceeded the safe limit')
  }
  return content
}

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function canEscalateToAi(native: NativeExtractionResult): boolean {
  if (native.outcome === 'needs_ai') return true
  return native.outcome === 'failed'
    && ['DOCUMENT_PARSE_FAILED', 'DOCUMENT_PARSE_TIMEOUT', 'NATIVE_TEXT_INSUFFICIENT'].includes(native.errorCode || '')
}

function safeFailure(error: unknown): KnowledgeProcessingError {
  if (error instanceof KnowledgeProcessingError) return error
  return new KnowledgeProcessingError('DOCUMENT_EXTRACTION_FAILED', 'Document extraction failed')
}

export async function processBoardKnowledgeExtraction(
  context: BoardKnowledgeProcessingContext,
  payload: BoardKnowledgeExtractionPayload,
  dependencies: BoardKnowledgeExtractionDependencies = DEFAULT_DEPENDENCIES
): Promise<
  | { status: 'already_ready' | 'already_processing' | 'not_queued' }
  | { status: 'ready', method: BoardKnowledgeExtractionMethod, checksumSha256: string, chunkCount: number }
> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.submissionId)
    || !payload.expectedVersionKey
    || payload.expectedVersionKey.length > 500) {
    throw new KnowledgeProcessingError('INVALID_EXTRACTION_PAYLOAD', 'Knowledge extraction request is invalid')
  }
  const submission = await dependencies.loadSubmission(payload.submissionId)
  if (!submission) throw new KnowledgeProcessingError('SUBMISSION_NOT_FOUND', 'Knowledge submission not found')
  if (submission.sourceVersionKey !== payload.expectedVersionKey) {
    await dependencies.recordVersionMismatch({
      submissionId: payload.submissionId,
      expectedVersionKey: payload.expectedVersionKey,
      actualVersionKey: submission.sourceVersionKey
    })
    throw new KnowledgeProcessingError('SOURCE_VERSION_MISMATCH', 'Knowledge source version changed', 'knowledge_source_version_mismatch')
  }
  if (submission.extractionStatus === 'ready') return { status: 'already_ready' }
  if (submission.extractionStatus === 'processing') return { status: 'already_processing' }

  const claim = await dependencies.claimSubmission(payload)
  if (!claim.claimed || !claim.leaseUpdatedAt) return { status: claim.status ?? 'not_queued' }

  try {
    const source = await dependencies.resolveSource(submission.departmentId, submission.sourceType, submission.sourceId)
    if (source.versionKey !== payload.expectedVersionKey) {
      await dependencies.recordVersionMismatch({
        submissionId: payload.submissionId,
        expectedVersionKey: payload.expectedVersionKey,
        actualVersionKey: source.versionKey
      })
      throw new KnowledgeProcessingError('SOURCE_VERSION_MISMATCH', 'Knowledge source version changed', 'knowledge_source_version_mismatch')
    }

    const bytes = await dependencies.download(source.storageKey)
    const checksumSha256 = checksum(bytes)
    if ((submission.sourceChecksumSha256 && submission.sourceChecksumSha256 !== checksumSha256)
      || (source.checksum && source.checksum !== checksumSha256)) {
      await dependencies.recordVersionMismatch({
        submissionId: payload.submissionId,
        expectedVersionKey: payload.expectedVersionKey,
        actualVersionKey: `sha256:${checksumSha256}`
      })
      throw new KnowledgeProcessingError('SOURCE_CHECKSUM_MISMATCH', 'Knowledge source checksum changed', 'knowledge_source_version_mismatch')
    }

    const native = await dependencies.extractNative({
      bytes,
      fileName: source.fileName,
      mimeType: source.mimeType
    })
    let blocks = native.blocks
    let extractionMethod: BoardKnowledgeExtractionMethod = 'native'
    let extractionProvider: string | null = null
    let extractionModel: string | null = null
    let warnings = [...native.warnings]
    let aiConfidence: number | null = null

    if (native.outcome !== 'usable') {
      if (!canEscalateToAi(native)) {
        throw new KnowledgeProcessingError(native.errorCode || 'NATIVE_EXTRACTION_FAILED', 'Native document extraction failed')
      }
      const ai = await dependencies.extractAi({
        submissionId: submission.id,
        documentClass: 'pdf_layout_recovery',
        batchNumber: 1,
        bytes,
        mimeType: source.mimeType
      })
      blocks = ai.blocks
      extractionMethod = ai.method
      extractionProvider = ai.provider
      extractionModel = ai.model
      aiConfidence = ai.confidence
      warnings = [
        ...warnings,
        ...(native.errorCode ? [native.errorCode] : []),
        ...ai.warnings
      ]
    }

    const content = extractionDocument(blocks)
    const chunkInput: NativeExtractionResult = {
      outcome: 'usable',
      method: 'native',
      blocks,
      metrics: native.metrics,
      warnings,
      errorCode: null
    }
    const chunks = dependencies.buildChunks(chunkInput)
    if (!chunks.length) throw new KnowledgeProcessingError('NO_KNOWLEDGE_CHUNKS', 'Document extraction produced no knowledge chunks')

    await dependencies.persistDraft({
      submission,
      expectedVersionKey: payload.expectedVersionKey,
      leaseUpdatedAt: claim.leaseUpdatedAt,
      checksumSha256,
      extractionMethod,
      extractionProvider,
      extractionModel,
      metrics: {
        ...native.metrics,
        sourceBytes: bytes.byteLength,
        chunkCount: chunks.length,
        aiConfidence
      },
      warnings: Array.from(new Set(warnings)).slice(0, MAX_WARNING_COUNT),
      article: {
        title: source.fileName,
        content,
        reviewStatus: 'draft',
        isPublished: false
      },
      chunks
    })
    return { status: 'ready', method: extractionMethod, checksumSha256, chunkCount: chunks.length }
  } catch (error) {
    const failure = safeFailure(error)
    await dependencies.markFailed({
      submissionId: payload.submissionId,
      expectedVersionKey: payload.expectedVersionKey,
      leaseUpdatedAt: claim.leaseUpdatedAt,
      errorCode: failure.errorCode,
      errorMessage: failure.safeMessage
    }).catch(() => undefined)
    throw failure
  }
}
