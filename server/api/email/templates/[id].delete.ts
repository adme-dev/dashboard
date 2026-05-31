// server/api/email/templates/[id].delete.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { deleteTemplate } from '~~/server/utils/email-marketing/templates'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  await deleteTemplate(id)
  return { ok: true }
})
