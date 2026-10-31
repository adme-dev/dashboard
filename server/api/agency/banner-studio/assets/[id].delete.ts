import { transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { deleteBannerFile } from '~~/server/utils/bannerStorage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Asset ID is required' })
  const key = await transaction(async (db) => {
    const result = await db.query<{ r2_key: string, tags: string[] | null }>('SELECT id, r2_key, tags FROM banner_assets WHERE id = $1 FOR UPDATE', [id])
    const asset = result.rows[0]
    if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
    if (asset.tags?.includes('font')) throw createError({ statusCode: 409, statusMessage: 'Manage this font through the font library so its references are checked' })
    await db.query('DELETE FROM banner_assets WHERE id = $1', [id])
    return asset.r2_key
  })
  await deleteBannerFile(key)
  return { success: true, message: 'Asset deleted' }
})
