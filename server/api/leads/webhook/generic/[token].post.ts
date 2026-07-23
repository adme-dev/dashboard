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
//     "customer": { "full_name": "...", "email": "...", "mobile": "..." },
//     "vehicle": { "stock_number": "...", "make": "...", "model": "..." },
//     "fields": { "preferred_contact_time": "..." }, (optional extension fields)
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
import {
  DealerLeadWebhookBodySchema,
  normalizeDealerLeadWebhookBody
} from '~~/server/utils/leads/dealerLeadAdapter'
import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'
import { timingSafeEqual, randomUUID } from 'node:crypto'
import type { LeadSource } from '~~/app/types'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function ingestionDiagnostic(rawBody: unknown): Record<string, unknown> {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { payload_type: rawBody === null ? 'null' : typeof rawBody }
  }
  const body = rawBody as Record<string, unknown>
  const provider = typeof body.provider === 'string'
    && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(body.provider)
    ? body.provider.slice(0, 100)
    : undefined
  return {
    payload_type: 'object',
    schema_version: typeof body.schema_version === 'number' ? body.schema_version : undefined,
    provider,
    has_customer: Boolean(body.customer),
    has_vehicle: Boolean(body.vehicle),
    has_fields: Boolean(body.fields)
  }
}

function ingestionDiagnosticHeaders(event: Parameters<typeof getRequestHeaders>[0]): Record<string, string> {
  const headers = getRequestHeaders(event)
  const result: Record<string, string> = {}
  for (const key of ['content-type', 'user-agent', 'cf-ray']) {
    const value = headers[key]
    if (typeof value === 'string') result[key] = value.slice(0, 512)
  }
  return result
}

function formMetadataFields(fieldData: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  const sensitiveKey = /(^|_)(name|email|phone|mobile|address|postcode)(_|$)/
  for (const [key, value] of Object.entries(fieldData)) {
    result[key] = sensitiveKey.test(key) ? '[redacted]' : value
  }
  return result
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
  const parsed = DealerLeadWebhookBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    await logIngestionError(
      'webhook',
      ingestionDiagnostic(rawBody),
      ingestionDiagnosticHeaders(event),
      'invalid_body'
    )
    return { ok: true } // always-200
  }
  const input = normalizeDealerLeadWebhookBody(parsed.data)
  const trustedSource: LeadSource = ep.source === 'webhook' ? 'webhook' : input.requestedSource

  const submittedKey = input.submittedKey
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

  const fieldData = input.fieldData

  if (!Object.keys(fieldData).some(key => key !== 'lead_provider')) {
    await logIngestionError(
      'webhook',
      ingestionDiagnostic(rawBody),
      ingestionDiagnosticHeaders(event),
      'empty_fields'
    )
    return { ok: true }
  }

  try {
    const sourceLeadId = input.sourceLeadId || `webhook-${randomUUID()}`
    const submittedAt = input.submittedAt ? new Date(input.submittedAt).toISOString() : new Date().toISOString()
    const assignedTo = await resolveAssignedAm(ep.client_id)

    const intake = await leadIntakeService.ingest({
      lead: {
        client_id: ep.client_id,
        source: trustedSource,
        source_lead_id: sourceLeadId,
        form_id: input.formId,
        form_name: input.formName,
        ad_id: null, ad_name: null,
        campaign_id: null, campaign_name: null,
        page_id: null,
        submitted_at: submittedAt,
        field_data: fieldData,
        attribution: input.attribution,
        assigned_to: assignedTo,
        created_by: null,
        is_test: input.isTest
      },
      consentDecision: input.consentDecision
    })

    if (input.formId) {
      await upsertFormMetadata(
        trustedSource,
        input.formId,
        input.formName,
        formMetadataFields(fieldData)
      )
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
    if (process.env.CRM_LEAD_PROMOTION_ENABLED === 'true' && input.promoteToCrm) {
      await enqueueLeadJob({ type: 'crm.promote', payload: { lead_id: leadId } })
    }
    const fresh = await loadLead(leadId)
    if (fresh) await notifyOnNewLead(fresh)

    return { ok: true, lead_id: leadId }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    await logIngestionError(
      'webhook',
      ingestionDiagnostic(rawBody),
      ingestionDiagnosticHeaders(event),
      message
    )
    return { ok: true }
  }
})
