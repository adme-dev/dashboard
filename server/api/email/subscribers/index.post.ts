// server/api/email/subscribers/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
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
  const normalizedEmail = normalizeSubscriberEmail(input.email)
  const listIds = Array.from(new Set(input.list_ids ?? []))
  const listClients = await getListClientIds(listIds)
  if (listClients.length !== listIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'list_not_found' })
  }

  const agencyUser = isAgencyEmailUser(user)
  let requestedClientId = input.client_id ?? null
  if (!agencyUser && listClients.length) {
    const targetClientIds = Array.from(new Set(listClients.map(list => list.client_id)))
    const targetClientId = targetClientIds.length === 1 ? targetClientIds[0] : null
    if (!targetClientId || (requestedClientId && requestedClientId !== targetClientId)) {
      throw createError({ statusCode: 403, statusMessage: 'email_list_client_mismatch' })
    }
    requestedClientId = targetClientId
  }
  const clientId = await resolveEmailWriteClientId(event, user, requestedClientId)
  if (!agencyUser) {
    const existing = await queryOne<{ id: string, client_id: string | null }>(
      'SELECT id, client_id FROM email_subscribers WHERE email = $1',
      [normalizedEmail]
    )
    if (existing && existing.client_id !== clientId) {
      throw createError({ statusCode: 403, statusMessage: 'email_list_client_mismatch' })
    }
  }

  const id = await upsertSubscriber({
    email: normalizedEmail,
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
