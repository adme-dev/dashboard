import { createError, type H3Event } from 'h3'
import { requireBoardAccess, type User } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'

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

interface BoardFileRow extends UploaderRow {
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

interface TaskFileRow extends UploaderRow {
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
    task: null
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
    task: { id: row.task_id, title: row.task_title }
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
        tm.email AS uploader_email
      FROM board_files bf
      LEFT JOIN team_members tm ON tm.id = bf.uploaded_by
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
        msfm.monday_asset_id
      FROM task_attachments ta
      JOIN tasks t ON t.id = ta.task_id
      LEFT JOIN team_members tm ON tm.id = ta.uploaded_by
      LEFT JOIN monday_sync_file_mappings msfm ON msfm.attachment_id = ta.id
      WHERE t.department_id = $1
    `, [departmentId])
  ])

  return mapBoardFileRows(departmentId, boardRows, taskRows, user)
}
