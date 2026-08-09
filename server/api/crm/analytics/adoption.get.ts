// server/api/crm/analytics/adoption.get.ts
// CRM Adoption metrics for the Insights tab (P4.0b) — agency-only.
// Instruments the Phase 1–3 success metrics that were never measured:
// opp task-coverage, % people scored, saved-views/user, post-merge dup rate.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { computeAdoption, type AdoptionInput } from '~~/server/utils/crm/adoption'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({ client_id: z.string().uuid() })

interface CountsRow {
  active_opps: number
  active_opps_with_task: number
  people: number
  people_with_score: number
  views: number
  view_users: number
  companies: number
  merges: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  const scoped = context.actorType === 'staff' && context.visibility.ownerScoped
  const oppScope = scoped ? ' AND (owner_id = $2 OR assigned_to = $2)' : ''
  const oppAliasScope = scoped ? ' AND (o.owner_id = $2 OR o.assigned_to = $2)' : ''
  const peopleScope = scoped ? ' AND (owner_id = $2 OR assigned_to = $2)' : ''
  const peopleAliasScope = scoped ? ' AND (p.owner_id = $2 OR p.assigned_to = $2)' : ''
  const companyScope = scoped ? ' AND (owner_id = $2 OR assigned_to = $2)' : ''
  const viewsScope = scoped ? ' AND created_by = $2' : ''

  const row = await queryOne<CountsRow>(
    `SELECT
       (SELECT COUNT(*) FROM crm_opportunities
          WHERE client_id = $1 AND status = 'open' AND deleted_at IS NULL${oppScope})::int AS active_opps,
       (SELECT COUNT(DISTINCT o.id) FROM crm_opportunities o
          JOIN crm_tasks t ON t.target_type = 'opportunity' AND t.target_id = o.id
            AND t.client_id = $1 AND t.status IN ('pending','in_progress') AND t.deleted_at IS NULL
          WHERE o.client_id = $1 AND o.status = 'open' AND o.deleted_at IS NULL${oppAliasScope})::int AS active_opps_with_task,
       (SELECT COUNT(*) FROM crm_people
          WHERE client_id = $1 AND deleted_at IS NULL${peopleScope})::int AS people,
       (SELECT COUNT(DISTINCT s.target_id) FROM crm_scores s
          JOIN crm_people p ON p.id = s.target_id AND p.deleted_at IS NULL
          WHERE s.client_id = $1 AND s.target_type = 'person'${peopleAliasScope})::int AS people_with_score,
       (SELECT COUNT(*) FROM crm_views WHERE client_id = $1${viewsScope})::int AS views,
       (SELECT COUNT(DISTINCT created_by) FROM crm_views WHERE client_id = $1${viewsScope})::int AS view_users,
       (SELECT COUNT(*) FROM crm_companies
          WHERE client_id = $1 AND deleted_at IS NULL${companyScope})::int AS companies,
       ${scoped ? '0' : '(SELECT COUNT(*) FROM crm_merge_log WHERE client_id = $1)'}::int AS merges`,
    scoped ? [context.clientId, context.actorId] : [context.clientId],
  )

  const c = row ?? {
    active_opps: 0, active_opps_with_task: 0, people: 0, people_with_score: 0,
    views: 0, view_users: 0, companies: 0, merges: 0,
  }

  const input: AdoptionInput = {
    activeOpps: Number(c.active_opps),
    activeOppsWithOpenTask: Number(c.active_opps_with_task),
    people: Number(c.people),
    peopleWithScore: Number(c.people_with_score),
    views: Number(c.views),
    viewUsers: Number(c.view_users),
    contacts: Number(c.people) + Number(c.companies),
    merges: Number(c.merges),
  }

  return computeAdoption(input)
})
