// server/api/leads/webhook/google/[token].post.ts
import { queryOne } from '~~/server/utils/db'
import {
  upsertFormMetadata, logIngestionError,
} from '~~/server/utils/leads/db'
import { acceptLead, type LeadCaptureMode } from '~~/server/utils/leads/acceptance'
import { normalizeGooglePayload } from '~~/server/utils/leads/normalizer'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { allowRequest } from '~~/server/utils/leads/rateLimit'
import { timingSafeEqual } from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// Structural summary only — never the raw body. The raw body carries the
// client's webhook secret (google_key) and lead PII (user_column_data), both
// of which must not land in lead_ingestion_errors.
function ingestionDiagnostic(rawBody: unknown): Record<string, unknown> {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { payload_type: rawBody === null ? 'null' : typeof rawBody }
  }
  const body = rawBody as Record<string, unknown>
  return {
    payload_type: 'object',
    lead_id: typeof body.lead_id === 'string' ? body.lead_id.slice(0, 200) : undefined,
    form_id: typeof body.form_id === 'string' ? body.form_id.slice(0, 200) : undefined,
    campaign_id: typeof body.campaign_id === 'string' ? body.campaign_id.slice(0, 200) : undefined,
    is_test: typeof body.is_test === 'boolean' ? body.is_test : undefined,
    has_user_column_data: Array.isArray(body.user_column_data),
    user_column_count: Array.isArray(body.user_column_data) ? body.user_column_data.length : undefined
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

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'token_required' })

  // Rate limit per token
  const rl = allowRequest(`google:${token}`, 200, 60_000)
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
    lead_capture_mode: LeadCaptureMode
  }>(
    `SELECT endpoint.id, endpoint.client_id, endpoint.secret_key,
            endpoint.secret_key_previous, endpoint.secret_key_grace_until,
            client.lead_capture_mode
       FROM lead_webhook_endpoints endpoint
       JOIN agency_clients client ON client.id = endpoint.client_id
      WHERE endpoint.url_token = $1`,
    [token],
  )
  if (!ep) throw createError({ statusCode: 404, statusMessage: 'unknown_token' })

  const body = await readBody(event).catch(() => null) as any
  if (!body || typeof body !== 'object') {
    await logIngestionError('google', ingestionDiagnostic(body), ingestionDiagnosticHeaders(event), 'invalid_body')
    return { ok: true } // always-200
  }

  const submittedKey = String(body.google_key ?? '')
  const matchPrimary = safeEqual(submittedKey, ep.secret_key)
  const inGrace = ep.secret_key_previous &&
    ep.secret_key_grace_until &&
    new Date(ep.secret_key_grace_until).getTime() > Date.now()
  const matchPrevious = inGrace && safeEqual(submittedKey, ep.secret_key_previous!)
  if (!matchPrimary && !matchPrevious) {
    throw createError({ statusCode: 401, statusMessage: 'invalid_key' })
  }

  try {
    const norm = normalizeGooglePayload(body, ep.client_id)
    norm.assigned_to = await resolveAssignedAm(ep.client_id)
    const accepted = await acceptLead(event, {
      lead: { ...norm, client_id: ep.client_id },
      leadCaptureMode: ep.lead_capture_mode,
      consentDecision: 'unknown'
    })
    if (norm.form_id) {
      await upsertFormMetadata('google', norm.form_id, norm.form_name, norm.field_data)
    }
    if (accepted.status !== 'created') {
      return { ok: true, skipped: true, reason: accepted.status }
    }
    return { ok: true, lead_id: accepted.leadId }
  } catch (e: any) {
    await logIngestionError('google', ingestionDiagnostic(body), ingestionDiagnosticHeaders(event), e?.message ?? String(e))
    return { ok: true }
  }
})
