// server/api/crm/ai/status.get.ts — is the CRM AI layer enabled? Agency-only.
import { requirePermission } from '~~/server/utils/auth'
import { isCrmAiEnabled } from '~~/server/utils/crm/aiConfig'
import { isApplicationCapabilityEnabled } from '~~/server/utils/godMode/featureGate'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'CLIENTS')
  return { enabled: await isApplicationCapabilityEnabled(event, isCrmAiEnabled) }
})
