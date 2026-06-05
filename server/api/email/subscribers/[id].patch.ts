// server/api/email/subscribers/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { getSubscriber, updateSubscriber } from '~~/server/utils/email-marketing/db'

const Body = z.object({
  name: z.string().max(200).optional().nullable(),
  status: z.enum(['enabled', 'disabled', 'blocklisted']).optional(),
  attribs: z.record(z.string(), z.any()).optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const existing = await getSubscriber(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, existing.client_id)
  const sub = await updateSubscriber(id, parsed.data)
  if (!sub) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { subscriber: sub }
})
