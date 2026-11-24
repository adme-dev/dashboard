import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { hasAllBannerClientAccess, hasBannerClientPermission } from '~~/server/utils/banner/clientAccess'
import { resolveBannerFolderId } from '~~/server/utils/banner/folders'
import { queryOneFresh } from '~~/server/utils/db'

export default defineEventHandler(async event => {
  const user = await requireAuth(event)
  if (!await hasAllBannerClientAccess(user) && !hasBannerClientPermission(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to the banner library' })
  }
  const id = await resolveBannerFolderId(getRouterParam(event, 'id'))
  const { pinned } = await readValidatedBody(event, z.object({ pinned: z.boolean() }).parse)
  const saved = await queryOneFresh(`UPDATE team_members
    SET dashboard_preferences = jsonb_set(coalesce(dashboard_preferences, '{}'), '{bannerFolderPins}',
      CASE WHEN $3::boolean THEN coalesce(dashboard_preferences->'bannerFolderPins', '{}') || jsonb_build_object($2::text, true)
      ELSE coalesce(dashboard_preferences->'bannerFolderPins', '{}') - $2::text END)
    WHERE id = $1 RETURNING id`, [user.id, id, pinned])
  if (!saved) throw createError({ statusCode: 404, statusMessage: 'User preferences unavailable' })
  return { id, pinned }
})
