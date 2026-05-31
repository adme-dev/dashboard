// server/api/email/subscribers/import.post.ts
// Bulk-import subscribers from raw CSV text, upsert them, and add them to a
// target list. Reuses the pure parseSubscriberCsv mapping (unit-tested).

import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { parseSubscriberCsv } from '~~/server/utils/email-marketing/importParse'
import { upsertSubscriber, addToList, getList } from '~~/server/utils/email-marketing/db'

const Body = z.object({
  list_id: z.string().uuid(),
  csv: z.string().min(1),
  client_id: z.string().uuid().optional().nullable(),
  column_mapping: z.record(z.string()).optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const input = parsed.data

  const list = await getList(input.list_id)
  if (!list) throw createError({ statusCode: 404, statusMessage: 'list_not_found' })

  const { subscribers, errors } = parseSubscriberCsv(input.csv, input.column_mapping)
  if (!subscribers.length && errors.length === 1 && errors[0].row === 0) {
    // Structural error (empty_csv / no_email_column) — surface as 400.
    throw createError({ statusCode: 400, statusMessage: errors[0].message })
  }

  let imported = 0
  for (const s of subscribers) {
    const id = await upsertSubscriber({
      email: s.email,
      name: s.name ?? null,
      attribs: s.attribs ?? {},
      client_id: input.client_id ?? null,
      created_by: user.id
    })
    await addToList(id, input.list_id, 'import')
    imported++
  }

  return { imported, skipped: errors.length, errors }
})
