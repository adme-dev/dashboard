import { createError } from 'h3'
import { execute, queryOne, queryRows } from '~~/server/utils/db'
import {
  sourceVersionKey,
  type BoardKnowledgeSubmission,
  type BoardKnowledgeSourceType
} from '~~/server/utils/boardKnowledge/types'

export interface ResolvedKnowledgeSource {
  sourceType: BoardKnowledgeSourceType
  sourceId: string
  departmentId: string
  fileName: string
  mimeType: string
  size: number
  storageKey: string
  checksum: string | null
  versionKey: string
  task: { id: string, title: string } | null
}

export interface CreateBoardKnowledgeSubmissionInput {
  source: ResolvedKnowledgeSource
  submittedBy: string
}

interface BoardFileSourceRow {
  id: string
  department_id: string
  file_name: string
  file_type: string | null
  file_size: string | number | null
  storage_key: string | null
  checksum_sha256: string | null
  updated_at: string | Date
}

interface TaskAttachmentSourceRow {
  id: string
  department_id: string
  file_name: string
  file_type: string | null
  file_size: string | number | null
  storage_key: string | null
  created_at: string | Date
  task_id: string
  task_title: string
}

export interface BoardKnowledgeSubmissionRow {
  id: string
  department_id: string
  source_type: BoardKnowledgeSourceType
  source_entity_id: string
  source_file_name: string
  source_mime_type: string
  source_size: string | number
  source_version_key: string
  source_checksum_sha256: string | null
  source_deleted_at: string | Date | null
  submitted_by: string
  submitted_at: string | Date
  review_status: BoardKnowledgeSubmission['reviewStatus']
  reviewed_by: string | null
  reviewed_at: string | Date | null
  review_reason: string | null
  extraction_status: BoardKnowledgeSubmission['extractionStatus']
  extraction_method: BoardKnowledgeSubmission['extractionMethod']
  extraction_provider: string | null
  extraction_model: string | null
  extraction_started_at: string | Date | null
  extraction_completed_at: string | Date | null
  extraction_metrics: Record<string, unknown> | string | null
  extraction_warnings: unknown[] | string | null
  extraction_error_code: string | null
  extraction_error_message: string | null
  index_status: BoardKnowledgeSubmission['indexStatus']
  ai_knowledge_article_id: string | null
  created_at: string | Date
  updated_at: string | Date
}

export interface BoardKnowledgeAuditInput {
  submissionId: string
  action:
    | 'submit'
    | 'extraction_start'
    | 'extraction_success'
    | 'extraction_failure'
    | 'retry'
    | 'approve'
    | 'reject'
    | 'index_success'
    | 'index_failure'
    | 'archive'
    | 'deindex'
    | 'source_version_mismatch'
  actorId: string | null
  previousState?: Record<string, unknown> | null
  nextState?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}

export interface BoardKnowledgeQueryClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>
}

const SUBMISSION_COLUMNS = `
  bks.id,
  bks.department_id,
  bks.source_type,
  bks.source_entity_id,
  bks.source_file_name,
  bks.source_mime_type,
  bks.source_size,
  bks.source_version_key,
  bks.source_checksum_sha256,
  bks.source_deleted_at,
  bks.submitted_by,
  bks.submitted_at,
  bks.review_status,
  bks.reviewed_by,
  bks.reviewed_at,
  bks.review_reason,
  bks.extraction_status,
  bks.extraction_method,
  bks.extraction_provider,
  bks.extraction_model,
  bks.extraction_started_at,
  bks.extraction_completed_at,
  bks.extraction_metrics,
  bks.extraction_warnings,
  bks.extraction_error_code,
  bks.extraction_error_message,
  bks.index_status,
  bks.ai_knowledge_article_id,
  bks.created_at,
  bks.updated_at
`

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function toNullableIsoString(value: string | Date | null): string | null {
  return value === null ? null : toIsoString(value)
}

function parseJsonRecord(value: Record<string, unknown> | string | null): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return value
}

function parseWarnings(value: unknown[] | string | null): string[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  return Array.isArray(parsed) ? parsed.filter((warning): warning is string => typeof warning === 'string') : []
}

export function mapBoardKnowledgeSubmission(row: BoardKnowledgeSubmissionRow): BoardKnowledgeSubmission {
  return {
    id: row.id,
    departmentId: row.department_id,
    sourceType: row.source_type,
    sourceId: row.source_entity_id,
    sourceFileName: row.source_file_name,
    sourceMimeType: row.source_mime_type,
    sourceSize: Number(row.source_size),
    sourceVersionKey: row.source_version_key,
    sourceChecksumSha256: row.source_checksum_sha256,
    sourceDeletedAt: toNullableIsoString(row.source_deleted_at),
    submittedBy: row.submitted_by,
    submittedAt: toIsoString(row.submitted_at),
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: toNullableIsoString(row.reviewed_at),
    reviewReason: row.review_reason,
    extractionStatus: row.extraction_status,
    extractionMethod: row.extraction_method,
    extractionProvider: row.extraction_provider,
    extractionModel: row.extraction_model,
    extractionStartedAt: toNullableIsoString(row.extraction_started_at),
    extractionCompletedAt: toNullableIsoString(row.extraction_completed_at),
    extractionMetrics: parseJsonRecord(row.extraction_metrics),
    extractionWarnings: parseWarnings(row.extraction_warnings),
    extractionErrorCode: row.extraction_error_code,
    extractionErrorMessage: row.extraction_error_message,
    indexStatus: row.index_status,
    aiKnowledgeArticleId: row.ai_knowledge_article_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  }
}

function requireManagedStorage(storageKey: string | null): string {
  if (!storageKey) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Source file is not available in managed storage'
    })
  }
  return storageKey
}

export async function resolveKnowledgeSource(
  departmentId: string,
  sourceType: BoardKnowledgeSourceType,
  sourceId: string
): Promise<ResolvedKnowledgeSource> {
  if (sourceType === 'board_file') {
    const row = await queryOne<BoardFileSourceRow>(`
      SELECT id, department_id, file_name, file_type, file_size, storage_key,
        checksum_sha256, updated_at
      FROM board_files
      WHERE id = $1 AND department_id = $2
    `, [sourceId, departmentId])

    if (!row) throw createError({ statusCode: 404, statusMessage: 'Board file not found' })

    const checksum = row.checksum_sha256?.trim().toLowerCase() || null
    const storageKey = requireManagedStorage(row.storage_key)
    const size = Number(row.file_size || 0)
    return {
      sourceType,
      sourceId: row.id,
      departmentId: row.department_id,
      fileName: row.file_name,
      mimeType: row.file_type || 'application/octet-stream',
      size,
      storageKey,
      checksum,
      versionKey: sourceVersionKey({
        id: row.id,
        checksum,
        storageKey,
        size,
        updatedAt: row.updated_at
      }),
      task: null
    }
  }

  const row = await queryOne<TaskAttachmentSourceRow>(`
    SELECT ta.id, t.department_id, ta.file_name, ta.file_type, ta.file_size,
      ta.storage_key, ta.created_at, t.id AS task_id, t.title AS task_title
    FROM task_attachments ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE ta.id = $1 AND t.department_id = $2
  `, [sourceId, departmentId])

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Task attachment not found' })

  const storageKey = requireManagedStorage(row.storage_key)
  const size = Number(row.file_size || 0)
  return {
    sourceType,
    sourceId: row.id,
    departmentId: row.department_id,
    fileName: row.file_name,
    mimeType: row.file_type || 'application/octet-stream',
    size,
    storageKey,
    checksum: null,
    versionKey: sourceVersionKey({
      id: row.id,
      checksum: null,
      storageKey,
      size,
      updatedAt: row.created_at
    }),
    task: { id: row.task_id, title: row.task_title }
  }
}

async function findSubmissionByVersion(source: ResolvedKnowledgeSource): Promise<BoardKnowledgeSubmission | null> {
  const row = await queryOne<BoardKnowledgeSubmissionRow>(`
    SELECT ${SUBMISSION_COLUMNS}
    FROM board_knowledge_submissions bks
    WHERE bks.department_id = $1
      AND bks.source_type = $2
      AND bks.source_entity_id = $3
      AND bks.source_version_key = $4
  `, [source.departmentId, source.sourceType, source.sourceId, source.versionKey])
  return row ? mapBoardKnowledgeSubmission(row) : null
}

export async function createSubmission(input: CreateBoardKnowledgeSubmissionInput): Promise<BoardKnowledgeSubmission> {
  const { source } = input
  try {
    const row = await queryOne<BoardKnowledgeSubmissionRow>(`
      INSERT INTO board_knowledge_submissions (
        department_id,
        board_file_id,
        task_attachment_id,
        source_type,
        source_entity_id,
        source_file_name,
        source_mime_type,
        source_size,
        source_version_key,
        source_checksum_sha256,
        submitted_by
      ) VALUES (
        $1,
        CASE WHEN $2 = 'board_file' THEN $3::uuid ELSE NULL END,
        CASE WHEN $2 = 'task_attachment' THEN $3::uuid ELSE NULL END,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9
      )
      RETURNING *
    `, [
      source.departmentId,
      source.sourceType,
      source.sourceId,
      source.fileName,
      source.mimeType,
      source.size,
      source.versionKey,
      source.checksum,
      input.submittedBy
    ])

    if (!row) throw new Error('Board knowledge submission insert returned no row')
    return mapBoardKnowledgeSubmission(row)
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error
    const existing = await findSubmissionByVersion(source)
    if (existing) return existing
    throw error
  }
}

export async function getSubmissionForBoard(
  submissionId: string,
  departmentId: string
): Promise<BoardKnowledgeSubmission | null> {
  const row = await queryOne<BoardKnowledgeSubmissionRow>(`
    SELECT ${SUBMISSION_COLUMNS}
    FROM board_knowledge_submissions bks
    WHERE bks.id = $1 AND bks.department_id = $2
  `, [submissionId, departmentId])
  return row ? mapBoardKnowledgeSubmission(row) : null
}

export async function listBoardKnowledge(departmentId: string): Promise<BoardKnowledgeSubmission[]> {
  const rows = await queryRows<BoardKnowledgeSubmissionRow>(`
    SELECT ${SUBMISSION_COLUMNS}
    FROM board_knowledge_submissions bks
    WHERE bks.department_id = $1
    ORDER BY bks.created_at DESC
  `, [departmentId])
  return rows.map(mapBoardKnowledgeSubmission)
}

export async function recordKnowledgeAudit(
  input: BoardKnowledgeAuditInput,
  client?: BoardKnowledgeQueryClient
): Promise<void> {
  const sql = `
    INSERT INTO board_knowledge_audit (
      submission_id, action, actor_id, previous_state, next_state, metadata
    ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
  `
  const params = [
    input.submissionId,
    input.action,
    input.actorId,
    JSON.stringify(input.previousState ?? null),
    JSON.stringify(input.nextState ?? null),
    JSON.stringify(input.metadata ?? {})
  ]

  if (client) {
    await client.query(sql, params)
    return
  }
  await execute(sql, params)
}
