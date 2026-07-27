import { requireClientAuth } from '~~/server/utils/clientAuth'
import { resolveClientEntitlement } from '~~/server/utils/billing/entitlements'

const PORTAL_FEATURES = [
  'crm.core',
  'crm.external',
  'catalog.sync',
  'mobile.crm',
  'persona.identity',
  'audience.google',
  'audience.meta',
  'communications.sms',
  'communications.voice',
  'ai.receptionist',
  'mcp.crm'
] as const

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  const entitlements = await Promise.all(
    PORTAL_FEATURES.map(featureKey => resolveClientEntitlement(client.clientId, featureKey))
  )
  return {
    clientId: client.clientId,
    leadCaptureMode: client.leadCaptureMode,
    entitlements: Object.fromEntries(entitlements.map(item => [item.featureKey, item]))
  }
})
