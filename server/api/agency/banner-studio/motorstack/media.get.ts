import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { mediaBinding, mediaCatalog, mediaQuerySchema } from '~~/server/utils/banner/motorstackMedia'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const query = mediaQuerySchema.safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'A valid brand and optional model are required' })
  return await mediaCatalog(mediaBinding(event), query.data)
})
