// server/utils/crm/analytics.ts
// Pure sales-analytics aggregations over opportunity / stage / stage-history rows.
// Endpoints fetch the rows; these functions do the math (TDD).

export interface AnalyticsStage {
  id: string
  code: string
  name: string
  sort_order: number
  is_won: boolean
  is_lost: boolean
}

export interface AnalyticsOpp {
  id: string
  stage_id: string
  amount: number
  probability: number
  status: 'open' | 'won' | 'lost'
  owner_id: string | null
  created_at: string | null
  actual_close_date: string | null
}

export interface StageHistoryRow {
  opportunity_id: string
  from_stage_id: string | null
  to_stage_id: string
  changed_at: string
}

const DAY = 86400000
const round1 = (n: number) => Math.round(n * 10) / 10

export interface FunnelRow { stage_id: string, code: string, name: string, count: number, value: number }

export function funnel(opps: AnalyticsOpp[], stages: AnalyticsStage[]): FunnelRow[] {
  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order)
  return ordered.map((s) => {
    const inStage = opps.filter(o => o.stage_id === s.id)
    return {
      stage_id: s.id,
      code: s.code,
      name: s.name,
      count: inStage.length,
      value: inStage.reduce((sum, o) => sum + Number(o.amount || 0), 0),
    }
  })
}

export interface WinRate { won: number, lost: number, open: number, winRate: number }

export function winRate(opps: AnalyticsOpp[]): WinRate {
  const won = opps.filter(o => o.status === 'won').length
  const lost = opps.filter(o => o.status === 'lost').length
  const open = opps.filter(o => o.status === 'open').length
  const closed = won + lost
  return { won, lost, open, winRate: closed ? won / closed : 0 }
}

export function weightedForecast(opps: AnalyticsOpp[]): number {
  return opps
    .filter(o => o.status === 'open')
    .reduce((sum, o) => sum + Number(o.amount || 0) * Number(o.probability || 0) / 100, 0)
}

export function avgCycleLengthDays(opps: AnalyticsOpp[]): number | null {
  const durations = opps
    .filter(o => (o.status === 'won' || o.status === 'lost') && o.created_at && o.actual_close_date)
    .map(o => (new Date(o.actual_close_date as string).getTime() - new Date(o.created_at as string).getTime()) / DAY)
  if (!durations.length) return null
  return round1(durations.reduce((a, b) => a + b, 0) / durations.length)
}

export interface TimeInStageRow { stage_id: string, avgDays: number }

// For each opportunity, the time spent in a stage = gap between entering it and the
// next transition. The current (open) stage has no exit and is excluded.
export function avgTimeInStageDays(history: StageHistoryRow[]): TimeInStageRow[] {
  const byOpp = new Map<string, StageHistoryRow[]>()
  for (const h of history) {
    const arr = byOpp.get(h.opportunity_id) ?? []
    arr.push(h)
    byOpp.set(h.opportunity_id, arr)
  }
  const totals = new Map<string, { sum: number, n: number }>()
  for (const rows of byOpp.values()) {
    const sorted = [...rows].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime())
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i]!
      const next = sorted[i + 1]!
      const stageId = cur.to_stage_id
      const days = (new Date(next.changed_at).getTime() - new Date(cur.changed_at).getTime()) / DAY
      const t = totals.get(stageId) ?? { sum: 0, n: 0 }
      t.sum += days; t.n += 1
      totals.set(stageId, t)
    }
  }
  return [...totals.entries()].map(([stage_id, t]) => ({ stage_id, avgDays: round1(t.sum / t.n) }))
}
