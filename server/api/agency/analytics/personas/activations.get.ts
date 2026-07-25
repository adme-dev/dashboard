import { requireAuth } from '~~/server/utils/auth'
import { listPersonaActivationRequests } from '~~/server/utils/persona/activation'
import {
  listPersonaAudienceProviderState,
  personaProviderWritesEnabled
} from '~~/server/utils/persona/audienceSync'

export default defineEventHandler(async event => {
  await requireAuth(event)
  const clientId = String(getQuery(event).clientId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid clientId is required' })
  }
  return {
    items: await listPersonaActivationRequests(clientId),
    providerDispatchEnabled: personaProviderWritesEnabled(),
    providerState: await listPersonaAudienceProviderState(clientId)
  }
})
