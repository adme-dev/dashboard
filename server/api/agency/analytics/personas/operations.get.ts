import { requirePersonaReadAccess } from '~~/server/utils/persona/access'
import { getPersonaExportOperationsSnapshot } from '~~/server/utils/persona/exportOperations'

export default defineEventHandler(async event => {
  await requirePersonaReadAccess(event)
  const clientId = String(getQuery(event).clientId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid clientId is required' })
  }

  setHeader(event, 'Cache-Control', 'private, no-store')
  return getPersonaExportOperationsSnapshot(clientId)
})

