// server/api/email/lists/[id].delete.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { archiveList } from '~~/server/utils/email-marketing/db'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  await archiveList(id)
  return { ok: true }
})
