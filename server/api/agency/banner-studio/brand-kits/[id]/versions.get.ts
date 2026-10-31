import { getBrandKit } from '~~/server/utils/banner/brandKits'
import { requireBrandKitReadAccess } from '~~/server/utils/banner/brandKitAccess'
import { queryRowsFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const kit = await getBrandKit(id)
  if (!kit) throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
  await requireBrandKitReadAccess(event, kit.clientId)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return await queryRowsFresh(`
    SELECT v.id, v.brand_kit_id AS "brandKitId", v.version, v.note, v.snapshot,
           v.created_by AS "createdBy", v.created_at AS "createdAt",
           tm.name AS "createdByName"
    FROM brand_kit_versions v
    JOIN brand_kits authorized_kit ON authorized_kit.id = v.brand_kit_id
    LEFT JOIN team_members tm ON tm.id = v.created_by
    WHERE v.brand_kit_id = $1 AND authorized_kit.client_id IS NOT DISTINCT FROM $2::uuid
    ORDER BY v.version DESC
    LIMIT 50
  `, [id, kit.clientId ?? null])
})
