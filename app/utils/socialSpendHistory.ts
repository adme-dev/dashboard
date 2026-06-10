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

function formatCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatSignedCurrency(value: number, locale: string) {
  const formatted = formatCurrency(Math.abs(value), locale)
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}
