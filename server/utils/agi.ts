/**
 * Agency Gross Income (AGI) series builder.
 *
 *   AGI = Revenue − Direct Costs   (both ex-GST, from xero_invoice_lines_cache)
 *
 * "Direct costs" are Xero DIRECTCOSTS accounts (cost of sales: media buys,
 * production, contractor delivery) — distinct from overheads (rent, wages,
 * software), which sit on the Get Out target side. This is the industry-
 * standard agency gross-income measure.
 *
 * Because a campaign's revenue and its vendor cost don't always fall in the
 * same calendar month, single-month AGI carries accrual noise — so we also
 * report trailing 3- and 12-month figures, computed over COMPLETE months only
 * (the current, partial month is excluded from the averages).
 */

export const DEFAULT_DIRECT_COST_CODES = [
  '300', '305', '310', '315', '316', '317', '318', '320', '325', '330', '340', '390',
]

export interface AgiRawMonth {
  mon: string // 'YYYY-MM'
  revenueCents: number
  directCostCents: number
}

export interface AgiMonth {
  mon: string
  revenue: number
  directCost: number
  agi: number
  marginPct: number | null
}

export interface AgiTrailing {
  avgAgi: number
  avgMarginPct: number | null
  totalRevenue: number
  totalDirectCost: number
  totalAgi: number
  months: number
}

export interface AgiSummary {
  months: AgiMonth[]
  current: AgiMonth | null // latest month (may be partial)
  trailing3: AgiTrailing
  trailing12: AgiTrailing
}

const round2 = (n: number) => Math.round(n * 100) / 100

function toMonth(raw: AgiRawMonth): AgiMonth {
  const revenue = raw.revenueCents / 100
  const directCost = raw.directCostCents / 100
  const agi = revenue - directCost
  return {
    mon: raw.mon,
    revenue: round2(revenue),
    directCost: round2(directCost),
    agi: round2(agi),
    marginPct: revenue > 0 ? Math.round((agi / revenue) * 1000) / 10 : null,
  }
}

function trailing(months: AgiMonth[], n: number): AgiTrailing {
  const slice = months.slice(-n)
  const totalRevenue = slice.reduce((s, m) => s + m.revenue, 0)
  const totalDirectCost = slice.reduce((s, m) => s + m.directCost, 0)
  const totalAgi = slice.reduce((s, m) => s + m.agi, 0)
  return {
    avgAgi: slice.length ? round2(totalAgi / slice.length) : 0,
    avgMarginPct: totalRevenue > 0 ? Math.round((totalAgi / totalRevenue) * 1000) / 10 : null,
    totalRevenue: round2(totalRevenue),
    totalDirectCost: round2(totalDirectCost),
    totalAgi: round2(totalAgi),
    months: slice.length,
  }
}

export function buildAgiSeries(
  raw: AgiRawMonth[],
  opts: { currentMon?: string } = {},
): AgiSummary {
  const sorted = [...raw].sort((a, b) => a.mon.localeCompare(b.mon))
  const months = sorted.map(toMonth)

  const current = months.length ? months[months.length - 1]! : null
  // Trailing averages use COMPLETE months only — exclude the current/partial one.
  const complete = opts.currentMon && current?.mon === opts.currentMon
    ? months.slice(0, -1)
    : months

  return {
    months,
    current,
    trailing3: trailing(complete, 3),
    trailing12: trailing(complete, 12),
  }
}
