import { requireAuth } from '~~/server/utils/auth'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { hasAllBannerClientAccess, hasBannerClientPermission } from '~~/server/utils/banner/clientAccess'

import { clearExpiredBannerBin } from '~~/server/utils/banner/folderBin'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const allClients = await hasAllBannerClientAccess(user)
  if (!allClients && !hasBannerClientPermission(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to the banner library' })
  }
  // Shared agency folder metadata only. Project lists retain their client/owner scope.
  setHeader(event, 'Cache-Control', 'private, no-store')
  const view = getQuery(event).view
  if (view === 'library' || view === 'bin') await clearExpiredBannerBin()
  if (view === 'bin') {
    if (!allClients || isReadOnlyRole(user.role) || user.isCustomReadOnly) return []
    return queryRowsFresh(`SELECT id, name, parent_id AS "parentId", position, bin_root_id AS "rootId",
      binned_at + interval '30 days' AS "expiresAt" FROM banner_folders
      WHERE binned_at > now() - interval '30 days' ORDER BY binned_at DESC, position, name, id`)
  }
  const activeFolders = `SELECT id, name, parent_id AS "parentId", position,
    source_path AS "sourcePath" FROM banner_folders WHERE binned_at IS NULL`
  if (view !== 'library') return queryRowsFresh(`${activeFolders} ORDER BY lower(name), name, id`)
  const library = await queryOneFresh(`SELECT
    (SELECT json_agg(f ORDER BY lower(f.name), f.name, f.id) FROM (${activeFolders}) f) AS folders,
    (SELECT dashboard_preferences->'bannerFolderPins' FROM team_members WHERE id = $1) AS pins`, [user.id])
  return {
    folders: library?.folders || [],
    pinnedIds: Object.keys(library?.pins || {}),
    canManage: allClients && !isReadOnlyRole(user.role) && !user.isCustomReadOnly
  }
})
