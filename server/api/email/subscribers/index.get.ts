// server/api/email/subscribers/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listSubscribers } from '~~/server/utils/email-marketing/db'

const Query = z.object({
  list_id: z.string().uuid().optional(),
  status: z.enum(['enabled', 'disabled', 'blocklisted']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50)
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  return listSubscribers({
    listId: q.list_id,
    status: q.status,
    q: q.q,
    page: q.page,
    pageSize: q.page_size
  })
})
