// server/api/crm/ai/status.get.ts — is the CRM AI layer enabled? Agency-only.
import { requireAuth } from '~~/server/utils/auth'
import { isCrmAiEnabled } from '~~/server/utils/crm/aiConfig'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  return { enabled: isCrmAiEnabled() }
})
