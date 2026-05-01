// server/api/leads/webhook/google/[token].post.ts
import { queryOne } from '~~/server/utils/db'
import {
  insertLeadWithDedup, upsertFormMetadata, logIngestionError, loadLead,
} from '~~/server/utils/leads/db'
import { normalizeGooglePayload } from '~~/server/utils/leads/normalizer'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { allowRequest } from '~~/server/utils/leads/rateLimit'
import { enqueueLeadJob } from '~~/server/utils/leads/queue'
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'
import { timingSafeEqual } from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'token_required' })

  // Rate limit per token
  const rl = allowRequest(`google:${token}`, 200, 60_000)
  if (!rl.allowed) {
    setResponseHeader(event, 'Retry-After', String(Math.ceil((rl.retry_after_ms ?? 60_000) / 1000)))
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

  const body = await readBody(event).catch(() => null) as any
  if (!body || typeof body !== 'object') {
    await logIngestionError('google', body, getRequestHeaders(event), 'invalid_body')
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
    const leadId = await insertLeadWithDedup(norm)
    if (norm.form_id) {
      await upsertFormMetadata('google', norm.form_id, norm.form_name, norm.field_data)
    }
    if (!leadId) return { ok: true, skipped: true }
    await enqueueLeadJob({ type: 'rules.evaluate', payload: { lead_id: leadId } })
    const fresh = await loadLead(leadId)
    if (fresh) await notifyOnNewLead(fresh)
    return { ok: true, lead_id: leadId }
  } catch (e: any) {
    await logIngestionError('google', body, getRequestHeaders(event), e?.message ?? String(e))
    return { ok: true }
  }
})
