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
  insertLeadWithDedup, upsertFormMetadata, loadLead,
} from '~~/server/utils/leads/db'
import { normalizeMetaPayload } from '~~/server/utils/leads/normalizer'
import { getMetaLeadgen } from '~~/server/utils/metaClient'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { enqueueLeadJob } from '~~/server/utils/leads/queue'
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'

interface ArchiveRow {
  id: string
  raw_payload: any
  created_at: string
}

interface TokenRow {
  client_id: string | null
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
  const auth = getHeader(event, 'authorization') ?? ''
  const expected = process.env.INTERNAL_CRON_TOKEN ||
    (event.context as any).cloudflare?.env?.INTERNAL_CRON_TOKEN ||
    ''
  if (!expected || auth !== `Bearer ${expected}`) {
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

  const tokens = await queryRows<TokenRow>(
    `SELECT client_id, access_token FROM social_connections
       WHERE platform = 'meta' AND status = 'active' AND access_token IS NOT NULL`,
  )
  if (!tokens.length) {
    result.details!.push('No active Meta connections — backfill cannot proceed.')
    return result
  }

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
        continue
      }
    }

    if (!resolved) {
      if (permissionDenied) result.still_pending++
      else result.errors++
      continue
    }

    // Map page → client (best-effort)
    const clientId =
      tokens.find((t) => t.client_id != null)?.client_id ?? null

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
      if (clientId) norm.assigned_to = await resolveAssignedAm(clientId)
      const leadId = await insertLeadWithDedup(norm)
      if (norm.form_id && Object.keys(norm.field_data).length) {
        await upsertFormMetadata('meta', norm.form_id, norm.form_name, norm.field_data)
      }
      if (!leadId) {
        result.duplicates++
      } else {
        result.ingested++
        await enqueueLeadJob({ type: 'rules.evaluate', payload: { lead_id: leadId } })
        const fresh = await loadLead(leadId)
        if (fresh) await notifyOnNewLead(fresh)
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
