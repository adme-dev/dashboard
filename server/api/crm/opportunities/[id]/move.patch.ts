// server/api/crm/opportunities/[id]/move.patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { opportunityStageTransitionService } from '~~/server/utils/crm/opportunityStageTransition'
import { runStageEntryAutomations } from '~~/server/utils/crm/stageAutomation'
import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  expected_stage_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000).optional()
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const occurredAt = new Date().toISOString()
  const result = await opportunityStageTransitionService.move({
    clientId: context.clientId,
    opportunityId: id as string,
    toStageId: b.stage_id,
    expectedStageId: b.expected_stage_id,
    actor: { type: 'team_member', id: context.actorId },
    occurredAt,
    consentDecision: 'unknown',
    reason: b.reason ?? 'Agency CRM stage move'
  }, context)

  if (result.status === 'stage_not_found') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  }
  if (result.status === 'opportunity_not_found') {
    throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  }
  if (result.status === 'stage_conflict') {
    throw createError({ statusCode: 409, statusMessage: 'Opportunity stage changed; reload and try again' })
  }
  if (result.status === 'terminal_state') {
    throw createError({ statusCode: 409, statusMessage: 'Won or lost opportunities cannot be moved' })
  }
  if (result.status === 'no_change') {
    return { item: { id, stage_id: result.currentStageId } }
  }

  const outboxEvent = result.outbox && result.outbox.status !== 'profile_not_found'
    ? result.outbox.event
    : null
  if (outboxEvent?.outboxStatus === 'pending') {
    try {
      await conversionOutboxPublisher.publishEvent(event, outboxEvent.eventId)
    } catch (error) {
      console.warn({
        event: 'measurement_outbox_post_commit_publish_failed',
        clientId: context.clientId,
        eventId: outboxEvent.eventId,
        errorClass: error instanceof Error ? error.name : 'unknown'
      })
    }
  }

  try {
    await runStageEntryAutomations({
      clientId: context.clientId,
      opportunityId: id as string,
      fromStageId: b.expected_stage_id,
      toStageId: b.stage_id,
      ownerId: result.item.owner_id,
      changedBy: context.actorId,
      accessContext: context,
      isWon: result.item.status === 'won',
      now: new Date(occurredAt)
    })
  } catch (error) {
    console.warn({
      event: 'crm_stage_automation_failed',
      clientId: context.clientId,
      opportunityId: id,
      historyId: result.historyId,
      errorClass: error instanceof Error ? error.name : 'unknown'
    })
  }
  return { item: result.item }
})
