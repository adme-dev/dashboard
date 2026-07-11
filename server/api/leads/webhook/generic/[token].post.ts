// POST /api/leads/webhook/generic/[token]
//
// Source-agnostic inbound webhook. Any system that can POST JSON (Zapier,
// Make, n8n, custom code, mobile apps, partner forms) can push leads through
// without faking the Google-specific user_column_data schema.
//
// Auth: same per-client url_token + secret_key model used by the Google
// webhook. Body accepts:
//
//   {
//     "key": "<secret_key>",                       (required)
//     "lead_id": "...",                             (optional, used for dedup)
//     "form_id": "...",                             (optional)
//     "form_name": "...",                           (optional)
//     "source": "webhook"|"meta"|"manual"|"csv",   (optional, default 'webhook')
//     "fields": { "full_name": "...", ... },       (required, snake_case keys)
//     "attribution": { "utm_source": "...", ... }, (optional)
//     "submitted_at": "2026-05-01T12:34:56Z"       (optional)
//   }
//
// Always returns 200 (idempotent — duplicate lead_id returns { skipped: true }).

import { queryOne } from '~~/server/utils/db'
import {
  insertLeadWithDedup, upsertFormMetadata, logIngestionError, loadLead,
} from '~~/server/utils/leads/db'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { allowRequest } from '~~/server/utils/leads/rateLimit'
import { enqueueLeadJob } from '~~/server/utils/leads/queue'
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'
import { timingSafeEqual, randomUUID } from 'node:crypto'
import { z } from 'zod'

const Body = z.object({
  key: z.string(),
  lead_id: z.string().optional(),
  form_id: z.string().optional(),
  form_name: z.string().optional(),
  source: z.enum(['webhook', 'meta', 'manual', 'csv', 'google']).default('webhook'),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  attribution: z.record(z.string(), z.string()).optional(),
  submitted_at: z.string().optional(),
})

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'token_required' })

  const rl = allowRequest(`generic:${token}`, 200, 60_000)
  if (!rl.allowed) {
    setResponseHeader(event, 'Retry-After', Math.ceil((rl.retry_after_ms ?? 60_000) / 1000))
    throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
  }

  const ep = await queryOne<{
    id: string
    client_id: string
    secret_key: string
    secret_key_previous: string | null
    secret_key_grace_until: string | null
  }>(
    `SELECT id, client_id, secret_key, secret_key_previous, secret_key_grace_until
       FROM lead_webhook_endpoints WHERE url_token = $1`,
    [token],
  )
  if (!ep) throw createError({ statusCode: 404, statusMessage: 'unknown_token' })

  const rawBody = await readBody(event).catch(() => null) as any
  const parsed = Body.safeParse(rawBody)
  if (!parsed.success) {
    await logIngestionError('webhook' as any, rawBody, getRequestHeaders(event), 'invalid_body')
    return { ok: true } // always-200
  }
  const input = parsed.data

  const submittedKey = input.key
  const matchPrimary = safeEqual(submittedKey, ep.secret_key)
  const inGrace = ep.secret_key_previous &&
    ep.secret_key_grace_until &&
    new Date(ep.secret_key_grace_until).getTime() > Date.now()
  const matchPrevious = inGrace && safeEqual(submittedKey, ep.secret_key_previous!)
  if (!matchPrimary && !matchPrevious) {
    throw createError({ statusCode: 401, statusMessage: 'invalid_key' })
  }

  // Stringify field values — schema admits primitive types but the lead schema
  // stores strings.
  const fieldData: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.fields)) {
    if (v == null || v === '') continue
    fieldData[k.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')] = String(v)
  }

  if (!Object.keys(fieldData).length) {
    await logIngestionError('webhook' as any, rawBody, getRequestHeaders(event), 'empty_fields')
    return { ok: true }
  }

  try {
    const sourceLeadId = input.lead_id || `webhook-${randomUUID()}`
    const submittedAt = input.submitted_at ? new Date(input.submitted_at).toISOString() : new Date().toISOString()
    const assignedTo = await resolveAssignedAm(ep.client_id)

    const leadId = await insertLeadWithDedup({
      client_id: ep.client_id,
      source: input.source as any,
      source_lead_id: sourceLeadId,
      form_id: input.form_id ?? null,
      form_name: input.form_name ?? null,
      ad_id: null, ad_name: null,
      campaign_id: null, campaign_name: null,
      page_id: null,
      submitted_at: submittedAt,
      field_data: fieldData,
      attribution: input.attribution ?? null,
      assigned_to: assignedTo,
      created_by: null,
      is_test: false,
    })

    if (input.form_id) {
      await upsertFormMetadata(input.source as any, input.form_id, input.form_name ?? null, fieldData)
    }
    if (!leadId) return { ok: true, skipped: true }

    await enqueueLeadJob({ type: 'rules.evaluate', payload: { lead_id: leadId } })
    const fresh = await loadLead(leadId)
    if (fresh) await notifyOnNewLead(fresh)

    return { ok: true, lead_id: leadId }
  } catch (e: any) {
    await logIngestionError('webhook' as any, rawBody, getRequestHeaders(event), e?.message ?? String(e))
    return { ok: true }
  }
})
