// Active ad-spend pacing/delivery alerts (type 'adspend' anomalies) for the
// current tenant, keyed back to their media_spend row so the spend pages can
// surface them inline on each campaign. Media-accessible (plain requireAuth,
// same as the other /api/agency/social/spend/* reads) — the central anomalies
// API is FINANCE-gated, which media buyers may not have.
import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows } from '~~/server/utils/db'

interface Row {
  id: string
  severity: string
  title: string
  description: string
  recommendation: string | null
  fingerprint: string
  context: { mediaSpendId?: string } | null
}

// Fallback for anomalies persisted before mediaSpendId was added to context.
// Fingerprint shape: `adspend:<kind>-<mediaSpendId>-<YYYY-MM>`.
function mediaSpendIdFromFingerprint(fp: string): string | null {
  const m = fp.match(/^adspend:[a-z]+-(.+)-\d{4}-\d{2}$/)
  return m?.[1] ?? null
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  // No Xero org connected → no tenant to scope anomalies to. Return no alerts
  // instead of 400ing, so the spend page loads clean before Xero is connected.
  if (!tenantId) return { items: [] }

  const rows = await queryRows<Row>(
    `SELECT id, severity, title, description, recommendation, fingerprint, context
     FROM anomalies
     WHERE tenant_id = $1
       AND type = 'adspend'
       AND status NOT IN ('resolved','dismissed')
       AND (snoozed_until IS NULL OR snoozed_until < NOW())
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_detected_at DESC`,
    [tenantId],
  )

  const items = rows.map(r => ({
    id: r.id,
    severity: r.severity,
    title: r.title,
    description: r.description,
    recommendation: r.recommendation,
    mediaSpendId: r.context?.mediaSpendId ?? mediaSpendIdFromFingerprint(r.fingerprint),
  }))

  return { items }
})
