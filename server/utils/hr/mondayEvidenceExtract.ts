import { execute, queryOne } from '~~/server/utils/db'
import type { ActiveMondayEvidenceScope } from './mondayScope'

const hasAny = (allowed: Set<string>, names: string[]) => names.some(name => allowed.has(name))

export async function refreshMondayEvidenceExtracts(scope: ActiveMondayEvidenceScope) {
  const allowed = new Set(scope.allowed_fields.map(field => field.trim().toLowerCase()))
  const result = await queryOne<{ extracted: number }>(
    `WITH latest AS (
       SELECT DISTINCT ON (COALESCE(mapping.monday_board_id, board.monday_board_id), mapping.monday_item_id)
              COALESCE(mapping.monday_board_id, board.monday_board_id) AS board_id,
              board.monday_board_name AS board_name,
              mapping.monday_item_id, mapping.task_id, mapping.monday_item_name,
              task.assignee_id, task.due_date, status.name AS status_name,
              task.is_blocked, mapping.created_at,
              COALESCE(mapping.source_updated_at, mapping.updated_at) AS source_updated_at
         FROM monday_item_mappings mapping
         LEFT JOIN monday_board_mappings board ON board.id = mapping.board_mapping_id
         LEFT JOIN tasks task ON task.id = mapping.task_id
         LEFT JOIN task_statuses status ON status.id = task.status_id
        WHERE COALESCE(mapping.monday_board_id, board.monday_board_id) = ANY($2::text[])
          AND mapping.status = 'completed'
          AND NOT COALESCE(mapping.archived, false)
          AND mapping.created_at::date BETWEEN GREATEST($3::date, CURRENT_DATE - ($5::int * INTERVAL '1 day')) AND $4::date
        ORDER BY COALESCE(mapping.monday_board_id, board.monday_board_id), mapping.monday_item_id,
                 COALESCE(mapping.source_updated_at, mapping.updated_at) DESC
     ), upserted AS (
       INSERT INTO hr_monday_evidence_extracts
         (scope_id, monday_board_id, monday_board_name, monday_item_id, task_id, title,
          assignee_id, due_date, status_name, is_blocked, source_created_at,
          source_updated_at, source_ref, observed_at, expires_at)
       SELECT $1, board_id, board_name, monday_item_id, task_id,
              CASE WHEN $6::boolean THEN monday_item_name ELSE NULL END,
              CASE WHEN $7::boolean THEN assignee_id ELSE NULL END,
              CASE WHEN $8::boolean THEN due_date ELSE NULL END,
              CASE WHEN $9::boolean THEN status_name ELSE NULL END,
              CASE WHEN $10::boolean THEN is_blocked ELSE NULL END,
              CASE WHEN $11::boolean THEN created_at ELSE NULL END,
              source_updated_at,
              'monday:item:' || board_id || ':' || monday_item_id,
              NOW(), NOW() + ($5::int * INTERVAL '1 day')
         FROM latest
       ON CONFLICT (scope_id, monday_board_id, monday_item_id) DO UPDATE SET
         monday_board_name = EXCLUDED.monday_board_name, task_id = EXCLUDED.task_id,
         title = EXCLUDED.title, assignee_id = EXCLUDED.assignee_id,
         due_date = EXCLUDED.due_date, status_name = EXCLUDED.status_name,
         is_blocked = EXCLUDED.is_blocked, source_created_at = EXCLUDED.source_created_at,
         source_updated_at = EXCLUDED.source_updated_at, observed_at = NOW(),
         expires_at = EXCLUDED.expires_at
       RETURNING id
     ) SELECT COUNT(*)::int AS extracted FROM upserted`,
    [
      scope.id, scope.board_ids, scope.period_start, scope.period_end, scope.retention_days,
      hasAny(allowed, ['name', 'title']), hasAny(allowed, ['assignee', 'assignee_id']),
      hasAny(allowed, ['due_date', 'due date']), allowed.has('status'),
      hasAny(allowed, ['blocked', 'is_blocked']), hasAny(allowed, ['created_at', 'created']),
    ],
  )
  await execute(
    `DELETE FROM hr_monday_evidence_extracts
      WHERE expires_at <= NOW()
         OR (scope_id = $1 AND monday_board_id <> ALL($2::text[]))`,
    [scope.id, scope.board_ids],
  )
  return { extracted: Number(result?.extracted || 0) }
}
