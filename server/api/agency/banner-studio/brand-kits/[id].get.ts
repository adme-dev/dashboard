import { requireBrandKitReadAccess } from '~~/server/utils/banner/brandKitAccess'
import { requireAuth } from '~~/server/utils/auth'
import { getBrandKit } from '~~/server/utils/banner/brandKits'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const kit = await getBrandKit(id)
  if (!kit) throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
  await requireBrandKitReadAccess(event, kit.clientId)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return kit
})
