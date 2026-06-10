export interface BudgetHistoryLike {
  previousBudget: number
  newBudget: number
}

export type BudgetHistoryTone = 'increase' | 'decrease' | 'flat'

export interface PacingSignalSource {
  budget: number
  mtdSpend: number
  expectedToDate: number
  projectedMonthEnd: number
  currentDailyBudget?: number
  recommendedDailyBudget: number
  pacingRatio: number
  syncedAt: string | null
}

export interface PacingSignalRow {
  label: string
  value: string
  detail: string
}

export interface PerformanceSignalSource {
  impressions: number
  clicks: number
  conversions: number
  ctr: number | null
  cpc: number | null
  costPerConversion: number | null
  conversionRate: number | null
  reach: number | null
  frequency: number | null
  impressionShare: number | null
  lostImpressionShareBudget: number | null
  lostImpressionShareRank: number | null
  bidStrategy: string | null
  budgetType: string | null
}

export interface PlannedBudgetActionLike {
  actionType: string
  actionStatus: string
  newValue: Record<string, unknown>
}

export function budgetHistoryDelta(entry: BudgetHistoryLike) {
  return entry.newBudget - entry.previousBudget
}

export function budgetHistoryTone(entry: BudgetHistoryLike): BudgetHistoryTone {
  const delta = budgetHistoryDelta(entry)
  if (delta > 0) return 'increase'
  if (delta < 0) return 'decrease'
  return 'flat'
}

export function formatBudgetHistoryTime(value: string, locale = 'en-AU', timeZone?: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(new Date(value))
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[Math.max(0, Number(getPart('month')) - 1)] || getPart('month')
  const period = getPart('dayPeriod').toLowerCase()
  return `${Number(getPart('day'))} ${month} ${getPart('year')}, ${getPart('hour')}:${getPart('minute')} ${period}`
}

export function pacingSignalRows(source: PacingSignalSource, locale = 'en-AU', timeZone?: string): PacingSignalRow[] {
  const spendGap = source.mtdSpend - source.expectedToDate
  const projectedGap = source.projectedMonthEnd - source.budget
  const currentDailyBudget = source.currentDailyBudget ?? 0
  const dailyGap = source.recommendedDailyBudget - currentDailyBudget
  const pacingPercent = Math.round(source.pacingRatio * 100)
  const pacingDetail = source.pacingRatio >= 1
    ? `${Math.round((source.pacingRatio - 1) * 100)}% ahead of expected spend`
    : `${Math.round((1 - source.pacingRatio) * 100)}% behind expected spend`

  return [
    {
      label: 'Pacing ratio',
      value: `${pacingPercent}%`,
      detail: pacingDetail,
    },
    {
      label: 'Spend vs expected',
      value: formatSignedCurrency(spendGap, locale),
      detail: `${formatCurrency(source.mtdSpend, locale)} spent vs ${formatCurrency(source.expectedToDate, locale)} expected`,
    },
    {
      label: 'Projected variance',
      value: formatSignedCurrency(projectedGap, locale),
      detail: `${formatCurrency(source.projectedMonthEnd, locale)} projected vs ${formatCurrency(source.budget, locale)} budget`,
    },
    {
      label: 'Daily budget change',
      value: `${formatSignedCurrency(dailyGap, locale)}/day`,
      detail: `${formatCurrency(currentDailyBudget, locale)}/day current to ${formatCurrency(source.recommendedDailyBudget, locale)}/day recommended`,
    },
    {
      label: 'Last synced',
      value: source.syncedAt ? formatBudgetHistoryTime(source.syncedAt, locale, timeZone) : 'Not synced',
      detail: source.syncedAt ? 'Fresh platform spend reduces recommendation risk' : 'Sync Meta or Google before applying changes',
    },
  ]
}

export function performanceSignalRows(source: PerformanceSignalSource, locale = 'en-AU'): PacingSignalRow[] {
  const rows: PacingSignalRow[] = []
  if (source.impressions > 0 || source.clicks > 0) {
    rows.push({
      label: 'CTR',
      value: source.ctr == null ? '-' : formatPercent(source.ctr),
      detail: `${formatInteger(source.clicks, locale)} clicks from ${formatInteger(source.impressions, locale)} impressions`,
    })
  }
  if (source.conversions > 0 || source.costPerConversion != null) {
    rows.push({
      label: 'Cost per conversion',
      value: source.costPerConversion == null ? '-' : formatCurrency(source.costPerConversion, locale),
      detail: `${formatInteger(source.conversions, locale)} conversions at ${source.conversionRate == null ? '-' : formatPercent(source.conversionRate)} conversion rate`,
    })
  }
  if (source.reach != null || source.frequency != null) {
    rows.push({
      label: 'Reach and frequency',
      value: `${source.reach == null ? '-' : formatInteger(source.reach, locale)} / ${source.frequency == null ? '-' : `${source.frequency.toFixed(2)}x`}`,
      detail: 'High frequency can accelerate spend without expanding reach',
    })
  }
  if (source.lostImpressionShareBudget != null || source.lostImpressionShareRank != null) {
    rows.push({
      label: 'Google impression share lost',
      value: `${source.lostImpressionShareBudget == null ? '-' : formatPercent(source.lostImpressionShareBudget)} budget / ${source.lostImpressionShareRank == null ? '-' : formatPercent(source.lostImpressionShareRank)} rank`,
      detail: 'Budget and rank limits can explain under-delivery',
    })
  }
  if (source.bidStrategy || source.budgetType) {
    rows.push({
      label: 'Bid and budget setup',
      value: `${titleCaseEnum(source.bidStrategy) || '-'} / ${titleCaseEnum(source.budgetType) || '-'}`,
      detail: 'Platform configuration that affects pacing behavior',
    })
  }
  return rows
}

export function matchingPlannedBudgetAction<T extends PlannedBudgetActionLike>(actions: T[], recommendedDailyBudget: number): T | null {
  const expected = roundMoney(recommendedDailyBudget)
  return actions.find((action) => {
    if (action.actionType !== 'budget_update' || !['planned', 'approved'].includes(action.actionStatus)) return false
    const dailyBudget = Number(action.newValue?.dailyBudget)
    return Number.isFinite(dailyBudget) && roundMoney(dailyBudget) === expected
  }) ?? null
}

function formatCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function formatInteger(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value || 0)
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function formatSignedCurrency(value: number, locale: string) {
  const formatted = formatCurrency(Math.abs(value), locale)
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

function titleCaseEnum(value: string | null) {
  if (!value) return ''
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
