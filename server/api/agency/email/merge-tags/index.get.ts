import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { listMergeDefinitions } from '~~/server/utils/email-marketing/mergeTagDefinitions'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const parsed = z.string().uuid().safeParse(getQuery(event).client_id)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'client_id_required' })
  await assertEmailClientAccess(event, user, parsed.data)
  return { items: await listMergeDefinitions(parsed.data) }
})
