import { z } from 'zod'
import { execute, queryOne, transaction } from '~~/server/utils/db'
import { leadStatusTransitionService } from '~~/server/utils/leads/statusTransition'
import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'
import { resolveMarketingLeadBrowserScope, requireLeadAssigneeAuthority } from '~~/server/utils/leads/followupAccess'
import { assignLeadFollowup } from '~~/server/utils/leads/followupAssignment'

const Body = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'won', 'lost', 'spam_suspected']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional()
}).refine(b => Object.keys(b).length > 0, { message: 'no fields' })

export default defineEventHandler(async (event) => {
  const { user, marketing } = await resolveMarketingLeadBrowserScope(event, undefined, { write: true, legacyWrite: true })
  const id = getRouterParam(event, 'id')!
  const body = Body.parse(await readBody(event))
  const lead = await queryOne<{ client_id: string }>(
    `SELECT client_id FROM leads l ${marketing ? 'JOIN agency_clients c ON c.id=l.client_id AND c.is_active=TRUE' : ''} WHERE l.id = $1 AND l.deleted_at IS NULL`,
    [id]
  )
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'not_found' })

  const sets: string[] = []
  const params: unknown[] = []
  const set = (col: string, val: unknown) => {
    params.push(val)
    sets.push(`${col} = $${params.length}`)
  }

  if (marketing && body.assigned_to) await requireLeadAssigneeAuthority(event, lead.client_id, body.assigned_to)
  if ('assigned_to' in body) {
    await transaction(async db => assignLeadFollowup(db, {
      clientId: lead.client_id,
      leadId: id,
      assigneeId: body.assigned_to ?? null,
      scopeActiveClient: marketing !== null,
      excludeTest: marketing !== null
    }))
  }
  if ('notes' in body) set('notes', body.notes)

  if (body.status) {
    const result = await leadStatusTransitionService.move({
      clientId: lead.client_id,
      leadId: id,
      toStatus: body.status,
      transitionId: crypto.randomUUID(),
      actor: { type: 'team_member', id: user.id },
      occurredAt: new Date().toISOString(),
      consentDecision: 'unknown',
      reason: 'Agency lead status update',
      portalVisibleOnly: false
    })
    if (result.status === 'lead_not_found') {
      throw createError({ statusCode: 404, statusMessage: 'not_found' })
    }
    if (result.status === 'moved' && result.outbox?.event.outboxStatus === 'pending') {
      try {
        await conversionOutboxPublisher.publishEvent(event, result.outbox.event.eventId)
      } catch (error) {
        console.warn({
          event: 'measurement_outbox_post_commit_publish_failed',
          clientId: lead.client_id,
          eventId: result.outbox.event.eventId,
          errorClass: error instanceof Error ? error.name : 'unknown'
        })
      }
    }
  }

  if (sets.length) {
    params.push(id)
    const idIndex = params.length
    params.push(lead.client_id)
    const clientIndex = params.length
    const n = await execute(
      `UPDATE leads
          SET ${sets.join(', ')}
        WHERE id = $${idIndex}
          AND client_id = $${clientIndex}
          AND deleted_at IS NULL`,
      params
    )
    if (!n) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  }
  return { ok: true }
})
