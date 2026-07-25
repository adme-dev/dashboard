import { requireAuth } from '~~/server/utils/auth'
import { getIdentityReconciliationSnapshot } from '~~/server/utils/persona/reconciliation'

export default defineEventHandler(async event => {
  const user = await requireAuth(event)
  if (!['owner', 'admin'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Owner or admin access required' })
  }
  const clientId = String(getQuery(event).clientId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid clientId is required' })
  }
  return getIdentityReconciliationSnapshot(clientId)
})
