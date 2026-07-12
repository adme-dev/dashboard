import type { MondayProcessSummary } from './mondayProcessSuggestions'
import type { ActiveMondayEvidenceScope } from './mondayScope'
import { queryRows } from '~~/server/utils/db'

export async function loadMondayProcessSummaries(scope: ActiveMondayEvidenceScope): Promise<MondayProcessSummary[]> {
  return queryRows<MondayProcessSummary>(
    `SELECT COALESCE(mapping.monday_board_id, board.monday_board_id) AS "boardId",
            COALESCE(board.monday_board_name, 'Monday board ' || COALESCE(mapping.monday_board_id, board.monday_board_id)) AS "boardName",
            COUNT(DISTINCT mapping.monday_item_id)::int AS "itemCount",
            COUNT(DISTINCT mapping.monday_item_id) FILTER (WHERE COALESCE(task.is_blocked, false))::int AS "blockedCount",
            COUNT(DISTINCT mapping.monday_item_id) FILTER (WHERE task.due_date < CURRENT_DATE AND COALESCE(task.status_is_final, false) = false)::int AS "overdueCount",
            COALESCE(array_agg(DISTINCT status.name) FILTER (WHERE status.name IS NOT NULL), ARRAY[]::text[]) AS "statusNames",
            COALESCE((array_agg(DISTINCT mapping.monday_item_name ORDER BY mapping.monday_item_name) FILTER (WHERE mapping.monday_item_name IS NOT NULL))[1:5], ARRAY[]::text[]) AS "sampleTitles"
       FROM monday_item_mappings mapping
       LEFT JOIN monday_board_mappings board ON board.id = mapping.board_mapping_id
       LEFT JOIN tasks task ON task.id = mapping.task_id
       LEFT JOIN task_statuses status ON status.id = task.status_id
      WHERE COALESCE(mapping.monday_board_id, board.monday_board_id) = ANY($1::text[])
        AND mapping.status = 'completed'
        AND mapping.created_at::date BETWEEN GREATEST($2::date, CURRENT_DATE - ($4::int * INTERVAL '1 day')) AND $3::date
      GROUP BY COALESCE(mapping.monday_board_id, board.monday_board_id), board.monday_board_name
      ORDER BY "boardName"`,
    [scope.board_ids, scope.period_start, scope.period_end, scope.retention_days],
  )
}
