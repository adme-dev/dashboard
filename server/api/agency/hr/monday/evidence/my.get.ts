import { setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) return { active: false, evidence: [] }
  const allowed = new Set(scope.allowed_fields.map(field => field.toLowerCase()))
  const evidence = await queryRows(
    `SELECT DISTINCT ON (COALESCE(mim.monday_board_id, bm.monday_board_id), mim.monday_item_id)
            COALESCE(mim.monday_board_id, bm.monday_board_id) AS "mondayBoardId",
            mim.monday_item_id AS "mondayItemId", mim.task_id AS "taskId",
            mim.monday_item_name AS title, t.due_date AS "dueDate",
            ts.name AS "taskStatus", COALESCE(t.is_blocked, false) AS "isBlocked"
       FROM monday_item_mappings mim
       LEFT JOIN monday_board_mappings bm ON bm.id = mim.board_mapping_id
       JOIN tasks t ON t.id = mim.task_id AND t.assignee_id = $4
       LEFT JOIN task_statuses ts ON ts.id = t.status_id
      WHERE COALESCE(mim.monday_board_id, bm.monday_board_id) = ANY($1::text[])
        AND mim.status = 'completed'
        AND mim.created_at::date BETWEEN GREATEST($2::date, CURRENT_DATE - ($5::int * INTERVAL '1 day')) AND $3::date
      ORDER BY COALESCE(mim.monday_board_id, bm.monday_board_id), mim.monday_item_id, mim.created_at DESC
      LIMIT 500`,
    [scope.board_ids, scope.period_start, scope.period_end, user.id, scope.retention_days],
  )
  return {
    active: true,
    scopeId: scope.id,
    evidence: evidence.map((item: any) => ({
      mondayBoardId: item.mondayBoardId,
      mondayItemId: item.mondayItemId,
      taskId: item.taskId,
      title: allowed.has('name') || allowed.has('title') ? item.title : '[redacted by scope]',
      dueDate: allowed.has('due_date') ? item.dueDate : null,
      taskStatus: allowed.has('status') ? item.taskStatus : null,
      isBlocked: allowed.has('blocked') || allowed.has('is_blocked') ? item.isBlocked : false,
    })),
    notice: 'This is a read-only evidence view. Corrections must be raised through the review challenge workflow.',
  }
})
