import { queryRows } from '~~/server/utils/db'

export type HrMondaySyncState = {
  id: string
  scopeId: string
  mondayBoardId: string
  cursor: string | null
  lastSourceUpdatedAt: string | null
  lastStartedAt: string | null
  lastCompletedAt: string | null
  status: 'idle' | 'running' | 'completed' | 'failed'
  recordsSeen: number
  recordsCreated: number
  recordsUpdated: number
  recordsArchived: number
  recordsFailed: number
  errorMessage: string | null
}

export async function listMondaySyncStates(scopeId: string): Promise<HrMondaySyncState[]> {
  return queryRows<HrMondaySyncState>(
    `SELECT id, scope_id AS "scopeId", monday_board_id AS "mondayBoardId", cursor,
            last_source_updated_at AS "lastSourceUpdatedAt", last_started_at AS "lastStartedAt",
            last_completed_at AS "lastCompletedAt", status,
            records_seen AS "recordsSeen", records_created AS "recordsCreated",
            records_updated AS "recordsUpdated", records_archived AS "recordsArchived",
            records_failed AS "recordsFailed", error_message AS "errorMessage"
       FROM hr_monday_sync_states
      WHERE scope_id = $1
      ORDER BY monday_board_id`,
    [scopeId],
  )
}
