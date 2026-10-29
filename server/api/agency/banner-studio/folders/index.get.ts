import { requireAuth } from '~~/server/utils/auth'
import { queryRowsFresh } from '~~/server/utils/db'
import { hasAllSocialClientAccess, hasSocialClientPermission } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  if (!hasAllSocialClientAccess(user) && !hasSocialClientPermission(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to the banner library' })
  }
  // Shared agency folder metadata only. Project lists retain their client/owner scope.
  setHeader(event, 'Cache-Control', 'private, no-store')
  return await queryRowsFresh(`SELECT id, name, parent_id AS "parentId", position,
    source_path AS "sourcePath" FROM banner_folders ORDER BY position, name, id`)
})
