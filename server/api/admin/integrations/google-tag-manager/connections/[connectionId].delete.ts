import { requireRole } from '~~/server/utils/auth'
import { disconnectGtmConnection } from '~~/server/utils/googleTagManagerAdmin'

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const connectionId = getRouterParam(event, 'connectionId')
  const body = await readBody<{ confirmed?: boolean }>(event)
  if (!connectionId) throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  if (body?.confirmed !== true) {
    throw createError({ statusCode: 400, statusMessage: 'Explicit confirmation is required' })
  }
  return await disconnectGtmConnection(connectionId, user.id)
})
