// server/api/client-portal/crm/communications/index.post.ts — log a manual comm (session-scoped).
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { createComm } from '~~/server/utils/crm/commsDb'

const Body = z.object({
  person_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  channel: z.enum(['email', 'call', 'sms', 'meeting', 'note']),
  direction: z.enum(['inbound', 'outbound']).nullable().optional(),
  subject: z.string().max(300).nullable().optional(),
  body: z.string().nullable().optional(),
  occurred_at: z.string().datetime().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  if (!b.person_id && !b.company_id) throw createError({ statusCode: 400, statusMessage: 'A person or company is required' })
  const row = await createComm({
    clientId: client.clientId, personId: b.person_id, companyId: b.company_id,
    channel: b.channel, direction: b.direction, subject: b.subject, body: b.body,
    occurredAt: b.occurred_at, source: 'manual', createdBy: client.id,
  })
  return { item: row }
})
