import { requireClientAuth } from '~~/server/utils/clientAuth'
import { leadStatusTransitionService } from '~~/server/utils/leads/statusTransition'
import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.canManageLeadOutcomes) {
    throw createError({ statusCode: 403, statusMessage: 'Lead outcome permission required' })
  }
  const id = getRouterParam(event, 'id')!
  const result = await leadStatusTransitionService.move({
    clientId: client.clientId,
    leadId: id,
    toStatus: 'contacted',
    transitionId: crypto.randomUUID(),
    actor: { type: 'client_user', id: client.id },
    occurredAt: new Date().toISOString(),
    consentDecision: 'unknown',
    reason: 'Client portal lead marked contacted',
    portalVisibleOnly: true
  })
  if (result.status === 'lead_not_found') {
    throw createError({ statusCode: 404, statusMessage: 'not_updatable' })
  }
  if (result.status === 'moved' && result.outbox?.event.outboxStatus === 'pending') {
    try {
      await conversionOutboxPublisher.publishEvent(event, result.outbox.event.eventId)
    } catch (error) {
      console.warn({
        event: 'measurement_outbox_post_commit_publish_failed',
        clientId: client.clientId,
        eventId: result.outbox.event.eventId,
        errorClass: error instanceof Error ? error.name : 'unknown'
      })
    }
  }
  return { ok: true }
})
