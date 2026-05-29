/** Pure display helpers for Meta Ads– and Google Ads–style campaign columns. No Nuxt/DOM deps. */

const BID_STRATEGY_LABELS: Record<string, string> = {
  // Meta enums
  LOWEST_COST_WITHOUT_CAP: 'Highest volume',
  LOWEST_COST_WITH_BID_CAP: 'Bid cap',
  COST_CAP: 'Cost cap',
  LOWEST_COST_WITH_MIN_ROAS: 'Min ROAS',
  // Google enums
  MAXIMIZE_CONVERSIONS: 'Maximize conversions',
  MAXIMIZE_CONVERSION_VALUE: 'Maximize conv. value',
  TARGET_CPA: 'Target CPA',
  TARGET_ROAS: 'Target ROAS',
  TARGET_SPEND: 'Maximize clicks',
  MAXIMIZE_CLICKS: 'Maximize clicks',
  MANUAL_CPC: 'Manual CPC',
  MANUAL_CPM: 'Manual CPM',
}

export function bidStrategyLabel(raw: string | null | undefined): string {
  if (!raw) return '-'
  if (BID_STRATEGY_LABELS[raw]) return BID_STRATEGY_LABELS[raw]
  return raw
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function budgetTypeLabel(type: string | null | undefined): string {
  if (type === 'daily') return 'Daily'
  if (type === 'lifetime') return 'Lifetime'
  return '-'
}

export interface EndDateInfo {
  label: string
  hint: string | null
  tone: 'muted' | 'warning' | 'error'
}

/** Format an end date and compute a "Xd left" / "Ended" hint. `today` is injectable for tests. */
export function endDateInfo(value: string | Date | null | undefined, today: Date = new Date()): EndDateInfo {
  if (!value) return { label: '-', hint: null, tone: 'muted' }
  const end = new Date(value)
  if (isNaN(end.getTime())) return { label: '-', hint: null, tone: 'muted' }

  const label = end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const days = Math.round((startOfDay(end) - startOfDay(today)) / 86_400_000)

  if (days < 0) return { label, hint: 'Ended', tone: 'error' }
  if (days <= 3) return { label, hint: days === 0 ? 'Ends today' : `${days}d left`, tone: 'warning' }
  return { label, hint: null, tone: 'muted' }
}
