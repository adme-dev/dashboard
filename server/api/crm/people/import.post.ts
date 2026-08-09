// server/api/crm/people/import.post.ts
// Accepts { client_id, csv } and bulk-creates people. Maps common headers; idempotent on email.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { importPeopleCsv } from '~~/server/utils/crm/csv'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({ client_id: z.string().uuid(), csv: z.string().min(1) })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const { client_id, csv } = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  return await importPeopleCsv(context, csv)
})
