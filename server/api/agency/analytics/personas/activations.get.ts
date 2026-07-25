import { requirePersonaReadAccess } from '~~/server/utils/persona/access'
import { listPersonaActivationRequests } from '~~/server/utils/persona/activation'
import {
  listPersonaAudienceProviderState,
  personaProviderWritesEnabled
} from '~~/server/utils/persona/audienceSync'

export default defineEventHandler(async event => {
  await requirePersonaReadAccess(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
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
