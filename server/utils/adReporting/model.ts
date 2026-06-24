// server/utils/adReporting/model.ts
// Pure aggregation for the ad-performance report. No I/O — unit-tested.

export interface AdSpendRow {
  platform: string
  campaign_name: string | null
  budget_allocated: number | string | null
  actual_spend: number | string | null
  impressions: number | string | null
  clicks: number | string | null
  conversions: number | string | null
}

export interface AdReportKpis {
  spend: number
  budget: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  budgetUtilizationPct: number
}

export interface AdReportModel {
  clientName: string
  periodLabel: string
  kpis: AdReportKpis
  prior: AdReportKpis | null
  deltas: { spend: number | null, clicks: number | null, conversions: number | null, cpa: number | null }
  topCampaigns: Array<{ campaign: string, platform: string, spend: number, conversions: number, cpa: number }>
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0
}

export function aggregateAdKpis(rows: AdSpendRow[]): AdReportKpis {
  let spend = 0, budget = 0, impressions = 0, clicks = 0, conversions = 0
  for (const r of rows) {
    spend += num(r.actual_spend)
    budget += num(r.budget_allocated)
    impressions += num(r.impressions)
    clicks += num(r.clicks)
    conversions += num(r.conversions)
  }
  return {
    spend, budget, impressions, clicks, conversions,
    ctr: safeDiv(clicks, impressions) * 100,
    cpc: safeDiv(spend, clicks),
    cpa: safeDiv(spend, conversions),
    budgetUtilizationPct: safeDiv(spend, budget) * 100,
  }
}

export function pctDeltaNullable(cur: number, prior: number | null | undefined): number | null {
  if (prior == null || prior === 0) return null
  return ((cur - prior) / prior) * 100
}

export function buildAdReportModel(input: {
  clientName: string
  periodLabel: string
  current: AdSpendRow[]
  prior?: AdSpendRow[]
}): AdReportModel {
  const kpis = aggregateAdKpis(input.current)
  const prior = input.prior && input.prior.length ? aggregateAdKpis(input.prior) : null
  const topCampaigns = [...input.current]
    .map(r => ({
      campaign: r.campaign_name || 'Unknown',
      platform: r.platform,
      spend: num(r.actual_spend),
      conversions: num(r.conversions),
      cpa: safeDiv(num(r.actual_spend), num(r.conversions)),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
  return {
    clientName: input.clientName,
    periodLabel: input.periodLabel,
    kpis,
    prior,
    deltas: {
      spend: pctDeltaNullable(kpis.spend, prior?.spend),
      clicks: pctDeltaNullable(kpis.clicks, prior?.clicks),
      conversions: pctDeltaNullable(kpis.conversions, prior?.conversions),
      cpa: pctDeltaNullable(kpis.cpa, prior?.cpa),
    },
    topCampaigns,
  }
}
