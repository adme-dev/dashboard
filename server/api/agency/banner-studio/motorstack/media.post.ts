import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { mediaBinding, importMedia, mediaSelectionSchema } from '~~/server/utils/banner/motorstackMedia'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  await requireWriteAccess(event)
  const input = mediaSelectionSchema.safeParse(await readBody(event))
  if (!input.success) throw createError({ statusCode: 400, statusMessage: 'A valid MotorStack media selection is required' })
  return await importMedia(event, mediaBinding(event), input.data, user.id)
})
