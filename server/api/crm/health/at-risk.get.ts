// server/api/crm/health/at-risk.get.ts
// Churn-risk view — customer contacts whose health score is At risk (Warm) or
// Critical (Cold), worst first, with their display name. Agency-only.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT s.target_type, s.target_id, s.total_score, s.grade,
            s.engagement_score, s.intent_score, s.fit_score, s.recency_score,
            s.computed_at::text AS computed_at,
            CASE WHEN s.target_type = 'person'
                 THEN NULLIF(TRIM(p.first_name || ' ' || COALESCE(p.last_name, '')), '')
                 ELSE c.name END AS name
       FROM crm_scores s
       LEFT JOIN crm_people p ON s.target_type = 'person' AND p.id = s.target_id AND p.deleted_at IS NULL
       LEFT JOIN crm_companies c ON s.target_type = 'company' AND c.id = s.target_id AND c.deleted_at IS NULL
      WHERE s.client_id = $1 AND s.score_type = 'health' AND s.grade IN ('Warm', 'Cold')
        AND (p.id IS NOT NULL OR c.id IS NOT NULL)
      ORDER BY s.total_score ASC
      LIMIT 100`,
    [client_id],
  )
  return { items }
})
