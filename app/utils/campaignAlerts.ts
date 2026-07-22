export interface CampaignAlertSource {
  [key: string]: unknown
  budget?: number | null
  budgetType?: string | null
  dailyBudget?: number | null
  dailySpend?: number | null
  endDate?: string | null
  monthlyBudget?: number | null
  monthlySpend?: number | null
  spend?: number | null
  zeroDays?: number | null
}

export interface CampaignAlert extends CampaignAlertSource {
  alertType: 'overspend' | 'underspend' | 'inactive'
  budgetAmount?: number
  budgetScope?: 'campaign_total' | 'daily_pacing'
  message: string
  severity: 'error' | 'warning'
  spendAmount?: number
}

interface CampaignAlertWindow {
  now: Date
  windowEnd: string
  windowStart: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const LIFETIME_BUDGET_TYPES = new Set([
  'campaign_total',
  'custom-period',
  'custom_period',
  'lifetime',
  'total'
])

function dateOnlyUtc(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return Number.NaN
  return Date.UTC(year, month - 1, day)
}

function inclusiveDays(start: string, end: string): number {
  const startMs = dateOnlyUtc(start)
  const endMs = dateOnlyUtc(end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 1
  return Math.floor((endMs - startMs) / DAY_MS) + 1
}

function daysInMonth(value: string): number {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return 30
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function daysUntil(endDate: string, now: Date): number | null {
  const endMs = dateOnlyUtc(endDate)
  if (!Number.isFinite(endMs)) return null
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.ceil((endMs - todayMs) / DAY_MS)
}

function numericValue(...values: unknown[]): number {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return 0
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

export function buildCampaignAlerts(
  campaigns: CampaignAlertSource[],
  window: CampaignAlertWindow
): CampaignAlert[] {
  const alerts: CampaignAlert[] = []
  const observedDays = inclusiveDays(window.windowStart, window.windowEnd)
  const periodDays = daysInMonth(window.windowEnd)

  for (const campaign of campaigns) {
    const budget = numericValue(campaign.budget, campaign.monthlyBudget, campaign.dailyBudget)
    const spend = numericValue(campaign.spend, campaign.monthlySpend, campaign.dailySpend)
    const zeroDays = numericValue(campaign.zeroDays)
    const budgetType = String(campaign.budgetType || '').toLowerCase()
    const isCampaignTotal = LIFETIME_BUDGET_TYPES.has(budgetType)

    if (budget > 0 && isCampaignTotal) {
      const ratio = spend / budget
      const remainingPct = Math.max(0, Math.round((1 - ratio) * 100))
      const remainingDays = campaign.endDate ? daysUntil(campaign.endDate, window.now) : null

      if (ratio > 1.2) {
        alerts.push({
          ...campaign,
          alertType: 'overspend',
          severity: 'error',
          message: `${Math.round((ratio - 1) * 100)}% over campaign-total budget`,
          spendAmount: roundCurrency(spend),
          budgetAmount: roundCurrency(budget),
          budgetScope: 'campaign_total'
        })
      } else if (spend > 0 && ratio < 0.7 && remainingDays !== null && remainingDays >= 0 && remainingDays <= 14) {
        alerts.push({
          ...campaign,
          alertType: 'underspend',
          severity: 'warning',
          message: `${remainingPct}% of campaign-total budget remaining · ends in ${remainingDays} days`,
          spendAmount: roundCurrency(spend),
          budgetAmount: roundCurrency(budget),
          budgetScope: 'campaign_total'
        })
      }
    } else if (budget > 0) {
      const averageDailySpend = spend / observedDays
      const dailyPacingTarget = budget / periodDays
      const ratio = dailyPacingTarget > 0 ? averageDailySpend / dailyPacingTarget : 0

      if (ratio > 1.2) {
        alerts.push({
          ...campaign,
          alertType: 'overspend',
          severity: 'error',
          message: `${Math.round((ratio - 1) * 100)}% over daily pacing target`,
          spendAmount: roundCurrency(averageDailySpend),
          budgetAmount: roundCurrency(dailyPacingTarget),
          budgetScope: 'daily_pacing'
        })
      } else if (ratio < 0.7 && spend > 0) {
        alerts.push({
          ...campaign,
          alertType: 'underspend',
          severity: 'warning',
          message: `${Math.round((1 - ratio) * 100)}% under daily pacing target`,
          spendAmount: roundCurrency(averageDailySpend),
          budgetAmount: roundCurrency(dailyPacingTarget),
          budgetScope: 'daily_pacing'
        })
      }
    }

    if (zeroDays >= 2) {
      alerts.push({
        ...campaign,
        alertType: 'inactive',
        severity: 'error',
        message: `$0 spend for ${zeroDays} days`
      })
    }
  }

  return alerts
}
