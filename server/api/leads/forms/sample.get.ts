// GET /api/leads/forms/sample?source=...&form_id=...
//
// Returns the fields known for a given form (from lead_form_metadata, populated
// as leads arrive) plus a fixed set of universal lead fields. Used by the
// destination editor's field picker so marketers can click to insert tokens.

import { queryOne } from '~~/server/utils/db'
import { z } from 'zod'

const QuerySchema = z.object({
  source: z.string().min(1).max(20),
  form_id: z.string().min(1),
})

interface FieldEntry {
  key: string
  sample_value?: string
  first_seen_at?: string
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const parsed = QuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_query' })
  }
  const { source, form_id } = parsed.data

  const meta = await queryOne<{ form_name: string | null; fields: FieldEntry[] }>(
    `SELECT form_name, fields FROM lead_form_metadata WHERE source = $1 AND form_id = $2`,
    [source, form_id],
  )

  const formFields = (meta?.fields ?? []).map((f) => ({
    token: `{{ field.${f.key} }}`,
    label: f.key,
    sample: f.sample_value ?? '',
    group: 'form' as const,
  }))

  // Universal tokens — always available regardless of which fields a form has.
  const universal = [
    { token: '{{ source }}', label: 'Lead source', sample: source, group: 'lead' as const },
    { token: '{{ form_id }}', label: 'Form ID', sample: form_id, group: 'lead' as const },
    { token: '{{ form_name }}', label: 'Form name', sample: meta?.form_name ?? '', group: 'lead' as const },
    { token: '{{ submitted_at }}', label: 'Submitted at', sample: '2026-05-01T00:55:07Z', group: 'lead' as const },
    { token: '{{ id }}', label: 'Lead ID', sample: 'uuid', group: 'lead' as const },
    { token: '{{ attribution.utm_source }}', label: 'UTM source', sample: 'google', group: 'attribution' as const },
    { token: '{{ attribution.utm_campaign }}', label: 'UTM campaign', sample: '', group: 'attribution' as const },
    { token: '{{ attribution.gclid }}', label: 'GCLID', sample: '', group: 'attribution' as const },
    { token: '{{ attribution.fbclid }}', label: 'FBCLID', sample: '', group: 'attribution' as const },
  ]

  return {
    form_name: meta?.form_name ?? null,
    has_metadata: Boolean(meta),
    fields: [...formFields, ...universal],
  }
})
