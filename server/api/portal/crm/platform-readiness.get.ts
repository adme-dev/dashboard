import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getClientPlatformRolloutReadiness } from '~~/server/utils/crm/platformRolloutReadiness'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  if (client.leadCaptureMode !== 'full_crm') {
    return {
      enabled: false,
      reason: 'full_crm_required',
      generatedAt: new Date().toISOString()
    }
  }
  return {
    enabled: true,
    ...await getClientPlatformRolloutReadiness(client.clientId)
  }
})
