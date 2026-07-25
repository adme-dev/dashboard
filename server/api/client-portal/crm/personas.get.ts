import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listPersonaTimelines } from '~~/server/utils/persona/timeline'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  if (client.leadCaptureMode !== 'full_crm') {
    return { enabled: false, generatedAt: new Date().toISOString(), personas: [] }
  }
  return listPersonaTimelines(client.clientId)
})

