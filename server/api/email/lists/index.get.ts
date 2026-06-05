// server/api/email/lists/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { resolveEmailClientScope } from '~~/server/utils/email-marketing/access'
import { listLists } from '~~/server/utils/email-marketing/db'

const Query = z.object({ include_archived: z.coerce.boolean().optional() })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const clientIds = await resolveEmailClientScope(event, user)
  const items = await listLists({ includeArchived: q.include_archived, clientIds })
  return { items }
})
