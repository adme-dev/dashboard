// Pure helpers for the client-grouped spend widgets. The spend summary endpoint returns one
// item per (client × platform); these roll them up to one row per client and classify pacing.

export interface SpendSummaryItem {
  clientName?: string | null
  platform?: string | null
  spend?: number | null
  budget?: number | null
  owner?: { id: string, name: string | null } | null
}

export interface ClientSpendRow {
  client: string
  platforms: string[] // canonical: meta | google | tiktok | spotify | other
  owner: { id: string, name: string | null } | null
  spend: number
  budget: number
  pct: number // spend / budget * 100 (0 when no budget)
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function canonicalPlatform(p: string | null | undefined): string {
  const k = String(p || '').toLowerCase()
  if (k.includes('meta') || k.includes('facebook') || k.includes('instagram')) return 'meta'
  if (k.includes('google')) return 'google'
  if (k.includes('tiktok')) return 'tiktok'
  if (k.includes('spotify')) return 'spotify'
  return k || 'other'
}

/** One row per client; a client's platforms (Meta + Google …) roll into a single row. */
export function rollupSpendByClient(items: SpendSummaryItem[] | null | undefined): ClientSpendRow[] {
  const map = new Map<string, ClientSpendRow>()
  for (const it of items || []) {
    const client = (it.clientName || '').trim() || 'Unattributed'
    const row = map.get(client) || { client, platforms: [], owner: it.owner || null, spend: 0, budget: 0, pct: 0 }
    row.spend += num(it.spend)
    row.budget += num(it.budget)
    const p = canonicalPlatform(it.platform)
    if (p && !row.platforms.includes(p)) row.platforms.push(p)
    if (!row.owner && it.owner) row.owner = it.owner
    map.set(client, row)
  }
  const rows = [...map.values()]
  for (const r of rows) r.pct = r.budget > 0 ? Math.round((r.spend / r.budget) * 1000) / 10 : 0
  return rows.sort((a, b) => b.spend - a.spend)
}

export type PaceStatus = 'on_track' | 'over' | 'under' | 'no_budget'

/** Spend vs the budget expected by this point in the period (linear pacing). */
export function paceStatus(spend: number, budget: number, monthProgress: number): { status: PaceStatus, pacing: number } {
  if (!budget || budget <= 0) return { status: 'no_budget', pacing: 0 }
  const expected = budget * Math.max(monthProgress, 0.0001)
  const pacing = Math.round((spend / expected) * 1000) / 10
  if (pacing > 110) return { status: 'over', pacing }
  if (pacing < 80) return { status: 'under', pacing }
  return { status: 'on_track', pacing }
}
