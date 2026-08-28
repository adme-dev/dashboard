import { requireRole } from '~~/server/utils/auth'
import { listGtmConnections } from '~~/server/utils/googleTagManagerStore'

export default eventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  return { connections: await listGtmConnections() }
})
