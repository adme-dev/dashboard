import { createError, type H3Event } from 'h3'
import { requireBoardAccess, type User } from '~~/server/utils/auth'
import {
  isIndexableBoardKnowledgeFile,
  type BoardKnowledgeExtractionStatus,
  type BoardKnowledgeIndexStatus,
  type BoardKnowledgeProjection,
  type BoardKnowledgeReviewStatus
} from '~~/server/utils/boardKnowledge/types'
import { queryOne, queryRows } from '~~/server/utils/db'
import { isReadOnlyRole, roleHasPermission } from '~~/server/utils/permissions'

export type BoardFileScope = 'board' | 'task'
export type BoardFileCategory = 'reference' | 'policy' | 'template' | 'other' | 'evidence'
export type BoardFileSource = 'xeroflow' | 'monday' | 'xero' | 'task'

export interface BoardFileItem {
  id: string
  boardId: string
  scope: BoardFileScope
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  category: BoardFileCategory
  description: string | null
  source: BoardFileSource
  sourceReference: string | null
  createdAt: string
  uploadedBy: { id: string, name: string, email: string } | null
  canDelete: boolean
  task: { id: string, title: string } | null
  knowledge: BoardKnowledgeProjection
}

export interface BoardFileListResponse {
  files: BoardFileItem[]
  summary: {
    total: number
    boardDocuments: number
    taskEvidence: number
  }
}

interface AccessibleBoard {
  id: string
  name: string
  slug: string
  user: User
}

interface UploaderRow {
  uploader_id: string | null
  uploader_name: string | null
  uploader_email: string | null
}

interface KnowledgeProjectionRow {
  knowledge_submission_id?: string | null
  knowledge_review_status?: BoardKnowledgeReviewStatus | null
  knowledge_extraction_status?: BoardKnowledgeExtractionStatus | null
  knowledge_index_status?: BoardKnowledgeIndexStatus | null
}

interface BoardFileRow extends UploaderRow, KnowledgeProjectionRow {
  id: string
  file_name: string
  file_type: string | null
  file_size: string | number | null
  category: Exclude<BoardFileCategory, 'evidence'>
  description: string | null
  source: Exclude<BoardFileSource, 'task'>
  source_reference: string | null
  created_at: string | Date
}

interface TaskFileRow extends UploaderRow, KnowledgeProjectionRow {
  id: string
  task_id: string
  task_title: string
  file_name: string
  file_type: string | null
  file_size: string | number | null
  created_at: string | Date
  monday_asset_id: string | null
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function uploaderFromRow(row: UploaderRow): BoardFileItem['uploadedBy'] {
  if (!row.uploader_id) return null
  return {
    id: row.uploader_id,
    name: row.uploader_name || 'Unknown user',
    email: row.uploader_email || ''
  }
}

function knowledgeLabel(row: KnowledgeProjectionRow, indexable: boolean): BoardKnowledgeProjection['label'] {
  if (!indexable) return 'Not indexable'
  if (!row.knowledge_submission_id) return 'Not submitted'
  if (row.knowledge_review_status === 'archived') return 'Archived'
  if (row.knowledge_review_status === 'rejected') return 'Rejected'
  if (row.knowledge_extraction_status === 'failed') return 'Extraction failed'
  if (row.knowledge_extraction_status === 'queued' || row.knowledge_extraction_status === 'processing') {
    return 'Extracting'
  }
  if (row.knowledge_review_status === 'approved') {
    return row.knowledge_index_status === 'indexed' ? 'Used by AI' : 'Approved · indexing'
  }
  return 'Ready for review'
}

function knowledgeFromRow(
  row: KnowledgeProjectionRow & { file_name: string, file_type: string | null },
  user: User
): BoardKnowledgeProjection {
  const indexable = isIndexableBoardKnowledgeFile(
    row.file_name,
    row.file_type || 'application/octet-stream'
  )
  const submissionId = row.knowledge_submission_id || null
  const writeAllowed = !isReadOnlyRole(user.role) && !(user as User & { isCustomReadOnly?: boolean }).isCustomReadOnly
  const hasManagementPermission = roleHasPermission(user.role, 'MANAGEMENT')
    || Boolean(user.permissionGroups?.includes('MANAGEMENT'))

  return {
    submissionId,
    reviewStatus: submissionId ? row.knowledge_review_status || null : null,
    extractionStatus: submissionId ? row.knowledge_extraction_status || null : null,
    indexStatus: submissionId ? row.knowledge_index_status || null : null,
    indexable,
    label: knowledgeLabel(row, indexable),
    canSubmit: indexable && writeAllowed && !submissionId,
    canReview: indexable && hasManagementPermission && Boolean(submissionId)
  }
}

export function mapBoardFileRows(
  boardId: string,
  boardRows: BoardFileRow[],
  taskRows: TaskFileRow[],
  user: User
): BoardFileListResponse {
  const boardDocuments: BoardFileItem[] = boardRows.map(row => ({
    id: row.id,
    boardId,
    scope: 'board',
    fileName: row.file_name,
    fileUrl: `/api/agency/boards/${boardId}/files/${row.id}/download`,
    fileType: row.file_type || 'application/octet-stream',
    fileSize: Number(row.file_size || 0),
    category: row.category,
    description: row.description || null,
    source: row.source,
    sourceReference: row.source_reference || null,
    createdAt: toIsoString(row.created_at),
    uploadedBy: uploaderFromRow(row),
    canDelete: user.role === 'owner' || user.role === 'admin' || row.uploader_id === user.id,
    task: null,
    knowledge: knowledgeFromRow(row, user)
  }))

  const taskEvidence: BoardFileItem[] = taskRows.map(row => ({
    id: row.id,
    boardId,
    scope: 'task',
    fileName: row.file_name,
    fileUrl: `/api/agency/boards/${boardId}/files/task/${row.id}/download`,
    fileType: row.file_type || 'application/octet-stream',
    fileSize: Number(row.file_size || 0),
    category: 'evidence',
    description: null,
    source: row.monday_asset_id ? 'monday' : 'task',
    sourceReference: row.monday_asset_id || null,
    createdAt: toIsoString(row.created_at),
    uploadedBy: uploaderFromRow(row),
    canDelete: false,
    task: { id: row.task_id, title: row.task_title },
    knowledge: knowledgeFromRow(row, user)
  }))

  const files = [...boardDocuments, ...taskEvidence]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))

  return {
    files,
    summary: {
      total: files.length,
      boardDocuments: boardDocuments.length,
      taskEvidence: taskEvidence.length
    }
  }
}

export async function resolveAccessibleBoard(event: H3Event, boardId: string): Promise<AccessibleBoard> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(boardId)
  const board = isUuid
    ? await queryOne<Omit<AccessibleBoard, 'user'>>('SELECT id, name, slug FROM departments WHERE id = $1', [boardId])
    : await queryOne<Omit<AccessibleBoard, 'user'>>('SELECT id, name, slug FROM departments WHERE slug = $1', [boardId])

  if (!board) {
    throw createError({ statusCode: 404, statusMessage: 'Board not found' })
  }

  const user = await requireBoardAccess(event, board.id)
  return { ...board, user }
}

export async function listBoardFiles(departmentId: string, user: User): Promise<BoardFileListResponse> {
  const [boardRows, taskRows] = await Promise.all([
    queryRows<BoardFileRow>(`
      SELECT
        bf.id,
        bf.file_name,
        bf.file_type,
        bf.file_size,
        bf.category,
        bf.description,
        bf.source,
        bf.source_reference,
        bf.created_at,
        tm.id AS uploader_id,
        tm.name AS uploader_name,
        tm.email AS uploader_email,
        knowledge.id AS knowledge_submission_id,
        knowledge.review_status AS knowledge_review_status,
        knowledge.extraction_status AS knowledge_extraction_status,
        knowledge.index_status AS knowledge_index_status
      FROM board_files bf
      LEFT JOIN team_members tm ON tm.id = bf.uploaded_by
      LEFT JOIN LATERAL (
        SELECT id, review_status, extraction_status, index_status
        FROM board_knowledge_submissions bks
        WHERE bks.department_id = bf.department_id
          AND bks.source_type = 'board_file'
          AND bks.source_entity_id = bf.id
        ORDER BY bks.created_at DESC
        LIMIT 1
      ) knowledge ON TRUE
      WHERE bf.department_id = $1
    `, [departmentId]),
    queryRows<TaskFileRow>(`
      SELECT
        ta.id,
        ta.task_id,
        t.title AS task_title,
        ta.file_name,
        ta.file_url,
        ta.storage_key,
        ta.file_type,
        ta.file_size,
        ta.created_at,
        tm.id AS uploader_id,
        tm.name AS uploader_name,
        tm.email AS uploader_email,
        msfm.monday_asset_id,
        knowledge.id AS knowledge_submission_id,
        knowledge.review_status AS knowledge_review_status,
        knowledge.extraction_status AS knowledge_extraction_status,
        knowledge.index_status AS knowledge_index_status
      FROM task_attachments ta
      JOIN tasks t ON t.id = ta.task_id
      LEFT JOIN team_members tm ON tm.id = ta.uploaded_by
      LEFT JOIN monday_sync_file_mappings msfm ON msfm.attachment_id = ta.id
      LEFT JOIN LATERAL (
        SELECT id, review_status, extraction_status, index_status
        FROM board_knowledge_submissions bks
        WHERE bks.department_id = t.department_id
          AND bks.source_type = 'task_attachment'
          AND bks.source_entity_id = ta.id
        ORDER BY bks.created_at DESC
        LIMIT 1
      ) knowledge ON TRUE
      WHERE t.department_id = $1
    `, [departmentId])
  ])

  return mapBoardFileRows(departmentId, boardRows, taskRows, user)
}
