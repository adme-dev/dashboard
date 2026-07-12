import type { MondayProcessSummary } from './mondayProcessSuggestions'
import type { ActiveMondayEvidenceScope } from './mondayScope'
import { queryRows } from '~~/server/utils/db'

export async function loadMondayProcessSummaries(scope: ActiveMondayEvidenceScope): Promise<MondayProcessSummary[]> {
  return queryRows<MondayProcessSummary>(
    `SELECT COALESCE(mapping.monday_board_id, board.monday_board_id) AS "boardId",
            COALESCE(monday_board_name, 'Monday board ' || monday_board_id) AS "boardName",
            COUNT(*)::int AS "itemCount",
            COUNT(*) FILTER (WHERE COALESCE(is_blocked, false))::int AS "blockedCount",
            COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status_name IS DISTINCT FROM 'Done')::int AS "overdueCount",
            COALESCE(array_agg(DISTINCT status_name) FILTER (WHERE status_name IS NOT NULL), ARRAY[]::text[]) AS "statusNames",
            COALESCE((array_agg(DISTINCT title ORDER BY title) FILTER (WHERE title IS NOT NULL))[1:5], ARRAY[]::text[]) AS "sampleTitles"
       FROM hr_monday_evidence_extracts
      WHERE scope_id = $1 AND expires_at > NOW()
      GROUP BY monday_board_id, monday_board_name
      ORDER BY "boardName"`,
    [scope.id],
  )
}
