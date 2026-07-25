import { z } from 'zod'
import { requirePersonaAdminAccess } from '~~/server/utils/persona/access'
import { transitionPersonaActivationRequest } from '~~/server/utils/persona/activation'
import { queuePersonaAudienceOperation } from '~~/server/utils/persona/audienceSync'

const Body = z.strictObject({
  clientId: z.string().uuid(),
  action: z.enum(['approve_privacy', 'approve_live', 'reject', 'cancel', 'retry', 'deactivate']),
  reason: z.string().trim().min(3).max(1000),
  acceptProviderTerms: z.boolean().optional()
})

export default defineEventHandler(async event => {
  const user = await requirePersonaAdminAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  const requestId = getRouterParam(event, 'id') as string
  if (parsed.data.action === 'retry' || parsed.data.action === 'deactivate') {
    return queuePersonaAudienceOperation({
      event,
      clientId: parsed.data.clientId,
      requestId,
      operation: parsed.data.action === 'deactivate' ? 'remove' : 'sync',
      actorId: user.id
    })
  }
  if (parsed.data.action === 'approve_live' && parsed.data.acceptProviderTerms !== true) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provider Customer Match terms must be accepted for live approval'
    })
  }
  const result = await transitionPersonaActivationRequest({
    clientId: parsed.data.clientId,
    action: parsed.data.action,
    reason: parsed.data.reason,
    requestId,
    actorId: user.id
  })
  if (result.exportReady) {
    return {
      ...result,
      export: await queuePersonaAudienceOperation({
        event,
        clientId: parsed.data.clientId,
        requestId,
        operation: 'sync',
        actorId: user.id,
        acceptProviderTerms: true
      })
    }
  }
  return result
})
