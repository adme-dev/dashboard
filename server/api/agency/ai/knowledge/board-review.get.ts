import { requirePermission } from '~~/server/utils/auth'
import { resolvePersonalAssistantContext } from '~~/server/utils/ai/personalAssistantContext'
import { queryRows } from '~~/server/utils/db'

type QueueStatus = 'pending' | 'failed' | 'all'

interface BoardReviewRow {
  id: string
  department_id: string
  board_name: string
  source_file_name: string
  source_type: 'board_file' | 'task_attachment'
  review_status: string
  extraction_status: string
  index_status: string
  extraction_error_message: string | null
  submitted_at: string | Date
  submitted_by_name: string | null
}

const statusConditions: Record<QueueStatus, string> = {
  pending: `(
    bks.review_status = 'pending'
    AND bks.extraction_status <> 'failed'
    AND bks.index_status <> 'failed'
  )`,
  failed: `(bks.extraction_status = 'failed' OR bks.index_status = 'failed')`,
  all: 'TRUE'
}

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'MANAGEMENT')
  const requestedStatus = String(getQuery(event).status || 'pending')
  if (!(requestedStatus in statusConditions)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid review queue status' })
  }
  const status = requestedStatus as QueueStatus
  const assistantContext = await resolvePersonalAssistantContext({ userId: user.id, event })
  const departmentIds = [...new Set(assistantContext.departments.map(department => department.departmentId))]
  if (!departmentIds.length) return { items: [], count: 0, status }

  const rows = await queryRows<BoardReviewRow>(`
    SELECT
      bks.id,
      bks.department_id,
      department.name AS board_name,
      bks.source_file_name,
      bks.source_type,
      bks.review_status,
      bks.extraction_status,
      bks.index_status,
      bks.extraction_error_message,
      bks.submitted_at,
      submitter.name AS submitted_by_name
    FROM board_knowledge_submissions bks
    JOIN departments department ON department.id = bks.department_id
    LEFT JOIN team_members submitter ON submitter.id = bks.submitted_by
    WHERE bks.department_id = ANY($1::uuid[])
      AND ${statusConditions[status]}
      AND bks.source_deleted_at IS NULL
      AND bks.review_status <> 'archived'
    ORDER BY
      CASE WHEN bks.extraction_status = 'failed' OR bks.index_status = 'failed' THEN 0 ELSE 1 END,
      bks.submitted_at DESC
    LIMIT 100
  `, [departmentIds])

  // Keep a second boundary after the SQL predicate so future query refactors cannot widen results.
  const accessible = new Set(departmentIds)
  const items = rows.filter(row => accessible.has(row.department_id)).map(row => ({
    id: row.id,
    boardId: row.department_id,
    boardName: row.board_name,
    fileName: row.source_file_name,
    sourceType: row.source_type,
    reviewStatus: row.review_status,
    extractionStatus: row.extraction_status,
    indexStatus: row.index_status,
    errorMessage: row.extraction_error_message,
    submittedAt: new Date(row.submitted_at).toISOString(),
    submittedByName: row.submitted_by_name
  }))

  return { items, count: items.length, status }
})
