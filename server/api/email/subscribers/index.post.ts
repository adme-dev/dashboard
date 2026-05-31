// server/api/email/subscribers/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { upsertSubscriber, addToList } from '~~/server/utils/email-marketing/db'
import { normalizeEmail, isValidEmail } from '~~/server/utils/email-marketing/email'

const Body = z.object({
  email: z.string().min(1),
  name: z.string().max(200).optional().nullable(),
  attribs: z.record(z.any()).optional(),
  client_id: z.string().uuid().optional().nullable(),
  list_ids: z.array(z.string().uuid()).optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const input = parsed.data
  if (!isValidEmail(input.email)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email' })
  }
  const id = await upsertSubscriber({
    email: normalizeEmail(input.email),
    name: input.name ?? null,
    attribs: input.attribs ?? {},
    client_id: input.client_id ?? null,
    created_by: user.id
  })
  for (const listId of input.list_ids ?? []) {
    await addToList(id, listId, 'manual')
  }
  return { ok: true, subscriber_id: id }
})
