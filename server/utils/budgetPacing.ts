export type CampaignPacingStatus =
  | 'campaign_ended'
  | 'no_budget'
  | 'no_spend'
  | 'critical_over_pacing'
  | 'warning_over_pacing'
  | 'on_track'
  | 'warning_under_pacing'

export interface CampaignBudgetPacingInput {
  monthlyBudget: number
  mtdSpend: number
  period: string
  now?: Date
  campaignStatus?: string | null
  endDate?: string | Date | null
}

export interface CampaignBudgetPacingResult {
  monthlyBudget: number
  mtdSpend: number
  mtdDifference: number
  currentDailyBudget: number
  newDailyBudget: number
  budgetConsumedPct: number
  monthElapsedPct: number
  pacingRatio: number
  pacingStatus: CampaignPacingStatus
  elapsedDays: number
  remainingDays: number
  daysInMonth: number
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100
const roundPct = (value: number): number => Math.round(value * 10) / 10
const roundRatio = (value: number): number => Math.round(value * 100) / 100

function parsePeriod(period: string): { year: number, month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
  return { year: Number(match[1]), month: Number(match[2]) }
}

function toDateOnly(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function isCampaignEnded(endDate: string | Date | null | undefined, now: Date): boolean {
  const end = toDateOnly(endDate)
  if (!end) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return end.getTime() < today.getTime()
}

function monthWindow(period: string, now: Date): { daysInMonth: number, elapsedDays: number, remainingDays: number } {
  const { year, month } = parsePeriod(period)
  const daysInMonth = new Date(year, month, 0).getDate()
  const currentMonth = now.getFullYear() === year && now.getMonth() + 1 === month
  const pastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)
  const elapsedDays = currentMonth ? now.getDate() : pastMonth ? daysInMonth : 0
  return {
    daysInMonth,
    elapsedDays,
    remainingDays: Math.max(daysInMonth - elapsedDays, 0),
  }
}

export function statusSeverityRank(status: CampaignPacingStatus): number {
  switch (status) {
    case 'critical_over_pacing': return 0
    case 'campaign_ended': return 1
    case 'no_spend': return 2
    case 'warning_over_pacing': return 3
    case 'warning_under_pacing': return 4
    case 'no_budget': return 5
    case 'on_track': return 6
  }
}

export function computeCampaignBudgetPacing(input: CampaignBudgetPacingInput): CampaignBudgetPacingResult {
  const now = input.now ?? new Date()
  const monthlyBudget = Number.isFinite(input.monthlyBudget) ? input.monthlyBudget : 0
  const mtdSpend = Number.isFinite(input.mtdSpend) ? input.mtdSpend : 0
  const mtdDifference = monthlyBudget - mtdSpend
  const { daysInMonth, elapsedDays, remainingDays } = monthWindow(input.period, now)

  const currentDailyBudget = elapsedDays > 0 ? mtdSpend / elapsedDays : 0
  const newDailyBudget = remainingDays > 0 ? mtdDifference / remainingDays : 0
  const budgetConsumedPct = monthlyBudget > 0 ? (mtdSpend / monthlyBudget) * 100 : 0
  const monthElapsedPct = daysInMonth > 0 ? (elapsedDays / daysInMonth) * 100 : 0
  const pacingRatio = monthElapsedPct > 0 && monthlyBudget > 0 ? budgetConsumedPct / monthElapsedPct : 0

  let pacingStatus: CampaignPacingStatus
  if (isCampaignEnded(input.endDate, now)) pacingStatus = 'campaign_ended'
  else if (monthlyBudget <= 0) pacingStatus = 'no_budget'
  else if (mtdSpend <= 0 && elapsedDays > 2) pacingStatus = 'no_spend'
  else if (pacingRatio >= 1.25) pacingStatus = 'critical_over_pacing'
  else if (pacingRatio >= 1.10) pacingStatus = 'warning_over_pacing'
  else if (pacingRatio <= 0.80 && elapsedDays > 7) pacingStatus = 'warning_under_pacing'
  else pacingStatus = 'on_track'

  return {
    monthlyBudget: roundMoney(monthlyBudget),
    mtdSpend: roundMoney(mtdSpend),
    mtdDifference: roundMoney(mtdDifference),
    currentDailyBudget: roundMoney(currentDailyBudget),
    newDailyBudget: roundMoney(newDailyBudget),
    budgetConsumedPct: roundPct(budgetConsumedPct),
    monthElapsedPct: roundPct(monthElapsedPct),
    pacingRatio: roundRatio(pacingRatio),
    pacingStatus,
    elapsedDays,
    remainingDays,
    daysInMonth,
  }
}
