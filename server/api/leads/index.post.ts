// server/api/leads/index.post.ts
// Manual lead entry — agency-side endpoint for phone/walk-in leads.

import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { normalizeManualPayload } from '~~/server/utils/leads/normalizer'
import {
  acceptLead,
  resolveLeadCaptureMode
} from '~~/server/utils/leads/acceptance'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'

const Body = z.object({
  client_id: z.string().uuid(),
  field_data: z.record(z.string(), z.string()),
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
  const accepted = await acceptLead(event, {
    lead: { ...norm, client_id: parsed.data.client_id },
    leadCaptureMode: await resolveLeadCaptureMode(parsed.data.client_id),
    consentDecision: 'unknown',
    runRules: parsed.data.run_rules
  })
  return {
    ok: true,
    lead_id: accepted.status === 'created' ? accepted.leadId : null,
    skipped: accepted.status !== 'created' ? accepted.status : undefined
  }
})
