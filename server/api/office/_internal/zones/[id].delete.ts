import { execute } from '~~/server/utils/db'
import { isAuthorizedSyncRequest } from '~~/server/utils/officeSyncAuth'

export default defineEventHandler(async (event) => {
  if (!isAuthorizedSyncRequest(event, getHeader(event, 'x-office-sync-secret'))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const deleted = await execute(
    `DELETE FROM office_zones WHERE id = $1 AND is_ephemeral = TRUE`,
    [id],
  )
  return { deleted }
})
