// server/api/email/subscribers/[id].delete.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { deleteSubscriber } from '~~/server/utils/email-marketing/db'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  await deleteSubscriber(id)
  return { ok: true }
})
