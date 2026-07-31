import { getRouterParam } from 'h3'
import { z } from 'zod'
import { execute, queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

const Status = z.enum([
  'new',
  'under_review',
  'accepted',
  'task_created',
  'in_progress',
  'published',
  'measuring',
  'closed',
  'dismissed',
  'duplicate',
  'expired',
  'not_actionable'
])
type Status = z.infer<typeof Status>

const Body = z.object({
  clientId: z.string().uuid(),
  status: Status
})

const terminal = new Set<Status>([
  'closed',
  'dismissed',
  'duplicate',
  'expired',
  'not_actionable'
])
const transitions: Record<Status, Status[]> = {
  new: ['under_review', 'dismissed', 'duplicate', 'expired', 'not_actionable'],
  under_review: ['accepted', 'dismissed', 'duplicate', 'expired', 'not_actionable'],
  accepted: ['dismissed', 'not_actionable'],
  task_created: ['in_progress', 'dismissed', 'not_actionable'],
  in_progress: ['published', 'dismissed', 'not_actionable'],
  published: ['measuring', 'dismissed', 'not_actionable'],
  measuring: ['closed', 'dismissed', 'not_actionable'],
  closed: [],
  dismissed: [],
  duplicate: [],
  expired: [],
  not_actionable: []
}

export default eventHandler(async (event) => {
  const opportunityId = String(getRouterParam(event, 'id') || '')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid opportunity transition'
    })
  }
  await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  const opportunity = await queryOne<{ id: string, lifecycle_status: Status }>(
    `SELECT id, lifecycle_status
     FROM search_authority_opportunities
     WHERE id = $1 AND client_id = $2
     LIMIT 1`,
    [opportunityId, parsed.data.clientId]
  )
  if (!opportunity) {
    throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  }
  if (!transitions[opportunity.lifecycle_status].includes(parsed.data.status)) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot move opportunity from ${opportunity.lifecycle_status} to ${parsed.data.status}`
    })
  }
  const isTerminal = terminal.has(parsed.data.status)
  const updated = await execute(
    `UPDATE search_authority_opportunities
     SET lifecycle_status = $3,
         resolved_at = CASE WHEN $4 THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1
       AND client_id = $2
       AND lifecycle_status = $5`,
    [
      opportunityId,
      parsed.data.clientId,
      parsed.data.status,
      isTerminal,
      opportunity.lifecycle_status
    ]
  )
  if (updated !== 1) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The opportunity changed before the transition completed'
    })
  }
  return { ok: true, status: parsed.data.status }
})
