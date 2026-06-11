export type PacingSeverity = 'critical' | 'warning' | 'info'

export interface SpendPacingRow {
  platform: string
  clientName: string
  spendIds?: string[]
}

export interface SpendPacingReviewItem {
  mediaSpendId: string
  clientName: string
  platform: string
  severity: PacingSeverity | string
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
    highestSeverity: matches[0].severity,
  }
}

function normalizePacingPlatform(platform: string) {
  return platform === 'google_ads' ? 'google' : platform
}
