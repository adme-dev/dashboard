import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { transaction } from '~~/server/utils/db'
import { createError } from 'h3'

const Body = z.object({
  client_id: z.string().uuid(),
  source: z.enum(['meta', 'google', 'webhook', 'csv', 'email']),
  form_id: z.string().min(1),
  form_name: z.string().nullable().optional()
})

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const b = Body.parse(await readBody(event))
  const id = await transaction(async (db) => {
    if (b.source === 'email') {
      const endpoint = await db.query<{ id: string }>(`
        SELECT id
        FROM lead_email_endpoints
        WHERE client_id = $1
          AND form_id = $2
          AND retired_at IS NULL
        FOR SHARE
      `, [b.client_id, b.form_id])
      if (!endpoint.rows[0]) {
        throw createError({ statusCode: 400, statusMessage: 'email_endpoint_client_mismatch' })
      }

      const rule = await db.query<{ id: string }>(`
        INSERT INTO lead_form_rules (client_id, source, form_id, form_name)
        VALUES ($1, 'email', $2, $3)
        ON CONFLICT (source, form_id) DO UPDATE SET
          form_name = COALESCE(EXCLUDED.form_name, lead_form_rules.form_name),
          updated_at = NOW()
        WHERE lead_form_rules.client_id = EXCLUDED.client_id
        RETURNING id
      `, [b.client_id, b.form_id, b.form_name ?? null])
      if (!rule.rows[0]) {
        throw createError({ statusCode: 409, statusMessage: 'form_rule_client_conflict' })
      }
      return rule.rows[0].id
    }

    const rule = await db.query<{ id: string }>(`
      INSERT INTO lead_form_rules (client_id, source, form_id, form_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (source, form_id) DO UPDATE SET
        client_id = EXCLUDED.client_id,
        form_name = COALESCE(EXCLUDED.form_name, lead_form_rules.form_name),
        updated_at = NOW()
      RETURNING id
    `, [b.client_id, b.source, b.form_id, b.form_name ?? null])
    return rule.rows[0]!.id
  })
  return { ok: true, id }
})
