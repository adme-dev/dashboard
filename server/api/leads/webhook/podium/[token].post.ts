import { queryOne } from '~~/server/utils/db'
import {
  loadLead,
  logIngestionError,
  upsertFormMetadata
} from '~~/server/utils/leads/db'
import { leadIntakeService } from '~~/server/utils/leads/intake'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { allowRequest } from '~~/server/utils/leads/rateLimit'
import { enqueueLeadJob } from '~~/server/utils/leads/queue'
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'
import {
  normalizePodiumWebhookEvent,
  verifyPodiumWebhookSignature
} from '~~/server/utils/leads/providers/podium'
import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'
import { runAfterResponse } from '~~/server/utils/asyncBackground'

interface PodiumEndpointRow {
  id: string
  client_id: string
  secret_key: string
  secret_key_previous: string | null
  secret_key_grace_until: string | null
}

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024

function diagnosticHeaders(event: Parameters<typeof getRequestHeaders>[0]): Record<string, string> {
  const headers = getRequestHeaders(event)
  const result: Record<string, string> = {}
  for (const key of ['content-type', 'user-agent', 'cf-ray']) {
    const value = headers[key]
    if (typeof value === 'string') result[key] = value.slice(0, 512)
  }
  return result
}

function redactedMetadataFields(fields: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  const sensitiveKey = /(^|_)(name|email|phone|mobile|message)(_|$)/
  for (const [key, value] of Object.entries(fields)) {
    result[key] = sensitiveKey.test(key) ? '[redacted]' : value
  }
  return result
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'token_required' })

  const rl = allowRequest(`podium:${token}`, 200, 60_000)
  if (!rl.allowed) {
    setResponseHeader(event, 'Retry-After', Math.ceil((rl.retry_after_ms ?? 60_000) / 1000))
    throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
  }

  const endpoint = await queryOne<PodiumEndpointRow>(
    `SELECT id, client_id, secret_key, secret_key_previous, secret_key_grace_until
       FROM lead_webhook_endpoints
      WHERE url_token = $1
        AND source = 'podium'
      LIMIT 1`,
    [token]
  )
  if (!endpoint) throw createError({ statusCode: 404, statusMessage: 'unknown_token' })

  const contentLength = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'payload_too_large' })
  }

  const rawBody = await readRawBody(event, 'utf8')
  if (rawBody && Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'payload_too_large' })
  }
  const timestamp = getHeader(event, 'podium-timestamp')
  const signature = getHeader(event, 'podium-signature')
  const validCurrent = Boolean(rawBody) && verifyPodiumWebhookSignature({
    rawBody: rawBody as string,
    timestamp,
    signature,
    secret: endpoint.secret_key
  })
  const previousInGrace = Boolean(
    endpoint.secret_key_previous
    && endpoint.secret_key_grace_until
    && new Date(endpoint.secret_key_grace_until).getTime() > Date.now()
  )
  const validPrevious = Boolean(rawBody && previousInGrace) && verifyPodiumWebhookSignature({
    rawBody: rawBody as string,
    timestamp,
    signature,
    secret: endpoint.secret_key_previous as string
  })
  if (!validCurrent && !validPrevious) {
    throw createError({ statusCode: 401, statusMessage: 'invalid_signature' })
  }

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(rawBody as string)
  } catch {
    await logIngestionError(
      'webhook',
      { provider: 'podium', payload_type: 'invalid_json' },
      diagnosticHeaders(event),
      'invalid_podium_payload'
    )
    return { ok: true, skipped: true, reason: 'invalid_payload' }
  }

  const normalized = normalizePodiumWebhookEvent(parsedBody)
  if (normalized.status === 'ignored') {
    return { ok: true, skipped: true, reason: normalized.reason }
  }
  if (normalized.status === 'invalid') {
    await logIngestionError(
      'webhook',
      { provider: 'podium', reason: normalized.reason },
      diagnosticHeaders(event),
      'invalid_podium_payload'
    )
    return { ok: true, skipped: true, reason: 'invalid_payload' }
  }

  const webchatOrigin = new URL(normalized.lead.webchatUrl).origin
  const enabledSite = await queryOne<{ id: string }>(
    `SELECT id
       FROM tracking_sites
      WHERE client_id = $1
        AND is_active = TRUE
        AND $2 = ANY(allowed_origins)
        AND COALESCE((provider_tracking->'podium'->>'confirmedLeads')::boolean, FALSE) = TRUE
      LIMIT 1`,
    [endpoint.client_id, webchatOrigin]
  )
  if (!enabledSite) {
    return { ok: true, skipped: true, reason: 'provider_disabled' }
  }

  try {
    const lead = normalized.lead
    const assignedTo = await resolveAssignedAm(endpoint.client_id)
    const intake = await leadIntakeService.ingest({
      lead: {
        client_id: endpoint.client_id,
        source: 'webhook',
        source_lead_id: lead.sourceLeadId,
        form_id: lead.formId,
        form_name: lead.formName,
        ad_id: null,
        ad_name: null,
        campaign_id: null,
        campaign_name: null,
        page_id: null,
        submitted_at: lead.submittedAt,
        field_data: lead.fieldData,
        attribution: lead.attribution,
        assigned_to: assignedTo,
        created_by: null,
        is_test: false
      },
      consentDecision: 'unknown'
    })

    if (intake.status === 'duplicate') {
      return { ok: true, skipped: true, reason: 'duplicate' }
    }

    await upsertFormMetadata(
      'webhook',
      lead.formId,
      lead.formName,
      redactedMetadataFields(lead.fieldData)
    )

    await enqueueLeadJob({
      type: 'rules.evaluate',
      payload: { lead_id: intake.leadId }
    })
    if (process.env.CRM_LEAD_PROMOTION_ENABLED === 'true') {
      await enqueueLeadJob({
        type: 'crm.promote',
        payload: { lead_id: intake.leadId }
      })
    }

    // Podium times webhook responses out after five seconds. Conversion
    // publishing and notifications are post-commit side effects, so keep them
    // alive with the Cloudflare execution context without delaying the ack.
    runAfterResponse(event, (async () => {
      if (
        intake.outbox.status !== 'profile_not_found'
        && intake.outbox.event.outboxStatus === 'pending'
      ) {
        await conversionOutboxPublisher.publishEvent(event, intake.outbox.event.eventId)
      }
      const fresh = await loadLead(intake.leadId)
      if (fresh) await notifyOnNewLead(fresh)
    })(), 'podium-lead-post-commit')

    return { ok: true, lead_id: intake.leadId }
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : 'unknown'
    await logIngestionError(
      'webhook',
      { provider: 'podium', event_id: normalized.lead.sourceLeadId },
      diagnosticHeaders(event),
      `podium_processing_failed:${errorClass}`
    )
    throw createError({ statusCode: 500, statusMessage: 'processing_failed' })
  }
})
