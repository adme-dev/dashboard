// server/api/client-portal/crm/custom-fields/index.post.ts — session-scoped (clients manage their own fields).
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  object_type: z.enum(['person', 'company']),
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  field_type: z.enum(['text', 'number', 'currency', 'date', 'status', 'dropdown', 'checkbox', 'rating', 'link', 'email', 'phone', 'location', 'tags']),
  options: z.array(z.string()).optional().default([]),
  position: z.coerce.number().int().optional().default(0),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const row = await queryOne(
    `INSERT INTO crm_custom_fields (client_id, object_type, key, label, field_type, options, position)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     ON CONFLICT (client_id, object_type, key)
       DO UPDATE SET label = EXCLUDED.label, field_type = EXCLUDED.field_type, options = EXCLUDED.options, position = EXCLUDED.position
     RETURNING *`,
    [client.clientId, b.object_type, b.key, b.label, b.field_type, JSON.stringify(b.options), b.position],
  )
  return { item: row }
})
