import { hasScopedCanvas, SCOPED_DISSECTION_EXCLUSION } from '#shared/bannerScopedCanvas'
import { queryOneFresh, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { deleteBannerFile } from '~~/server/utils/bannerStorage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Export ID is required' })
  }

  try {
    const exportRow = await queryOneFresh('SELECT id, r2_key, url FROM banner_exports WHERE id = $1', [id])
    if (!exportRow) {
      throw createError({ statusCode: 404, statusMessage: 'Export not found' })
    }

    if (hasScopedCanvas(exportRow)) throw createError({ statusCode: 409, statusMessage: SCOPED_DISSECTION_EXCLUSION })
    await deleteBannerFile(exportRow.r2_key)
    await execute('DELETE FROM banner_exports WHERE id = $1', [id])

    return { success: true, message: 'Export deleted' }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete banner export:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete banner export' })
  }
})
