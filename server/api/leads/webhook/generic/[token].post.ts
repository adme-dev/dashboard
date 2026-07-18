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
  upsertFormMetadata, logIngestionError, loadLead
} from '~~/server/utils/leads/db'
import { leadIntakeService } from '~~/server/utils/leads/intake'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { allowRequest } from '~~/server/utils/leads/rateLimit'
import { enqueueLeadJob } from '~~/server/utils/leads/queue'
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'
import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'
import { timingSafeEqual, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { LeadSource } from '~~/app/types'

const FieldMap = z.record(
  z.string().trim().min(1).max(128),
  z.union([z.string().max(4096), z.number(), z.boolean()])
).refine(fields => Object.keys(fields).length <= 100, 'too_many_fields')

const AttributionMap = z.record(
  z.string().trim().min(1).max(128),
  z.string().max(512)
).refine(attribution => Object.keys(attribution).length <= 30, 'too_many_attribution_fields')

const Body = z.object({
  key: z.string().min(1).max(512),
  lead_id: z.string().min(1).max(255).optional(),
  form_id: z.string().max(255).optional(),
  form_name: z.string().max(500).optional(),
  source: z.enum(['webhook', 'meta', 'manual', 'csv', 'google']).default('webhook'),
  fields: FieldMap,
  attribution: AttributionMap.optional(),
  consent_decision: z.enum(['granted', 'denied', 'unknown']).default('unknown'),
  submitted_at: z.string().datetime({ offset: true }).optional(),
  is_test: z.boolean().default(false)
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
    source: string
    secret_key: string
    secret_key_previous: string | null
    secret_key_grace_until: string | null
  }>(
    `SELECT id, client_id, source, secret_key, secret_key_previous, secret_key_grace_until
       FROM lead_webhook_endpoints WHERE url_token = $1`,
    [token]
  )
  if (!ep) throw createError({ statusCode: 404, statusMessage: 'unknown_token' })

  const rawBody: unknown = await readBody(event).catch(() => null)
  const parsed = Body.safeParse(rawBody)
  if (!parsed.success) {
    await logIngestionError('webhook', rawBody, getRequestHeaders(event), 'invalid_body')
    return { ok: true } // always-200
  }
  const input = parsed.data
  const trustedSource: LeadSource = ep.source === 'webhook' ? 'webhook' : input.source

  const submittedKey = input.key
  const matchPrimary = safeEqual(submittedKey, ep.secret_key)
  const inGrace = Boolean(
    ep.secret_key_previous
    && ep.secret_key_grace_until
    && new Date(ep.secret_key_grace_until).getTime() > Date.now()
  )
  const matchPrevious = inGrace && safeEqual(submittedKey, ep.secret_key_previous as string)
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
    await logIngestionError('webhook', rawBody, getRequestHeaders(event), 'empty_fields')
    return { ok: true }
  }

  try {
    const sourceLeadId = input.lead_id || `webhook-${randomUUID()}`
    const submittedAt = input.submitted_at ? new Date(input.submitted_at).toISOString() : new Date().toISOString()
    const assignedTo = await resolveAssignedAm(ep.client_id)

    const intake = await leadIntakeService.ingest({
      lead: {
        client_id: ep.client_id,
        source: trustedSource,
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
        is_test: input.is_test
      },
      consentDecision: input.consent_decision
    })

    if (input.form_id) {
      await upsertFormMetadata(trustedSource, input.form_id, input.form_name ?? null, fieldData)
    }
    if (intake.status === 'duplicate') return { ok: true, skipped: true }
    const leadId = intake.leadId

    if (
      intake.outbox.status !== 'profile_not_found'
      && intake.outbox.event.outboxStatus === 'pending'
    ) {
      try {
        await conversionOutboxPublisher.publishEvent(event, intake.outbox.event.eventId)
      } catch (error) {
        console.warn({
          event: 'measurement_outbox_post_commit_publish_failed',
          clientId: ep.client_id,
          eventId: intake.outbox.event.eventId,
          errorClass: error instanceof Error ? error.name : 'unknown'
        })
      }
    }

    await enqueueLeadJob({ type: 'rules.evaluate', payload: { lead_id: leadId } })
    const fresh = await loadLead(leadId)
    if (fresh) await notifyOnNewLead(fresh)

    return { ok: true, lead_id: leadId }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    await logIngestionError('webhook', rawBody, getRequestHeaders(event), message)
    return { ok: true }
  }
})
