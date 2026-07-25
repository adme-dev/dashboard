import { requireClientAuth } from '~~/server/utils/clientAuth'
import { isPersonaIdentityEnabled } from '~~/server/utils/persona/feature'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  const enabled = client.leadCaptureMode === 'full_crm'
    && await isPersonaIdentityEnabled(client.clientId)
  return { enabled }
})

