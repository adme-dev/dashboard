import { setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) return { active: false, evidence: [] }
  const evidence = await queryRows(
    `SELECT monday_board_id AS "mondayBoardId", monday_item_id AS "mondayItemId",
            task_id AS "taskId", title, due_date AS "dueDate",
            status_name AS "taskStatus", COALESCE(is_blocked, false) AS "isBlocked"
       FROM hr_monday_evidence_extracts
      WHERE scope_id = $1 AND assignee_id = $2 AND expires_at > NOW()
      ORDER BY observed_at DESC
      LIMIT 500`,
    [scope.id, user.id],
  )
  return {
    active: true,
    scopeId: scope.id,
    evidence: evidence.map((item: any) => ({
      mondayBoardId: item.mondayBoardId,
      mondayItemId: item.mondayItemId,
      taskId: item.taskId,
      title: item.title || '[redacted by scope]',
      dueDate: item.dueDate,
      taskStatus: item.taskStatus,
      isBlocked: item.isBlocked,
    })),
    notice: 'This is a read-only evidence view. Corrections must be raised through the review challenge workflow.',
  }
})
