// server/api/leads/index.post.ts
// Manual lead entry — agency-side endpoint for phone/walk-in leads.

import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { insertLeadWithDedup, loadLead } from '~~/server/utils/leads/db'
import { normalizeManualPayload } from '~~/server/utils/leads/normalizer'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'

const Body = z.object({
  client_id: z.string().uuid(),
  field_data: z.record(z.string()),
  form_name: z.string().optional().nullable(),
  notes: z.string().optional(),
  run_rules: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  const norm = normalizeManualPayload({
    client_id: parsed.data.client_id,
    field_data: parsed.data.field_data,
    form_name: parsed.data.form_name ?? null,
    created_by: user.id,
  })
  norm.assigned_to = await resolveAssignedAm(parsed.data.client_id)
  const id = await insertLeadWithDedup(norm)
  if (id) {
    const fresh = await loadLead(id)
    if (fresh) await notifyOnNewLead(fresh)
  }
  return { ok: true, lead_id: id }
})
