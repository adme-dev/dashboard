// server/api/email/lists/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { resolveEmailWriteClientId } from '~~/server/utils/email-marketing/access'
import { createList } from '~~/server/utils/email-marketing/db'

const Body = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  double_optin: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const clientId = await resolveEmailWriteClientId(event, user, parsed.data.client_id ?? null)
  const list = await createList({ ...parsed.data, client_id: clientId, created_by: user.id })
  return { list }
})
