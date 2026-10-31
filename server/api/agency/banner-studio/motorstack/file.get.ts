import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { mediaBinding, readMedia, mediaSelectionSchema } from '~~/server/utils/banner/motorstackMedia'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const input = mediaSelectionSchema.safeParse(getQuery(event))
  if (!input.success) throw createError({ statusCode: 400, statusMessage: 'A valid MotorStack media selection is required' })
  const file = await readMedia(mediaBinding(event), input.data)
  setHeaders(event, { 'Content-Type': file.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox; default-src \'none\'', 'Content-Disposition': `${file.mimeType === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.filename)}` })
  return file.bytes
})
