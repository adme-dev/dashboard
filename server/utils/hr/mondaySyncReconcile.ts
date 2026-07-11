import { execute, queryOne, queryRows } from '~~/server/utils/db'

type ScopedBoard = { boardId: string; itemsMigrated: number; itemsFailed: number; status: string; errorMessage: string | null }

export async function reconcileMondaySyncSession(scopeId: string, boardIds: string[], sessionId: string) {
  const session = await queryOne<{ id: string; status: string; errorMessage: string | null }>(
    `SELECT id, status, error_message AS "errorMessage" FROM monday_migration_sessions WHERE id = $1`,
    [sessionId],
  )
  if (!session) return null

  const boards = await queryRows<ScopedBoard>(
    `SELECT monday_board_id AS "boardId", items_migrated AS "itemsMigrated",
            items_failed AS "itemsFailed", status, error_message AS "errorMessage"
       FROM monday_board_mappings WHERE migration_session_id = $1`,
    [sessionId],
  )
  const byBoard = new Map(boards.map(board => [board.boardId, board]))

  for (const boardId of boardIds) {
    const board = byBoard.get(boardId)
    const status = board?.status === 'completed'
      ? 'completed'
      : board?.status === 'failed' || session.status === 'failed'
        ? 'failed'
        : 'running'
    await execute(
      `UPDATE hr_monday_sync_states
          SET status = $1::varchar,
              records_seen = COALESCE($2::integer, records_seen),
              records_created = COALESCE($2::integer, records_created),
              records_failed = COALESCE($3::integer, records_failed),
              last_source_updated_at = CASE WHEN $1::text = 'completed' THEN NOW() ELSE last_source_updated_at END,
              last_completed_at = CASE WHEN $1::text = 'completed' THEN NOW() ELSE last_completed_at END,
              error_message = $4::text,
              updated_at = NOW()
        WHERE scope_id = $5 AND monday_board_id = $6`,
      [status, board?.itemsMigrated ?? null, board?.itemsFailed ?? null, board?.errorMessage || session.errorMessage, scopeId, boardId],
    )
  }

  return { session, boards }
}
