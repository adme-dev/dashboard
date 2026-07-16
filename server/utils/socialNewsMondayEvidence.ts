const MONDAY_SOURCE_ID = /^(?:item|discussion):[A-Za-z0-9_-]{1,160}$/
const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected', 'superseded'])

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum)
}

function booleanQuery(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() !== 'false'
}

export interface MondayEvidencePreviewQuery {
  limit: number
  includePlans: boolean
  includeDiscussions: boolean
}

export function normalizeMondayEvidencePreviewQuery(input: Record<string, unknown> = {}): MondayEvidencePreviewQuery {
  return {
    limit: boundedInteger(input.limit, 50, 1, 100),
    includePlans: booleanQuery(input.includePlans),
    includeDiscussions: booleanQuery(input.includeDiscussions),
  }
}

export function normalizeMondayEvidenceImportInput(input: Record<string, unknown> | null = {}) {
  const raw = Array.isArray(input?.sourceIds) ? input.sourceIds : []
  const sourceIds = [...new Set(raw
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(value => MONDAY_SOURCE_ID.test(value)))]
    .slice(0, 100)
  return { sourceIds }
}

export interface MondayEvidenceListQuery {
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'superseded'
  page: number
  pageSize: number
}

export function normalizeMondayEvidenceListQuery(input: Record<string, unknown> = {}): MondayEvidenceListQuery {
  const status = typeof input.reviewStatus === 'string' ? input.reviewStatus.trim() : ''
  return {
    reviewStatus: REVIEW_STATUSES.has(status) ? status as MondayEvidenceListQuery['reviewStatus'] : 'pending',
    page: boundedInteger(input.page, 1, 1, 10_000),
    pageSize: boundedInteger(input.pageSize, 25, 1, 100),
  }
}

/**
 * Client-scoped candidates copied from Monday mappings already held in XeroFlow.
 * Monday is never queried at request time and its text remains untrusted evidence.
 */
export const MONDAY_EVIDENCE_CANDIDATES_CTE = `
WITH mapped_items AS (
  SELECT DISTINCT ON (mim.monday_item_id)
         mim.id AS mapping_id,
         mim.monday_item_id,
         LEFT(mim.monday_item_name, 300) AS item_name,
         mim.task_id,
         task.project_id,
         NULLIF(LEFT(task.description, 20000), '') AS task_description,
         CASE
           WHEN LOWER(COALESCE(mim.source_data->>'url', '')) LIKE 'https://%'
             THEN LEFT(mim.source_data->>'url', 2000)
           ELSE NULL
         END AS source_url,
         COALESCE(mim.source_updated_at, mim.updated_at, mim.created_at) AS source_occurred_at
    FROM monday_item_mappings mim
    JOIN tasks task ON task.id = mim.task_id
    JOIN projects project ON project.id = task.project_id AND project.client_id = $1
   WHERE mim.status = 'completed'
     AND NOT COALESCE(mim.archived, false)
   ORDER BY mim.monday_item_id,
            COALESCE(mim.source_updated_at, mim.updated_at, mim.created_at) DESC,
            mim.id DESC
), evidence_candidates AS (
  SELECT 'item:' || item.monday_item_id AS source_id,
         'plan'::text AS evidence_type,
         item.item_name AS title,
         COALESCE(item.task_description, 'Monday work item: ' || item.item_name) AS content,
         NULL::text AS author,
         item.source_url,
         item.source_occurred_at AS occurred_at,
         item.project_id
    FROM mapped_items item
  UNION ALL
  SELECT 'discussion:' || update.monday_update_id AS source_id,
         'discussion'::text AS evidence_type,
         LEFT('Discussion · ' || item.item_name, 300) AS title,
         LEFT(update.body_text, 20000) AS content,
         NULLIF(LEFT(update.monday_creator_name, 255), '') AS author,
         item.source_url,
         update.created_at AS occurred_at,
         item.project_id
    FROM mapped_items item
    JOIN monday_item_mappings source_mapping
      ON source_mapping.monday_item_id = item.monday_item_id
     AND source_mapping.task_id = item.task_id
     AND source_mapping.status = 'completed'
    JOIN monday_update_mappings update ON update.item_mapping_id = source_mapping.id
   WHERE NULLIF(TRIM(update.body_text), '') IS NOT NULL
     AND update.monday_update_id NOT LIKE 'no-updates-%'
     AND update.monday_update_id NOT LIKE 'error-%'
  UNION ALL
  SELECT 'discussion:' || comment.monday_comment_id AS source_id,
         'discussion'::text AS evidence_type,
         LEFT('Discussion · ' || item.item_name, 300) AS title,
         LEFT(comment.body_text, 20000) AS content,
         NULL::text AS author,
         item.source_url,
         COALESCE(comment.source_created_at, comment.imported_at) AS occurred_at,
         item.project_id
    FROM mapped_items item
    JOIN monday_sync_comment_mappings comment
      ON comment.task_id = item.task_id AND comment.monday_item_id = item.monday_item_id
   WHERE NULLIF(TRIM(comment.body_text), '') IS NOT NULL
), deduped_candidates AS (
  SELECT DISTINCT ON (source_id)
         source_id, evidence_type, title, content, author, source_url, occurred_at, project_id
    FROM evidence_candidates
   ORDER BY source_id, occurred_at DESC NULLS LAST
)
`
