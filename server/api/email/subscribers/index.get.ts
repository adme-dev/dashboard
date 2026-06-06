// server/api/email/subscribers/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { assertEmailClientAccess, resolveEmailClientScope } from '~~/server/utils/email-marketing/access'
import { getList, listSubscribers } from '~~/server/utils/email-marketing/db'

const Query = z.object({
  list_id: z.string().uuid().optional(),
  status: z.enum(['enabled', 'disabled', 'blocklisted']).optional(),
  deliverability: z.enum(['mailable', 'soft_bounced', 'suppressed']).optional(),
  q: z.preprocess((value) => {
    if (typeof value !== 'string') return value
    return value.trim() || undefined
  }, z.string().optional()),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50)
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const clientIds = await resolveEmailClientScope(event, user)
  if (q.list_id) {
    const list = await getList(q.list_id)
    if (!list) throw createError({ statusCode: 404, statusMessage: 'list_not_found' })
    await assertEmailClientAccess(event, user, list.client_id)
  }
  return listSubscribers({
    listId: q.list_id,
    status: q.status,
    deliverability: q.deliverability,
    q: q.q,
    page: q.page,
    pageSize: q.page_size,
    clientIds
  })
})
