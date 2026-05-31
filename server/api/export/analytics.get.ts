/**
 * Analytics export destination
 * GET /api/export/analytics?startDate=&endDate=&format=json|csv
 * Auth: bearer token (Authorization: Bearer <token> or ?token=), validated
 * against analytics_export_tokens. A client-scoped token only sees its client's
 * canonical daily fact; an agency-scoped token sees all clients.
 *
 * This is the "export destination" on data we already own — pull via this API
 * (or schedule a fetch into a warehouse). Direct push connectors (BigQuery/
 * Snowflake/S3) are a future add-on; the canonical fact shape is stable here.
 */
import { queryRows, execute } from '~~/server/utils/db'
import { sha256Hex, extractToken } from '~~/server/utils/exportTokens'
import { fetchCanonicalFact } from '~~/server/utils/canonicalFactQuery'
import { canonicalFactToCsv } from '~~/server/utils/canonicalFact'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const token = extractToken(getHeader(event, 'authorization'), q.token as string | undefined)
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Bearer token required' })
  }

  const hash = await sha256Hex(token)
  const rows = await queryRows<{ id: string, client_id: string | null }>(
    `SELECT id, client_id::text AS client_id
     FROM analytics_export_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [hash]
  )
  const tok = rows[0]
  if (!tok) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or revoked token' })
  }

  const today = new Date().toISOString().slice(0, 10)
  const startDate = (q.startDate as string) || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const endDate = (q.endDate as string) || today
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate must be YYYY-MM-DD' })
  }

  const fact = await fetchCanonicalFact({ startDate, endDate, clientId: tok.client_id || undefined })

  // Best-effort usage stamp (don't fail the export if it errors).
  try {
    await execute(`UPDATE analytics_export_tokens SET last_used_at = NOW() WHERE id = $1`, [tok.id])
  } catch { /* ignore */ }

  if (q.format === 'csv') {
    setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="canonical-fact-${startDate}-${endDate}.csv"`)
    return canonicalFactToCsv(fact)
  }

  return {
    window: { startDate, endDate },
    scope: tok.client_id ? 'client' : 'agency',
    rowCount: fact.length,
    rows: fact
  }
})
