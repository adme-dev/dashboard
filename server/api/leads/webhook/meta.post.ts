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

import { queryRows } from '~~/server/utils/db'
import {
  upsertFormMetadata, logIngestionError,
} from '~~/server/utils/leads/db'
import { acceptLead, type LeadCaptureMode } from '~~/server/utils/leads/acceptance'
import { normalizeMetaPayload } from '~~/server/utils/leads/normalizer'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
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
  lead_capture_mode: LeadCaptureMode | null
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

  // Pull active Meta tokens, dedupe by access_token. The agency's many
  // ad-account connections share one OAuth grant per user, so deduping
  // collapses 100+ rows down to typically 1-3 unique tokens.
  const allTokens = await queryRows<PageTokenRow>(
    `SELECT connection.id, connection.client_id, connection.access_token,
            client.lead_capture_mode
       FROM social_connections connection
       LEFT JOIN agency_clients client ON client.id = connection.client_id
      WHERE connection.platform = 'meta'
        AND connection.status = 'active'
        AND connection.access_token IS NOT NULL`,
  )
  const uniqueTokens = Array.from(
    new Map(
      allTokens.filter((t) => t.access_token).map((t) => [t.access_token!, t]),
    ).values(),
  )

  // Cache: which token successfully fetched a leadgen for a given page_id.
  // Reused across leadgens within the same webhook batch (Meta often
  // includes multiple events per delivery).
  const pageTokenCache = new Map<string, PageTokenRow>()

  // Hard cap on tokens to try per leadgen. Pre-App-Review, all tokens deny —
  // capping prevents 100+ fruitless calls per event.
  const MAX_TOKENS_PER_LEADGEN = 5

  for (const entry of body.entry) {
    const pageId = entry.id
    const changes = entry.changes ?? []
    for (const change of changes) {
      if (change.field !== 'leadgen') continue
      const leadgenId = change.value?.leadgen_id
      if (!leadgenId) continue

      // If we already found a working token for this page, try it first.
      const orderedTokens = pageTokenCache.has(pageId)
        ? [pageTokenCache.get(pageId)!, ...uniqueTokens.filter((t) => t.id !== pageTokenCache.get(pageId)!.id)]
        : uniqueTokens

      let resolved: any = null
      let permissionDenied = false
      let workingToken: PageTokenRow | null = null
      for (const t of orderedTokens.slice(0, MAX_TOKENS_PER_LEADGEN)) {
        if (!t.access_token) continue
        try {
          resolved = await getMetaLeadgen(leadgenId, t.access_token)
          if (resolved) { workingToken = t; pageTokenCache.set(pageId, t); break }
        } catch (e: any) {
          const status = e?.status ?? e?.response?.status
          const msg = String(e?.data?.error?.message ?? e?.message ?? '')
          if (status === 403 || status === 401 || /permission/i.test(msg)) {
            permissionDenied = true
            continue
          }
          continue
        }
      }

      if (!resolved) {
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

      // The connection that owns the working token is the one with Page
      // access — use its client_id. This is more correct than matching
      // page_id against account_id (different namespaces in Meta).
      const clientId = workingToken?.client_id ?? null

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
        if (!clientId) {
          await logIngestionError('meta', {
            page_id: pageId,
            leadgen_id: leadgenId
          }, headers, 'client_not_mapped').catch(() => {})
          continue
        }
        norm.assigned_to = await resolveAssignedAm(clientId)
        const accepted = await acceptLead(event, {
          lead: { ...norm, client_id: clientId },
          leadCaptureMode: workingToken?.lead_capture_mode ?? 'capture_only',
          consentDecision: 'unknown'
        })
        if (norm.form_id && Object.keys(norm.field_data).length) {
          await upsertFormMetadata('meta', norm.form_id, norm.form_name, norm.field_data)
        }
        if (accepted.status !== 'created') continue
      } catch (e: any) {
        await logIngestionError('meta', body, headers, `insert_failed: ${e?.message ?? 'unknown'}`)
          .catch(() => {})
      }
    }
  }

  return { ok: true }
})
