import { queryOne, queryRows } from '~~/server/utils/db'

export type MondayReconciliationIssue = {
  mondayBoardId: string
  mondayItemId: string
  mondayUrl: string | null
  taskId: string | null
  title: string
  sourceState: 'active' | 'archived' | 'deleted'
  reconciliationStatus: 'current' | 'pending' | 'archived' | 'deleted'
  sourceUpdatedAt: string | null
  localUpdatedAt: string | null
}

export type MondayReconciliationSummary = {
  total: number
  current: number
  pending: number
  archived: number
  deleted: number
  sourceNewer: number
  localNewer: number
  issues: MondayReconciliationIssue[]
}

const canonicalMappings = `
  SELECT DISTINCT ON (COALESCE(mim.monday_board_id, bm.monday_board_id), mim.monday_item_id)
         COALESCE(mim.monday_board_id, bm.monday_board_id) AS monday_board_id,
         mim.monday_item_id,
         mim.monday_item_name,
         mim.task_id,
         mim.source_state,
         mim.reconciliation_status,
         mim.source_updated_at,
         mim.source_data->>'url' AS monday_url
    FROM monday_item_mappings mim
    LEFT JOIN monday_board_mappings bm ON bm.id = mim.board_mapping_id
   WHERE COALESCE(mim.monday_board_id, bm.monday_board_id) = ANY($1::text[])
     AND mim.status = 'completed'
   ORDER BY COALESCE(mim.monday_board_id, bm.monday_board_id), mim.monday_item_id,
            mim.created_at DESC, mim.updated_at DESC
`

export async function getMondayReconciliationSummary(boardIds: string[]): Promise<MondayReconciliationSummary> {
  if (!boardIds.length) return { total: 0, current: 0, pending: 0, archived: 0, deleted: 0, sourceNewer: 0, localNewer: 0, issues: [] }

  const counts = await queryOne<Omit<MondayReconciliationSummary, 'issues'>>(
    `WITH canonical AS (${canonicalMappings})
     SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c.reconciliation_status = 'current')::int AS current,
            COUNT(*) FILTER (WHERE c.reconciliation_status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE c.source_state = 'archived')::int AS archived,
            COUNT(*) FILTER (WHERE c.source_state = 'deleted')::int AS deleted,
            COUNT(*) FILTER (
              WHERE c.source_state = 'active' AND c.source_updated_at > t.updated_at + INTERVAL '1 second'
            )::int AS "sourceNewer",
            COUNT(*) FILTER (
              WHERE c.source_state = 'active' AND t.updated_at > c.source_updated_at + INTERVAL '1 second'
            )::int AS "localNewer"
       FROM canonical c
       LEFT JOIN tasks t ON t.id = c.task_id`,
    [boardIds],
  )

  const issues = await queryRows<MondayReconciliationIssue>(
    `WITH canonical AS (${canonicalMappings})
     SELECT c.monday_board_id AS "mondayBoardId",
            c.monday_item_id AS "mondayItemId",
            c.monday_url AS "mondayUrl",
            c.task_id AS "taskId",
            c.monday_item_name AS title,
            c.source_state AS "sourceState",
            c.reconciliation_status AS "reconciliationStatus",
            c.source_updated_at AS "sourceUpdatedAt",
            t.updated_at AS "localUpdatedAt"
       FROM canonical c
       LEFT JOIN tasks t ON t.id = c.task_id
      WHERE c.reconciliation_status <> 'current'
         OR (c.source_state = 'active' AND c.source_updated_at > t.updated_at + INTERVAL '1 second')
         OR (c.source_state = 'active' AND t.updated_at > c.source_updated_at + INTERVAL '1 second')
      ORDER BY c.source_updated_at DESC NULLS LAST
      LIMIT 20`,
    [boardIds],
  )

  return {
    total: counts?.total ?? 0,
    current: counts?.current ?? 0,
    pending: counts?.pending ?? 0,
    archived: counts?.archived ?? 0,
    deleted: counts?.deleted ?? 0,
    sourceNewer: counts?.sourceNewer ?? 0,
    localNewer: counts?.localNewer ?? 0,
    issues,
  }
}
