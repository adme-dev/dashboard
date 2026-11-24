import { requireAuth } from '~~/server/utils/auth'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { hasAllBannerClientAccess, hasBannerClientPermission } from '~~/server/utils/banner/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const allClients = await hasAllBannerClientAccess(user)
  if (!allClients && !hasBannerClientPermission(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to the banner library' })
  }
  // Shared agency folder metadata only. Project lists retain their client/owner scope.
  setHeader(event, 'Cache-Control', 'private, no-store')
  const folders = await queryRowsFresh(`SELECT id, name, parent_id AS "parentId", position,
    source_path AS "sourcePath" FROM banner_folders ORDER BY position, name, id`)
  if (getQuery(event).view !== 'library') return folders
  const prefs = await queryOneFresh(`SELECT dashboard_preferences->'bannerFolderPins' AS pins
    FROM team_members WHERE id = $1`, [user.id])
  return {
    folders,
    pinnedIds: Object.keys(prefs?.pins || {}),
    canManage: allClients && !isReadOnlyRole(user.role) && !user.isCustomReadOnly
  }
})
