import { createError, getHeader, setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const alerts = await queryRows<{
    taskId: string
    assigneeId: string
    title: string
    reason: string
    mondayItemId: string
    mondayBoardId: string | null
    mondayUrl: string | null
  }>(
    `WITH canonical_mappings AS (
       SELECT DISTINCT ON (mim.task_id)
              mim.task_id,
              mim.monday_item_id,
              COALESCE(mim.monday_board_id, bm.monday_board_id) AS monday_board_id,
              mim.source_data->>'url' AS monday_url,
              COALESCE(mim.archived, false) AS archived
         FROM monday_item_mappings mim
         LEFT JOIN monday_board_mappings bm ON bm.id = mim.board_mapping_id
        WHERE mim.task_id IS NOT NULL AND mim.status = 'completed'
        ORDER BY mim.task_id, mim.updated_at DESC
     )
     SELECT t.id AS "taskId", t.assignee_id AS "assigneeId", t.title,
            mim.monday_item_id AS "mondayItemId",
            mim.monday_board_id AS "mondayBoardId",
            mim.monday_url AS "mondayUrl",
            CASE WHEN t.is_blocked THEN 'blocked' WHEN t.due_date < CURRENT_DATE THEN 'overdue' ELSE 'inactive' END AS reason
       FROM tasks t
       JOIN canonical_mappings mim ON mim.task_id = t.id
      WHERE t.assignee_id IS NOT NULL
        AND NOT mim.archived
        AND (t.is_blocked OR t.due_date < CURRENT_DATE OR t.updated_at < NOW() - INTERVAL '3 days')
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = t.assignee_id AND n.metadata->>'localTaskId' = t.id::text AND n.type IN ('monday_inactive', 'monday_blocked') AND n.created_at > NOW() - INTERVAL '1 day')
      ORDER BY t.updated_at ASC LIMIT 100`,
  )
  let sent = 0
  for (const alert of alerts) {
    const type = alert.reason === 'blocked' ? 'monday_blocked' : 'monday_inactive'
    const localTaskUrl = `/agency/tasks/${alert.taskId}`
    await createNotification({
      userId: alert.assigneeId,
      type,
      title: alert.reason === 'blocked' ? 'Monday task is blocked' : 'Monday task needs an update',
      message: `${alert.title} is ${alert.reason}. Review the local task and add an update in Monday.`,
      link: localTaskUrl,
      metadata: {
        localTaskId: alert.taskId,
        localTaskUrl,
        mondayItemId: alert.mondayItemId,
        mondayBoardId: alert.mondayBoardId,
        mondayUrl: alert.mondayUrl,
        source: 'monday-health',
      },
      reason: 'direct',
    })
    sent++
  }
  return { ok: true, scanned: alerts.length, sent }
})
