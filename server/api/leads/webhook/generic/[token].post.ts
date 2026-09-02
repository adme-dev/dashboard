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
  upsertFormMetadata, logIngestionError
} from '~~/server/utils/leads/db'
import { acceptLead } from '~~/server/utils/leads/acceptance'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { allowRequest } from '~~/server/utils/leads/rateLimit'
import {
  classifyLegacyDealerLeadConversion,
  DealerLeadWebhookBodySchema,
  normalizeDealerLeadWebhookBody
} from '~~/server/utils/leads/dealerLeadAdapter'
import {
  isWebsiteOriginAllowed,
  normaliseWebsiteOrigin,
  setWebsiteCorsHeaders
} from '~~/server/utils/leads/websiteCors'
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

function optionalAttribution(
  attribution: Record<string, string> | null,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = attribution?.[key]?.trim()
    if (value) return value
  }
  return null
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
    allowed_origins: string[]
    lead_capture_mode: 'analytics_only' | 'capture_only' | 'lightweight_crm' | 'full_crm' | 'external_crm' | null
  }>(
    `SELECT endpoint.id, endpoint.client_id, endpoint.source, endpoint.secret_key,
            endpoint.secret_key_previous, endpoint.secret_key_grace_until,
            client.lead_capture_mode,
            ARRAY(
              SELECT DISTINCT approved_origin
                FROM tracking_sites site
                CROSS JOIN LATERAL UNNEST(site.allowed_origins) AS approved_origin
               WHERE site.client_id = endpoint.client_id
                 AND site.is_active = TRUE
            ) AS allowed_origins
       FROM lead_webhook_endpoints endpoint
       JOIN agency_clients client ON client.id = endpoint.client_id
      WHERE endpoint.url_token = $1`,
    [token]
  )
  if (!ep) throw createError({ statusCode: 404, statusMessage: 'unknown_token' })

  const requestOriginHeader = getHeader(event, 'origin')
  if (requestOriginHeader) {
    const requestOrigin = normaliseWebsiteOrigin(requestOriginHeader)
    if (!isWebsiteOriginAllowed(ep.allowed_origins, requestOrigin)) {
      throw createError({ statusCode: 403, statusMessage: 'origin_not_allowed' })
    }
    setWebsiteCorsHeaders(event, requestOrigin)
  }

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
  const conversion = classifyLegacyDealerLeadConversion(input)
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

  if (ep.lead_capture_mode === 'analytics_only') {
    return { ok: true, skipped: true, reason: 'analytics_only' }
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

    const intake = await acceptLead(event, {
      lead: {
        client_id: ep.client_id,
        source: trustedSource,
        source_lead_id: sourceLeadId,
        form_id: input.formId,
        form_name: input.formName,
        ad_id: optionalAttribution(input.attribution, 'ad_id'),
        ad_name: optionalAttribution(input.attribution, 'ad_name'),
        campaign_id: optionalAttribution(input.attribution, 'campaign_id', 'utm_id'),
        campaign_name: optionalAttribution(input.attribution, 'campaign_name', 'utm_campaign'),
        page_id: optionalAttribution(input.attribution, 'page_id'),
        submitted_at: submittedAt,
        field_data: fieldData,
        attribution: input.attribution,
        assigned_to: assignedTo,
        created_by: null,
        is_test: input.isTest
      },
      consentDecision: input.consentDecision,
      leadCaptureMode: ep.lead_capture_mode ?? 'capture_only',
      ...(conversion.status === 'not_dealer_studio'
        ? {}
        : {
            conversionEventName: conversion.canonicalEventName,
            enquiryType: conversion.enquiryType
          })
    })

    if (input.formId) {
      await upsertFormMetadata(
        trustedSource,
        input.formId,
        input.formName,
        formMetadataFields(fieldData)
      )
    }
    if (intake.status !== 'created') {
      return { ok: true, skipped: true, reason: intake.status }
    }

    return { ok: true, lead_id: intake.leadId }
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
