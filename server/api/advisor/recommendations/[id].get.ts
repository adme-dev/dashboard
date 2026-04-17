/**
 * GET /api/advisor/recommendations/:id
 *
 * Full detail: the recommendation row plus its event log and any
 * measured outcomes. Tenant-scoped.
 */

import { createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth } from '~~/server/utils/auth'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Recommendation ID required' })
  }

  const rec = await queryOne<any>(
    `SELECT
       r.*,
       far.period_key,
       far.period_label,
       far.grade AS source_report_grade,
       ac.name AS client_name,
       tm.name AS assignee_name,
       tm.avatar_url AS assignee_avatar_url
     FROM recommendations r
     LEFT JOIN financial_advisor_reports far ON far.id = r.source_report_id
     LEFT JOIN agency_clients ac ON ac.id = r.client_id
     LEFT JOIN team_members tm ON tm.id = r.assigned_to
     WHERE r.id = $1 AND r.tenant_id = $2`,
    [id, tenantId]
  )

  if (!rec) {
    throw createError({ statusCode: 404, statusMessage: 'Recommendation not found' })
  }

  const [events, outcomes] = await Promise.all([
    queryRows<any>(
      `SELECT
         e.id, e.event_type, e.actor_id, e.payload, e.created_at,
         tm.name AS actor_name, tm.avatar_url AS actor_avatar_url
       FROM recommendation_events e
       LEFT JOIN team_members tm ON tm.id = e.actor_id
       WHERE e.recommendation_id = $1
       ORDER BY e.created_at DESC`,
      [id]
    ),
    queryRows<any>(
      `SELECT id, measured_at, days_after_action, metric_value, metric_delta, notes
       FROM recommendation_outcomes
       WHERE recommendation_id = $1
       ORDER BY measured_at ASC`,
      [id]
    ),
  ])

  return { recommendation: rec, events, outcomes }
})
