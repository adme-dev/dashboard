import { getQuery, setHeader } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireRole(event, ['admin', 'owner'])
  const query = getQuery(event)
  const inactivityDays = Math.min(Math.max(Number(query.inactivityDays) || 3, 1), 90)
  const rows = await queryRows(
    `SELECT DISTINCT ON (mim.monday_item_id)
            mim.monday_item_id AS "mondayItemId", mim.monday_item_name AS title,
            t.id AS "taskId", t.assignee_id AS "assigneeId", t.due_date AS "dueDate",
            t.is_blocked AS "isBlocked", t.status_id AS "statusId", t.updated_at AS "taskUpdatedAt",
            COALESCE(last_update.last_updated_at, t.updated_at) AS "lastActivityAt"
       FROM monday_item_mappings mim
       JOIN tasks t ON t.id = mim.task_id
       LEFT JOIN LATERAL (
         SELECT MAX(mum.created_at) AS last_updated_at
           FROM monday_update_mappings mum
          WHERE mum.item_mapping_id = mim.id
      ) last_update ON true
     WHERE mim.status = 'completed'
       AND NOT COALESCE(mim.archived, false)
       AND NOT t.status_is_final
       AND (t.due_date < CURRENT_DATE OR t.is_blocked = true OR COALESCE(last_update.last_updated_at, t.updated_at) < NOW() - ($1::int * INTERVAL '1 day'))
      ORDER BY mim.monday_item_id, mim.updated_at DESC`,
    [inactivityDays],
  )
  return { inactivityDays, alerts: rows.map((row: any) => ({ ...row, reasons: [row.dueDate && new Date(row.dueDate) < new Date() ? 'overdue' : null, row.isBlocked ? 'blocked' : null, new Date(row.lastActivityAt) < new Date(Date.now() - inactivityDays * 86400000) ? 'inactive' : null].filter(Boolean) })) }
})
