import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  source: z.enum(['meta', 'google', 'webhook', 'csv', 'email']),
  form_id: z.string().min(1),
  form_name: z.string().nullable().optional()
})

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const b = Body.parse(await readBody(event))
  const row = await queryOne<{ id: string }>(`
    INSERT INTO lead_form_rules (client_id, source, form_id, form_name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (source, form_id) DO UPDATE SET
      client_id = EXCLUDED.client_id,
      form_name = COALESCE(EXCLUDED.form_name, lead_form_rules.form_name),
      updated_at = NOW()
    RETURNING id
  `, [b.client_id, b.source, b.form_id, b.form_name ?? null])
  return { ok: true, id: row!.id }
})
