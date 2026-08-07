export type GoogleBudgetPeriod = 'CUSTOM_PERIOD' | 'DAILY'

export interface CampaignBudgetContract {
  currency: string
  period: GoogleBudgetPeriod
  startDate: string
  endDate: string | null
  campaignDays: number | null
  allocatedTotal: number | null
  dailyBudget: number | null
  calculatedDailyPace: number | null
}

export interface GoogleProviderBudgetAmounts {
  totalAmountMicros: string | null
  amountMicros: string | null
}

export interface FixedFlightBudgetContract extends CampaignBudgetContract {
  period: 'CUSTOM_PERIOD'
  endDate: string
  campaignDays: number
  allocatedTotal: number
  dailyBudget: null
  calculatedDailyPace: number
  provider: {
    totalAmountMicros: string
    amountMicros: null
  }
}

export type NormalizedCampaignBudgetContract = FixedFlightBudgetContract

export interface FixedFlightBudgetInput {
  currency: string
  accountCurrency: string
  accountTimezone: string
  startDate: string
  endDate: string
  allocatedTotal: number
}

export type BudgetValidationError = {
  ok: false
  code: string
  message: string
}

export type BudgetValidationResult
  = | { ok: true, value: NormalizedCampaignBudgetContract }
    | BudgetValidationError

export type ProviderAmountValidationResult
  = | { ok: true }
    | BudgetValidationError

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MILLIS_PER_DAY = 86_400_000

function error(code: string, message: string): BudgetValidationError {
  return { ok: false, code, message }
}

function parseCalendarDate(value: string): number | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null

  return timestamp
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

function majorUnitsToMicros(value: number): string | null {
  const micros = Math.round(value * 1_000_000)
  return Number.isSafeInteger(micros) ? String(micros) : null
}

function isPositiveMicros(value: string | null): boolean {
  return value !== null && /^[1-9]\d*$/.test(value)
}

export function validateProviderBudgetAmounts(
  period: GoogleBudgetPeriod,
  amounts: GoogleProviderBudgetAmounts
): ProviderAmountValidationResult {
  const hasTotal = amounts.totalAmountMicros !== null
  const hasDaily = amounts.amountMicros !== null

  if (hasTotal && hasDaily) {
    return error(
      'BUDGET_PROVIDER_AMOUNTS_CONFLICT',
      'Daily and custom-period provider amount fields cannot coexist.'
    )
  }

  const matchesPeriod = period === 'CUSTOM_PERIOD'
    ? isPositiveMicros(amounts.totalAmountMicros) && !hasDaily
    : isPositiveMicros(amounts.amountMicros) && !hasTotal

  if (!matchesPeriod) {
    return error(
      'BUDGET_PROVIDER_AMOUNT_PERIOD_MISMATCH',
      period === 'CUSTOM_PERIOD'
        ? 'A custom-period budget requires only totalAmountMicros.'
        : 'A daily budget requires only amountMicros.'
    )
  }

  return { ok: true }
}

export function normalizeFixedFlightBudget(
  input: FixedFlightBudgetInput
): BudgetValidationResult {
  const currency = input.currency.trim().toUpperCase()
  const accountCurrency = input.accountCurrency.trim().toUpperCase()

  if (!/^[A-Z]{3}$/.test(currency) || !/^[A-Z]{3}$/.test(accountCurrency)) {
    return error('BUDGET_CURRENCY_INVALID', 'Budget and account currencies must be three-letter currency codes.')
  }

  if (currency !== accountCurrency) {
    return error('BUDGET_CURRENCY_MISMATCH', 'Budget currency must match the Google Ads account currency.')
  }

  if (!isValidTimezone(input.accountTimezone)) {
    return error('BUDGET_TIMEZONE_INVALID', 'Google Ads account timezone must be a valid IANA timezone.')
  }

  const startTimestamp = parseCalendarDate(input.startDate)
  const endTimestamp = parseCalendarDate(input.endDate)
  if (startTimestamp === null || endTimestamp === null) {
    return error('BUDGET_DATE_INVALID', 'Fixed-flight dates must be valid YYYY-MM-DD calendar dates.')
  }

  if (endTimestamp < startTimestamp) {
    return error('BUDGET_DATE_RANGE_INVALID', 'Fixed-flight end date cannot precede its start date.')
  }

  if (!Number.isFinite(input.allocatedTotal) || input.allocatedTotal <= 0) {
    return error('BUDGET_ALLOCATION_INVALID', 'Fixed-flight allocated total must be positive.')
  }

  const totalAmountMicros = majorUnitsToMicros(input.allocatedTotal)
  if (totalAmountMicros === null || totalAmountMicros === '0') {
    return error('BUDGET_ALLOCATION_INVALID', 'Fixed-flight allocated total cannot be represented safely in micros.')
  }

  const campaignDays = Math.floor((endTimestamp - startTimestamp) / MILLIS_PER_DAY) + 1
  const provider: FixedFlightBudgetContract['provider'] = {
    totalAmountMicros,
    amountMicros: null
  }
  const providerValidation = validateProviderBudgetAmounts('CUSTOM_PERIOD', provider)
  if (providerValidation.ok === false) return providerValidation

  return {
    ok: true,
    value: {
      currency,
      period: 'CUSTOM_PERIOD',
      startDate: input.startDate,
      endDate: input.endDate,
      campaignDays,
      allocatedTotal: input.allocatedTotal,
      dailyBudget: null,
      calculatedDailyPace: input.allocatedTotal / campaignDays,
      provider
    }
  }
}
