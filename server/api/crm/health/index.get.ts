// server/api/crm/health/index.get.ts
// Returns customer-HEALTH scores for a client's people or companies, keyed by
// target_id (mirrors scoring/index.get.ts but score_type='health'). Agency-only.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { crmVisibilityCond } from '~~/server/utils/crm/recordAccess'

const Query = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company']),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  const table = q.target_type === 'person' ? 'crm_people' : 'crm_companies'
  const visibility = crmVisibilityCond(context, q.target_type, table)
  const params: unknown[] = [context.clientId, q.target_type]
  let visibilityParam = 0
  const visibilitySql = visibility
    ? ` AND ${visibility.sql.replace(/\?/g, () => `$${params.push(visibility.params[visibilityParam++])}`)}`
    : ''
  const items = await queryRows(
    `SELECT target_id, total_score, grade, engagement_score, intent_score, fit_score, recency_score, computed_at
       FROM crm_scores s
       JOIN ${table} ON ${table}.id = s.target_id AND ${table}.client_id = s.client_id AND ${table}.deleted_at IS NULL
      WHERE s.client_id = $1 AND s.target_type = $2 AND s.score_type = 'health'${visibilitySql}`,
    params,
  )
  const byTarget: Record<string, typeof items[number]> = {}
  for (const it of items) byTarget[(it as { target_id: string }).target_id] = it
  return { items, byTarget }
})
