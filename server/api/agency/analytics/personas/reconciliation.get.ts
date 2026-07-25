import { requirePersonaAdminAccess } from '~~/server/utils/persona/access'
import { getIdentityReconciliationSnapshot } from '~~/server/utils/persona/reconciliation'

export default defineEventHandler(async event => {
  await requirePersonaAdminAccess(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const clientId = String(getQuery(event).clientId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid clientId is required' })
  }
  return getIdentityReconciliationSnapshot(clientId)
})
