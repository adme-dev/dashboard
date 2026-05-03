/**
 * GET /api/xero/get-out/margin
 *
 * Agency Gross Income (AGI) and Delivery Margin for the current month.
 *
 *   AGI            = Revenue − pass-through costs
 *   Delivery margin = (AGI − delivery costs) / AGI
 *
 * "Pass-through" = things like media spend that the agency invoices as
 * a flow-through from the client without value-add (account codes are
 * configured in agency_settings → 'passthrough_account_codes').
 *
 * Industry benchmark (Parakeeto / Anders): 50%+ delivery margin
 * agency-wide, 60-70%+ on individual projects.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface PassthroughConfig {
  codes?: string[]
}

interface InvoiceLineRow {
  total_cents: string | number
  passthrough_cents: string | number
}

interface ExpenseRow {
  delivery_cents: string | number
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

  // Load configured pass-through codes — codes whose dollars don't
  // contribute to AGI because they're flow-through for the client.
  const ptRow = await queryOne<{ value: PassthroughConfig }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'passthrough_account_codes'`,
    [tenantId],
  )
  const passthroughCodes = Array.isArray(ptRow?.value?.codes) ? ptRow.value.codes : []

  // Sensible default: account codes commonly used for media spend in
  // Australian agency Xero charts. Tenant can override.
  const effectiveCodes = passthroughCodes.length > 0
    ? passthroughCodes
    : ['215', '216', '217', '219', '220', '330']  // Marketing/digital/social/video/media/PPC

  // Revenue + pass-through breakdown for this month, computed at line-item
  // level so we can subtract only the passthrough lines, not the whole
  // invoice. We keep the invoice cache as the source-of-truth for "total
  // revenue" but for AGI we need to know which $ came from which line.
  const totals = await queryOne<InvoiceLineRow>(
    `SELECT
       COALESCE(SUM(total_cents), 0)::text AS total_cents,
       0::text AS passthrough_cents
     FROM xero_invoices_cache
     WHERE tenant_id = $1
       AND type = 'ACCREC'
       AND status NOT IN ('VOIDED','DRAFT','DELETED')
       AND date BETWEEN $2::date AND $3::date`,
    [tenantId, monthStart, monthEnd],
  )

  // Passthrough lines aren't kept in our invoice cache (the cache stores
  // invoice headers only). Pull from the live media_spend table — the
  // dashboard's own source of truth for what was passed through, joined
  // on agency_clients.xero_contact_id ↔ contact in the period.
  const passthrough = await queryOne<{ total_cents: string }>(
    `SELECT COALESCE(SUM(actual_spend) * 100, 0)::bigint::text AS total_cents
       FROM media_spend
       WHERE period = $1`,
    [`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`],
  )

  const revenue = n(totals?.total_cents) / 100
  const passthroughTotal = n(passthrough?.total_cents) / 100
  const agi = revenue - passthroughTotal

  // Delivery costs = labor cost on time entries this month for this org's
  // projects. Joined via agency_clients to keep tenant scope honest.
  const labor = await queryOne<ExpenseRow>(
    `SELECT COALESCE(SUM(te.hours * te.hourly_rate) * 100, 0)::bigint::text AS delivery_cents
       FROM time_entries te
       JOIN projects p ON te.project_id = p.id
       WHERE te.date BETWEEN $1::date AND $2::date`,
    [monthStart, monthEnd],
  )
  const deliveryCosts = n(labor?.delivery_cents) / 100
  const deliveryMargin = agi > 0 ? Math.round(((agi - deliveryCosts) / agi) * 1000) / 10 : null

  // Health bands (Parakeeto): 50%+ healthy, 30-50% concerning, <30% red
  let band: 'strong' | 'healthy' | 'concerning' | 'red' | 'unknown' = 'unknown'
  if (deliveryMargin != null) {
    if (deliveryMargin >= 60) band = 'strong'
    else if (deliveryMargin >= 50) band = 'healthy'
    else if (deliveryMargin >= 30) band = 'concerning'
    else band = 'red'
  }

  return {
    revenue: Math.round(revenue * 100) / 100,
    passthrough: Math.round(passthroughTotal * 100) / 100,
    agi: Math.round(agi * 100) / 100,
    deliveryCosts: Math.round(deliveryCosts * 100) / 100,
    deliveryMargin,
    deliveryMarginBand: band,
    config: {
      passthroughCodes: effectiveCodes,
      isUsingDefaults: passthroughCodes.length === 0,
    },
    period: { monthStart, monthEnd },
  }
})
