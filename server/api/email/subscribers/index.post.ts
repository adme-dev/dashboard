// server/api/email/subscribers/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { isAgencyEmailUser, resolveEmailWriteClientId } from '~~/server/utils/email-marketing/access'
import { upsertSubscriber, addToList, getListClientIds } from '~~/server/utils/email-marketing/db'
import { normalizeSubscriberEmail, isValidEmail } from '~~/server/utils/email-marketing/email'

const Body = z.object({
  email: z.string().min(1),
  name: z.string().max(200).optional().nullable(),
  attribs: z.record(z.string(), z.any()).optional(),
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
  const listIds = Array.from(new Set(input.list_ids ?? []))
  const listClients = await getListClientIds(listIds)
  if (listClients.length !== listIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'list_not_found' })
  }

  let requestedClientId = input.client_id ?? null
  if (!isAgencyEmailUser(user) && listClients.length) {
    const targetClientIds = Array.from(new Set(listClients.map(list => list.client_id)))
    const targetClientId = targetClientIds.length === 1 ? targetClientIds[0] : null
    if (!targetClientId || (requestedClientId && requestedClientId !== targetClientId)) {
      throw createError({ statusCode: 403, statusMessage: 'email_list_client_mismatch' })
    }
    requestedClientId = targetClientId
  }
  const clientId = await resolveEmailWriteClientId(event, user, requestedClientId)

  const id = await upsertSubscriber({
    email: normalizeSubscriberEmail(input.email),
    name: input.name ?? null,
    attribs: input.attribs ?? {},
    client_id: clientId,
    created_by: user.id
  })
  for (const listId of listIds) {
    await addToList(id, listId, 'manual')
  }
  return { ok: true, subscriber_id: id }
})
