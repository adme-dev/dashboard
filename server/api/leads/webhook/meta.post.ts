// POST /api/leads/webhook/meta
//
// Meta lead-event receiver. Two-mode design that activates fully the moment
// leads_retrieval is granted on the OAuth tokens (post Meta App Review):
//
//   PHASE-1 mode (current): permission denied on /{leadgen_id} fetch →
//     archive event metadata to lead_ingestion_errors with marker
//     'phase_1_archive'. The /api/leads/_internal/meta-backfill endpoint
//     replays these once permission is granted.
//
//   PHASE-2 mode (post-approval, no code change): /{leadgen_id} fetch
//     returns full lead data → normalize via normalizeMetaPayload → insert
//     via insertLeadWithDedup → enqueue routing → fire notifications.
//
// Always-200: Meta auto-disables subscriptions that return non-2xx.
// Signature verified via HMAC-SHA256 over raw body using META_APP_SECRET.

import { queryRows, queryOne } from '~~/server/utils/db'
import {
  insertLeadWithDedup, upsertFormMetadata, logIngestionError, loadLead,
} from '~~/server/utils/leads/db'
import { normalizeMetaPayload } from '~~/server/utils/leads/normalizer'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { enqueueLeadJob } from '~~/server/utils/leads/queue'
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'
import { getMetaLeadgen, verifyMetaSignature } from '~~/server/utils/metaClient'

interface MetaLeadgenChange {
  field: string
  value: {
    leadgen_id?: string
    form_id?: string
    page_id?: string
    ad_id?: string
    created_time?: number
  }
}

interface MetaWebhookEntry {
  id: string
  time?: number
  changes?: MetaLeadgenChange[]
}

interface MetaWebhookBody {
  object?: string
  entry?: MetaWebhookEntry[]
}

interface PageTokenRow {
  id: string
  client_id: string | null
  access_token: string | null
}

export default defineEventHandler(async (event) => {
  const headers = getRequestHeaders(event)
  const config = useRuntimeConfig()
  const appSecret = (config as any).metaAppSecret as string

  // Read raw text first — needed for signature verification AND parsing.
  const rawBody = await readRawBody(event, 'utf-8').catch(() => null)
  if (!rawBody) {
    return { ok: true }
  }

  // Verify signature unless explicitly disabled (test envs without secret).
  if (appSecret) {
    const sig = headers['x-hub-signature-256'] as string | undefined
    const ok = await verifyMetaSignature(rawBody, sig, appSecret)
    if (!ok) {
      // Don't reveal anything — just 401. Meta will retry events with
      // valid signatures, so no harm.
      throw createError({ statusCode: 401, statusMessage: 'invalid_signature' })
    }
  }

  let body: MetaWebhookBody
  try { body = JSON.parse(rawBody) } catch {
    await logIngestionError('meta', { rawBody }, headers, 'invalid_json').catch(() => {})
    return { ok: true }
  }

  if (body?.object !== 'page' || !Array.isArray(body.entry)) {
    return { ok: true }
  }

  // Pull active Meta tokens once. Token strategy: try each until one fetches
  // successfully. After the first hit for a page_id we'd cache, but the
  // simpler implementation just retries — Meta's leadgen webhook is
  // low-throughput per page so the cost is fine.
  const tokens = await queryRows<PageTokenRow>(
    `SELECT id, client_id, access_token
       FROM social_connections
      WHERE platform = 'meta' AND status = 'active' AND access_token IS NOT NULL`,
  )

  for (const entry of body.entry) {
    const pageId = entry.id
    const changes = entry.changes ?? []
    for (const change of changes) {
      if (change.field !== 'leadgen') continue
      const leadgenId = change.value?.leadgen_id
      if (!leadgenId) continue

      // Try each available token until one returns the lead. After App
      // Review, the first one usually wins; pre-approval, all of them deny.
      let resolved: any = null
      let permissionDenied = false
      for (const t of tokens) {
        if (!t.access_token) continue
        try {
          resolved = await getMetaLeadgen(leadgenId, t.access_token)
          if (resolved) break
        } catch (e: any) {
          const status = e?.status ?? e?.response?.status
          const msg = String(e?.data?.error?.message ?? e?.message ?? '')
          if (status === 403 || status === 401 || /permission/i.test(msg)) {
            permissionDenied = true
            continue
          }
          // Other errors (rate limit, network) — try next token.
          continue
        }
      }

      if (!resolved) {
        // Archive — either lead was deleted in Meta or all tokens lacked
        // permission. Either way the backfill cron picks this up later.
        await logIngestionError(
          'meta',
          {
            page_id: pageId,
            leadgen_id: leadgenId,
            form_id: change.value?.form_id,
            ad_id: change.value?.ad_id,
            created_time: change.value?.created_time,
          },
          headers,
          permissionDenied ? 'phase_1_archive: leads_retrieval pending' : 'leadgen_not_resolvable',
        ).catch(() => {})
        continue
      }

      // Map Meta page → client. If a connection has client_id set we use it;
      // otherwise leave null (unmapped — admin can assign in inbox).
      const conn = await queryOne<{ client_id: string | null }>(
        `SELECT client_id FROM social_connections
           WHERE platform = 'meta' AND status = 'active'
             AND (account_id = $1 OR metadata->>'page_id' = $1)
           LIMIT 1`,
        [pageId],
      ).catch(() => null)
      const clientId = conn?.client_id ?? null

      const norm = normalizeMetaPayload(
        {
          id: resolved.id,
          field_data: resolved.field_data ?? [],
          ad_id: resolved.ad_id,
          ad_name: resolved.ad_name,
          form_id: resolved.form_id ?? change.value?.form_id ?? '',
          form_name: undefined,
          campaign_id: resolved.campaign_id,
          campaign_name: resolved.campaign_name,
          created_time: resolved.created_time,
        },
        pageId ?? null,
        clientId,
      )

      try {
        if (clientId) norm.assigned_to = await resolveAssignedAm(clientId)
        const leadId = await insertLeadWithDedup(norm)
        if (norm.form_id && Object.keys(norm.field_data).length) {
          await upsertFormMetadata('meta', norm.form_id, norm.form_name, norm.field_data)
        }
        if (!leadId) continue // duplicate — silent
        await enqueueLeadJob({ type: 'rules.evaluate', payload: { lead_id: leadId } })
        const fresh = await loadLead(leadId)
        if (fresh) await notifyOnNewLead(fresh)
      } catch (e: any) {
        await logIngestionError('meta', body, headers, `insert_failed: ${e?.message ?? 'unknown'}`)
          .catch(() => {})
      }
    }
  }

  return { ok: true }
})
