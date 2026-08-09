// server/api/crm/communications/index.post.ts — log a manual communication.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { createComm } from '~~/server/utils/crm/commsDb'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  person_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  channel: z.enum(['email', 'call', 'sms', 'meeting', 'note']),
  direction: z.enum(['inbound', 'outbound']).nullable().optional(),
  subject: z.string().max(300).nullable().optional(),
  body: z.string().nullable().optional(),
  occurred_at: z.string().datetime().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  if (!b.person_id && !b.company_id) throw createError({ statusCode: 400, statusMessage: 'A person or company is required' })
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const row = await createComm({
    context, clientId: context.clientId, personId: b.person_id, companyId: b.company_id,
    channel: b.channel, direction: b.direction, subject: b.subject, body: b.body,
    occurredAt: b.occurred_at, source: 'manual', createdBy: context.actorId,
  })
  return { item: row }
})
