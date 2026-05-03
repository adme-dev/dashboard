/**
 * GET /api/customers/[contactId]/insights
 *
 * Returns the persisted insights row (heuristic churn risk + 12mo forecast +
 * factor breakdown), the customer's open anomalies, and an AI-generated
 * one-paragraph summary.
 *
 * AI summary is lazy: regenerated on read if older than 24h. Pass
 * ?refresh=true to force regeneration. Generation runs out-of-band so
 * the first read still returns instantly with whatever is cached
 * (or a helpful placeholder if there's nothing yet).
 */

import { defineEventHandler, getRouterParam, getQuery, createError } from 'h3'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

interface InsightsRow {
  churn_risk_score: number
  churn_risk_band: string
  churn_factors: any
  forecast_12m_cents: string | number
  forecast_basis: string
  ai_summary: string | null
  ai_summary_at: string | null
  computed_at: string
}

interface RollupRow {
  name: string
  email: string | null
  default_currency: string | null
  payment_terms_days: number | null
  ltv_cents: string | number | null
  ytd_revenue_cents: string | number | null
  last_12m_revenue_cents: string | number | null
  last_12m_buckets: any
  invoice_count: number | null
  paid_invoice_count: number | null
  dso_days: string | null
  paid_late_pct: string | null
  outstanding_cents: string | number | null
  overdue_cents: string | number | null
  oldest_overdue_days: number | null
  mrr_cents: string | number | null
  has_active_repeating: boolean
  concentration_pct: string | null
  first_invoice_date: string | null
  last_invoice_date: string | null
  last_payment_date: string | null
  rollup_currency: string | null
}

interface AnomalyRow {
  id: string
  type: string
  severity: string
  title: string
  description: string
  recommendation: string | null
  created_at: string
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000  // 24 hours

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}
function dollars(c: unknown): number { return n(c) / 100 }

function fmtMoney(amount: number, currency: string): string {
  if (Math.abs(amount) >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(1)}m`
  if (Math.abs(amount) >= 1_000) return `${currency} ${(amount / 1_000).toFixed(1)}k`
  return `${currency} ${Math.round(amount).toLocaleString()}`
}

/** Build the prompt that lets Groq write a useful one-paragraph summary. */
function buildSummaryPrompt(opts: {
  customer: RollupRow
  insights: InsightsRow
  anomalyCount: number
  contactId: string
}): string {
  const { customer: c, insights: i, anomalyCount } = opts
  const currency = c.rollup_currency || c.default_currency || 'AUD'
  const ltv = dollars(c.ltv_cents)
  const ytd = dollars(c.ytd_revenue_cents)
  const last12m = dollars(c.last_12m_revenue_cents)
  const outstanding = dollars(c.outstanding_cents)
  const overdue = dollars(c.overdue_cents)
  const mrr = dollars(c.mrr_cents)
  const forecast = dollars(i.forecast_12m_cents)
  const dso = c.dso_days != null ? Number(c.dso_days) : null
  const lateRate = c.paid_late_pct != null ? Number(c.paid_late_pct) : null
  const tenure = c.first_invoice_date
    ? Math.max(0, Math.floor((Date.now() - new Date(c.first_invoice_date).getTime()) / 86400_000))
    : null

  const facts = [
    `Customer: ${c.name}`,
    `Currency: ${currency}`,
    `Lifetime: ${fmtMoney(ltv, currency)} across ${c.invoice_count ?? 0} invoices`,
    `YTD revenue: ${fmtMoney(ytd, currency)}`,
    `Last 12 months: ${fmtMoney(last12m, currency)}`,
    mrr > 0 ? `MRR (recurring): ${fmtMoney(mrr, currency)}/mo` : null,
    `12-month forecast: ${fmtMoney(forecast, currency)} (basis: ${i.forecast_basis})`,
    outstanding > 0 ? `Outstanding: ${fmtMoney(outstanding, currency)}` : null,
    overdue > 0 ? `Overdue: ${fmtMoney(overdue, currency)} (${c.oldest_overdue_days ?? 0}d oldest)` : null,
    dso != null ? `Pays in: ${Math.round(dso)}d (terms ${c.payment_terms_days ?? 30}d)` : null,
    lateRate != null ? `Late payment rate: ${Math.round(lateRate)}%` : null,
    tenure != null ? `Tenure: ${tenure} days (since ${c.first_invoice_date})` : null,
    `Concentration: ${c.concentration_pct != null ? Number(c.concentration_pct).toFixed(1) : '0'}% of agency YTD`,
    `Churn risk: ${i.churn_risk_score}/100 (${i.churn_risk_band})`,
    anomalyCount > 0 ? `Open anomalies: ${anomalyCount}` : null,
  ].filter(Boolean).join('\n')

  return `Write a single concise paragraph (2-3 sentences max, ~50 words) summarising this customer for an agency operator. Lead with what's notable, mention payment behaviour or risk only if there's something actionable, and end with a forward-looking note (e.g. forecast, retainer status, or next step). Plain prose only — no bullet points, no headers.

Facts:
${facts}`
}

async function generateAndStoreSummary(opts: {
  tenantId: string
  contactId: string
  customer: RollupRow
  insights: InsightsRow
  anomalyCount: number
}): Promise<string | null> {
  try {
    const text = await generateGroqInsight(buildSummaryPrompt(opts), {
      model: GROQ_MODELS.LLAMA_70B,
      temperature: 0.2,
      maxTokens: 200,
      systemPrompt: 'You are a concise agency CFO assistant. Write a single short paragraph summarising customer accounts for operators reviewing them. Be specific, factual, and no-fluff.',
    })
    const trimmed = text.trim()
    if (!trimmed) return null

    await execute(
      `UPDATE customer_insights
         SET ai_summary = $1, ai_summary_at = NOW()
         WHERE tenant_id = $2 AND contact_id = $3`,
      [trimmed, opts.tenantId, opts.contactId],
    )
    return trimmed
  } catch (err: any) {
    console.warn('[insights] AI summary generation failed:', err?.message)
    return null
  }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  const query = getQuery(event)
  const forceRefresh = query.refresh === 'true' || query.refresh === '1'

  // Fetch insights row
  const insights = await queryOne<InsightsRow>(
    `SELECT churn_risk_score, churn_risk_band, churn_factors,
            forecast_12m_cents, forecast_basis,
            ai_summary, ai_summary_at, computed_at
       FROM customer_insights
       WHERE tenant_id = $1 AND contact_id = $2`,
    [tenantId, contactId],
  )
  if (!insights) {
    return {
      ready: false,
      message: 'Insights not yet computed — run a sync from Xero to populate.',
      churnRiskScore: 0,
      churnRiskBand: 'low',
      churnFactors: null,
      forecast12m: 0,
      forecastBasis: 'unknown',
      aiSummary: null,
      anomalies: [],
      computedAt: null,
    }
  }

  // Fetch the rollup + contact context for the AI prompt + anomalies join key
  const customer = await queryOne<RollupRow>(
    `SELECT
       c.name, c.email, c.default_currency, c.payment_terms_days,
       r.ltv_cents, r.ytd_revenue_cents, r.last_12m_revenue_cents, r.last_12m_buckets,
       r.invoice_count, r.paid_invoice_count, r.dso_days, r.paid_late_pct,
       r.outstanding_cents, r.overdue_cents, r.oldest_overdue_days,
       r.mrr_cents, r.has_active_repeating, r.concentration_pct,
       r.first_invoice_date, r.last_invoice_date, r.last_payment_date,
       r.currency_code AS rollup_currency
     FROM xero_contacts_cache c
     LEFT JOIN xero_customer_rollups r
            ON r.tenant_id = c.tenant_id AND r.contact_id = c.contact_id
     WHERE c.tenant_id = $1 AND c.contact_id = $2`,
    [tenantId, contactId],
  )

  // Anomalies that target this contact. The anomaly engine writes
  // `context->>'contact_id'` when a finding is contact-specific; older
  // rows may not have it, so we fall back to the contact name.
  const anomalies = customer
    ? await queryRows<AnomalyRow>(
        `SELECT id, type, severity, title, description, recommendation, created_at
           FROM anomalies
           WHERE tenant_id = $1
             AND status = 'open'
             AND (
               context->>'contact_id' = $2
               OR context->>'contactId' = $2
               OR context->>'name' = $3
             )
           ORDER BY
             CASE severity
               WHEN 'critical' THEN 0 WHEN 'high' THEN 1
               WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4
             END,
             created_at DESC
           LIMIT 10`,
        [tenantId, contactId, customer.name],
      )
    : []

  // Lazy AI summary — regenerate if missing, forced, or older than 24h.
  const summaryAge = insights.ai_summary_at ? Date.now() - new Date(insights.ai_summary_at).getTime() : Infinity
  const needsSummary = customer
    && (forceRefresh || !insights.ai_summary || summaryAge > STALE_AFTER_MS)

  let aiSummary = insights.ai_summary
  let aiSummaryAt = insights.ai_summary_at
  if (needsSummary && customer) {
    const fresh = await generateAndStoreSummary({
      tenantId,
      contactId,
      customer,
      insights,
      anomalyCount: anomalies.length,
    })
    if (fresh) {
      aiSummary = fresh
      aiSummaryAt = new Date().toISOString()
    }
  }

  return {
    ready: true,
    churnRiskScore: insights.churn_risk_score,
    churnRiskBand: insights.churn_risk_band,
    churnFactors: insights.churn_factors,
    forecast12m: dollars(insights.forecast_12m_cents),
    forecastBasis: insights.forecast_basis,
    aiSummary,
    aiSummaryAt,
    anomalies: anomalies.map(a => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      description: a.description,
      recommendation: a.recommendation,
      createdAt: a.created_at,
    })),
    computedAt: insights.computed_at,
  }
})
