// Pacing & delivery-health detectors over media_spend + daily_spend. Separate
// from adspend.ts (which detects spend SPIKES). Each detector is a pure
// function exported for unit testing; the analyser composes them. All emit
// type 'adspend' with month-level fingerprints so re-detection updates one row
// per campaign per month.
import { buildFingerprint } from '../fingerprints'
import type { Analyser, DetectedAnomaly } from '../types'

export interface DailyPoint { date: string; spend: number; conversions: number }
export interface Group {
  mediaSpendId: string
  clientId: string
  clientName: string
  platform: string
  period: string
  budget: number
  campaignStatus: string | null
  syncedAt: string | null
  days: DailyPoint[]
}

interface HealthRow {
  client_id: string
  client_name: string | null
  platform: string
  spend_date: string
  spend: number | string
  media_spend_id: string
  budget_allocated: number | string
  period: string
  campaign_status: string | null
  synced_at: string | null
  conversions: number | string | null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const round = (n: number) => Math.round(n).toLocaleString('en-US')

export function buildGroups(rows: HealthRow[]): Map<string, Group> {
  const groups = new Map<string, Group>()
  for (const r of rows) {
    if (!r.media_spend_id) continue
    let g = groups.get(r.media_spend_id)
    if (!g) {
      g = {
        mediaSpendId: r.media_spend_id,
        clientId: r.client_id,
        clientName: r.client_name ?? '(unknown client)',
        platform: r.platform,
        period: r.period,
        budget: num(r.budget_allocated),
        campaignStatus: r.campaign_status,
        syncedAt: r.synced_at,
        days: [],
      }
      groups.set(r.media_spend_id, g)
    }
    g.days.push({ date: r.spend_date, spend: num(r.spend), conversions: num(r.conversions) })
  }
  return groups
}

export const adspendHealthAnalyser: Analyser = async (ctx) => {
  const rows = ctx.data.mediaSpend as HealthRow[] | null
  if (!rows || rows.length === 0) return []
  const groups = buildGroups(rows)
  const out: DetectedAnomaly[] = []
  // detectors added in subsequent tasks
  return out
}

// Shared helpers for detectors (exported for reuse within this module).
export const _internal = { num, round }
