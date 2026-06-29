export type PacingSeverity = 'critical' | 'warning' | 'info'

export interface SpendPacingRow {
  platform: string
  clientName: string
  spendIds?: string[]
  budget?: number
  spend?: number
  lastSyncedAt?: string | null
}

export interface SpendPacingReviewItem {
  mediaSpendId: string
  clientName: string
  platform: string
  severity: PacingSeverity | string
  issueType?: string
  budget?: number
  projectedMonthEnd?: number
  recommendedAction?: string
}

export type SpendRowHealthTone = 'healthy' | 'warning' | 'critical' | 'neutral'

export interface SpendRowHealth {
  label: string
  tone: SpendRowHealthTone
  reason: string
}

export interface SpendRowProjection {
  value: number
  variance: number
  source: 'ai-review' | 'row-pacing' | 'none'
}

export interface SpendRowActionState {
  label: string
  tone: SpendRowHealthTone
  detail: string
}

export interface SpendBudgetControlSettings {
  liveBudgetChangesEnabled: boolean
  metaBudgetWritesEnabled: boolean
  googleBudgetWritesEnabled: boolean
}

export interface SpendBudgetControlState {
  label: 'Live armed' | 'Recommend only' | 'Blocked' | 'No mapping' | 'No budget'
  tone: SpendRowHealthTone
  detail: string
}

export function pacingSeverityRank(severity: string) {
  if (severity === 'critical') return 0
  if (severity === 'warning') return 1
  return 2
}

export function pacingItemsForSpendRow<T extends SpendPacingReviewItem>(
  row: SpendPacingRow,
  items: readonly T[]
): T[] {
  const spendIds = new Set(row.spendIds ?? [])
  const hasSpendIds = spendIds.size > 0
  const rowPlatform = normalizePacingPlatform(row.platform)

  return items
    .filter((item) => {
      if (hasSpendIds) return spendIds.has(item.mediaSpendId)
      return normalizePacingPlatform(item.platform) === rowPlatform && item.clientName === row.clientName
    })
    .sort((a, b) => pacingSeverityRank(a.severity) - pacingSeverityRank(b.severity))
}

export function pacingSummaryForSpendRow(row: SpendPacingRow, items: readonly SpendPacingReviewItem[]) {
  const matches = pacingItemsForSpendRow(row, items)
  if (!matches.length) return null
  return {
    count: matches.length,
    highestSeverity: matches[0].severity
  }
}

export function healthForSpendRow(row: SpendPacingRow, items: readonly SpendPacingReviewItem[]): SpendRowHealth {
  const matches = pacingItemsForSpendRow(row, items)
  if (matches[0]?.severity === 'critical') {
    return { label: 'Action needed', tone: 'critical', reason: issueLabel(matches[0].issueType) }
  }
  if (matches[0]?.severity === 'warning') {
    return { label: 'Watch', tone: 'warning', reason: issueLabel(matches[0].issueType) }
  }
  if ((row.budget ?? 0) <= 0 && (row.spend ?? 0) > 0) {
    return { label: 'Setup needed', tone: 'warning', reason: 'Missing budget' }
  }
  if (isStale(row.lastSyncedAt)) {
    return { label: 'Watch', tone: 'warning', reason: 'Stale sync' }
  }
  const projection = projectedMonthEndForSpendRow(row, items)
  if ((row.budget ?? 0) > 0 && Math.abs(projection.variance) / (row.budget ?? 1) >= 0.15) {
    return { label: 'Watch', tone: 'warning', reason: projection.variance > 0 ? 'Projected over' : 'Projected under' }
  }
  return { label: 'Healthy', tone: 'healthy', reason: 'On track' }
}

export function projectedMonthEndForSpendRow(row: SpendPacingRow, items: readonly SpendPacingReviewItem[]): SpendRowProjection {
  const matches = pacingItemsForSpendRow(row, items)
  const aiProjectedTotal = matches.reduce((sum, item) => sum + (Number(item.projectedMonthEnd) || 0), 0)
  const aiBudgetTotal = matches.reduce((sum, item) => sum + (Number(item.budget) || 0), 0)
  if (aiProjectedTotal > 0) {
    return {
      value: money(aiProjectedTotal),
      variance: money(aiProjectedTotal - aiBudgetTotal),
      source: 'ai-review'
    }
  }
  return {
    value: money(row.spend ?? 0),
    variance: money((row.spend ?? 0) - (row.budget ?? 0)),
    source: (row.spend ?? 0) > 0 ? 'row-pacing' : 'none'
  }
}

export function lastActionForSpendRow(row: SpendPacingRow, items: readonly SpendPacingReviewItem[]): SpendRowActionState {
  const matches = pacingItemsForSpendRow(row, items)
  if (!matches.length) return { label: 'No action', tone: 'neutral', detail: 'No current AI pacing recommendation' }
  const primary = matches[0]
  return {
    label: primary.severity === 'critical' ? 'Review needed' : 'Monitor',
    tone: primary.severity === 'critical' ? 'critical' : primary.severity === 'warning' ? 'warning' : 'neutral',
    detail: primary.recommendedAction || issueLabel(primary.issueType)
  }
}

export function budgetControlForSpendRow(
  row: SpendPacingRow,
  settings: SpendBudgetControlSettings | null | undefined
): SpendBudgetControlState {
  if ((row.budget ?? 0) <= 0) {
    return {
      label: 'No budget',
      tone: 'warning',
      detail: 'Set a campaign budget before AI can recommend or apply budget changes.'
    }
  }
  if (!(row.spendIds ?? []).length) {
    return {
      label: 'No mapping',
      tone: 'warning',
      detail: 'Map this spend row to source campaigns before live budget changes can be applied.'
    }
  }

  const platform = normalizePacingPlatform(row.platform)
  const platformLabel = platform === 'google' ? 'Google Ads' : platform === 'meta' ? 'Meta' : row.platform
  const platformEnabled = platform === 'meta'
    ? Boolean(settings?.metaBudgetWritesEnabled)
    : platform === 'google'
      ? Boolean(settings?.googleBudgetWritesEnabled)
      : false

  if (platform !== 'meta' && platform !== 'google') {
    return {
      label: 'Blocked',
      tone: 'neutral',
      detail: `${platformLabel} budget writes are not supported yet.`
    }
  }
  if (!settings?.liveBudgetChangesEnabled) {
    return {
      label: 'Recommend only',
      tone: 'neutral',
      detail: 'AI can recommend changes, but live budget writes are off.'
    }
  }
  if (!platformEnabled) {
    return {
      label: 'Blocked',
      tone: 'warning',
      detail: `${platformLabel} budget writes are disabled in budget control settings.`
    }
  }
  return {
    label: 'Live armed',
    tone: 'warning',
    detail: `${platformLabel} budget writes are enabled for mapped campaigns.`
  }
}

export function reasonCodesForSpendRow(row: SpendPacingRow, items: readonly SpendPacingReviewItem[]): string[] {
  const matches = pacingItemsForSpendRow(row, items)
  if (matches.length) return unique(matches.map(item => issueLabel(item.issueType)))

  const health = healthForSpendRow(row, items)
  return health.reason === 'On track' ? [] : [health.reason]
}

function issueLabel(issue: string | null | undefined) {
  if (issue === 'overpacing') return 'Overspending'
  if (issue === 'underpacing') return 'Under-delivering'
  if (issue === 'zero_conversion') return 'No conversions'
  if (issue === 'negative_social_feedback') return 'Negative social feedback'
  if (issue === 'stale_sync') return 'Stale data'
  if (issue === 'paused_with_budget') return 'Paused with budget'
  if (issue === 'no_spend') return 'No spend'
  if (!issue) return 'Pacing issue'
  return issue.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function isStale(lastSyncedAt: string | null | undefined): boolean {
  if (!lastSyncedAt) return false
  return Date.now() - new Date(lastSyncedAt).getTime() > 24 * 60 * 60 * 1000
}

function money(value: number) {
  return Math.round(value * 100) / 100
}

function normalizePacingPlatform(platform: string) {
  return platform === 'google_ads' ? 'google' : platform
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}
