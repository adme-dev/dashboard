// POST /api/leads/_internal/meta-backfill
//
// Replay tool for archived Meta leadgen events. When Meta App Review
// approves leads_retrieval, run this to backfill leads that arrived during
// the pre-approval window (stored in lead_ingestion_errors with
// 'phase_1_archive' marker).
//
// Iterates archived rows, attempts to fetch each via Graph API using any
// active Meta connection's token, normalizes + inserts on success, and
// removes the archive row. Leaves rows in place if all tokens still deny.
//
// Auth: Bearer INTERNAL_CRON_TOKEN (same model as the other _internal
// endpoints). Always returns 200 + a structured summary.

import { queryRows, execute } from '~~/server/utils/db'
import {
  upsertFormMetadata,
} from '~~/server/utils/leads/db'
import {
  acceptLead
} from '~~/server/utils/leads/acceptance'
import { normalizeMetaPayload } from '~~/server/utils/leads/normalizer'
import { getMetaLeadgen } from '~~/server/utils/metaClient'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { isInternalCronAuthorized } from '~~/server/utils/leads/internalCronAuth'
import { resolveMetaLeadClient } from '~~/server/utils/leads/metaLeadClient'

interface ArchiveRow {
  id: string
  raw_payload: any
  created_at: string
}

interface TokenRow {
  access_token: string | null
}

interface BackfillResult {
  scanned: number
  ingested: number
  duplicates: number
  still_pending: number
  errors: number
  details?: string[]
}

export default defineEventHandler(async (event) => {
  // Bearer-token auth (matches recover-stuck-claims, purge-* endpoints)
  if (!isInternalCronAuthorized(event, getHeader(event, 'authorization'))) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }

  const limit = Math.min(Number(getQuery(event).limit ?? 200), 1000)

  const archives = await queryRows<ArchiveRow>(
    `SELECT id, raw_payload, created_at
       FROM lead_ingestion_errors
      WHERE source = 'meta'
        AND error LIKE 'phase_1_archive%'
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit],
  )

  const result: BackfillResult = {
    scanned: archives.length,
    ingested: 0,
    duplicates: 0,
    still_pending: 0,
    errors: 0,
    details: [],
  }

  if (!archives.length) return result

  const allTokens = await queryRows<TokenRow>(
    `SELECT connection.access_token
       FROM social_connections connection
      WHERE connection.platform = 'meta'
        AND connection.status = 'active'
        AND connection.access_token IS NOT NULL`,
  )
  // Dedupe — same OAuth grant replicated across many ad accounts.
  const tokens = Array.from(
    new Map(
      allTokens.filter((t) => t.access_token).map((t) => [t.access_token!, t]),
    ).values(),
  )
  if (!tokens.length) {
    result.details!.push('No active Meta connections — backfill cannot proceed.')
    return result
  }

  const pageTokenCache = new Map<string, TokenRow>()
  const MAX_TOKENS_PER_LEAD = 5

  for (const row of archives) {
    const payload = typeof row.raw_payload === 'string'
      ? (() => { try { return JSON.parse(row.raw_payload) } catch { return null } })()
      : row.raw_payload
    const leadgenId = payload?.leadgen_id
    const pageId = payload?.page_id
    if (!leadgenId) {
      result.errors++
      continue
    }

    const ordered = pageId && pageTokenCache.has(pageId)
      ? [pageTokenCache.get(pageId)!, ...tokens.filter((t) => t.access_token !== pageTokenCache.get(pageId)!.access_token)]
      : tokens

    let resolved: any = null
    let permissionDenied = false
    for (const t of ordered.slice(0, MAX_TOKENS_PER_LEAD)) {
      if (!t.access_token) continue
      try {
        resolved = await getMetaLeadgen(leadgenId, t.access_token)
        if (resolved) {
          if (pageId) pageTokenCache.set(pageId, t)
          break
        }
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
      if (permissionDenied) result.still_pending++
      else result.errors++
      continue
    }

    const client = await resolveMetaLeadClient(pageId, resolved.form_id ?? payload?.form_id)
    const clientId = client?.client_id ?? null

    const norm = normalizeMetaPayload(
      {
        id: resolved.id,
        field_data: resolved.field_data ?? [],
        ad_id: resolved.ad_id,
        ad_name: resolved.ad_name,
        form_id: resolved.form_id ?? payload?.form_id ?? '',
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
        result.errors++
        continue
      }
      norm.assigned_to = await resolveAssignedAm(clientId)
      const accepted = await acceptLead(event, {
        lead: { ...norm, client_id: clientId },
        leadCaptureMode: client?.lead_capture_mode ?? 'capture_only',
        consentDecision: 'unknown'
      })
      if (norm.form_id && Object.keys(norm.field_data).length) {
        await upsertFormMetadata('meta', norm.form_id, norm.form_name, norm.field_data)
      }
      if (accepted.status !== 'created') {
        result.duplicates++
      } else {
        result.ingested++
      }
      // Always remove the archive row on a successful fetch — even duplicates
      // (the live data is already in our system).
      await execute(`DELETE FROM lead_ingestion_errors WHERE id = $1`, [row.id])
    } catch (e: any) {
      result.errors++
      if (result.details!.length < 10) {
        result.details!.push(`row=${row.id}: ${e?.message ?? 'unknown'}`)
      }
    }
  }

  if (!result.details!.length) delete result.details
  return result
})
