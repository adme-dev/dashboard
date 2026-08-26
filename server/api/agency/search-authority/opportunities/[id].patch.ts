import { getRouterParam } from 'h3'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { executeSearchAuthorityMutation } from '~~/server/utils/searchAuthority/godModeMutations'

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
  const result = await executeSearchAuthorityMutation(event, 'opportunity-transition', async (db) => {
    const updated = await db.query(
      `UPDATE search_authority_opportunities
     SET lifecycle_status = $3,
         resolved_at = CASE WHEN $4 THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1
       AND client_id = $2
       AND lifecycle_status = $5
     RETURNING id, lifecycle_status`,
      [
        opportunityId,
        parsed.data.clientId,
        parsed.data.status,
        isTerminal,
        opportunity.lifecycle_status
      ]
    )
    const row = updated.rows[0] as { id: string, lifecycle_status: Status } | undefined
    if (!row) {
      throw createError({
        statusCode: 409,
        statusMessage: 'The opportunity changed before the transition completed'
      })
    }
    return { id: row.id, status: row.lifecycle_status }
  }, async (db, id) => {
    const row = await db.query(`SELECT id, lifecycle_status FROM search_authority_opportunities WHERE id = $1 AND client_id = $2`, [id, parsed.data.clientId])
    const current = row.rows[0] as { id: string, lifecycle_status: Status } | undefined
    if (!current) throw new Error('Replayed opportunity no longer exists')
    return { id: current.id, status: current.lifecycle_status }
  })
  return { ok: true, status: result.status }
})
