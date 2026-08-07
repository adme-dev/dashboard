import {
  normalizeFixedFlightBudget,
  type FixedFlightBudgetContract
} from '~~/server/utils/googleCampaignBudgetContract'

export interface BudgetFieldValue {
  fieldKey: string
  value: unknown
}

export interface GoogleCampaignBudgetReconciliation {
  status: 'ready' | 'legacy_ambiguous' | 'invalid'
  launchBlocked: boolean
  code: string | null
  remediation: string | null
  calculationTimezone: string
  accountValidation: 'pending'
  legacyDailyBudget: number | null
  displayCurrency: string | null
  contract: FixedFlightBudgetContract | null
}

interface ReconciliationInput {
  templateSlug: string
  fieldValues: BudgetFieldValue[]
  calculationTimezone?: string
}

const DEFAULT_CALCULATION_TIMEZONE = 'Australia/Melbourne'

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function blocked(
  status: 'legacy_ambiguous' | 'invalid',
  code: string,
  remediation: string,
  calculationTimezone: string,
  legacyDailyBudget: number | null,
  displayCurrency: string | null
): GoogleCampaignBudgetReconciliation {
  return {
    status,
    launchBlocked: true,
    code,
    remediation,
    calculationTimezone,
    accountValidation: 'pending',
    legacyDailyBudget,
    displayCurrency,
    contract: null
  }
}

function remediationFor(code: string): string {
  switch (code) {
    case 'BUDGET_PERIOD_INVALID':
      return 'Set Budget Period to Fixed flight — total budget.'
    case 'BUDGET_CURRENCY_MISSING':
    case 'BUDGET_CURRENCY_INVALID':
      return 'Select the approved three-letter budget currency.'
    case 'BUDGET_DATE_INVALID':
      return 'Enter valid start and end dates for the fixed flight.'
    case 'BUDGET_DATE_RANGE_INVALID':
      return 'Set an end date on or after the start date.'
    case 'BUDGET_ALLOCATION_MISSING':
    case 'BUDGET_ALLOCATION_INVALID':
      return 'Enter a positive approved total allocation for the complete flight.'
    default:
      return 'Correct the budget fields before this brief can become launch-ready.'
  }
}

/**
 * Reconciles the brief-level contract only. The selected Google Ads account currency
 * and timezone remain an explicit preflight check once a connection is selected.
 */
export function reconcileGooglePmaxInventoryBudget(
  input: ReconciliationInput
): GoogleCampaignBudgetReconciliation | null {
  const fields = new Map(input.fieldValues.map(field => [field.fieldKey, field.value]))
  if (input.templateSlug !== 'google-pmax') return null

  const calculationTimezone = input.calculationTimezone || DEFAULT_CALCULATION_TIMEZONE
  const pmaxType = typeof fields.get('pmax_type') === 'string'
    ? (fields.get('pmax_type') as string).trim().toLowerCase()
    : ''
  if (pmaxType === 'standard') return null

  const rawCurrency = typeof fields.get('budget_currency') === 'string'
    ? (fields.get('budget_currency') as string).trim().toUpperCase()
    : ''
  const displayCurrency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null
  const rawAllocatedTotal = fields.get('allocated_total')
  const hasAllocatedTotal = rawAllocatedTotal !== null && rawAllocatedTotal !== undefined && rawAllocatedTotal !== ''
  const allocatedTotal = numberValue(rawAllocatedTotal)
  const legacyDailyBudget = numberValue(fields.get('daily_budget'))

  if (!hasAllocatedTotal && legacyDailyBudget !== null) {
    return blocked(
      'legacy_ambiguous',
      'BUDGET_LEGACY_DAILY_AMBIGUOUS',
      'Enter the approved total allocation for the complete flight; do not infer it from the legacy daily budget.',
      calculationTimezone,
      legacyDailyBudget,
      displayCurrency
    )
  }

  if (pmaxType !== 'inventory') {
    return blocked(
      'invalid',
      'PMAX_TYPE_INVALID',
      'Select a valid PMax campaign type before assessing launch readiness.',
      calculationTimezone,
      legacyDailyBudget,
      displayCurrency
    )
  }

  if (allocatedTotal === null) {
    const code = hasAllocatedTotal ? 'BUDGET_ALLOCATION_INVALID' : 'BUDGET_ALLOCATION_MISSING'
    return blocked('invalid', code, remediationFor(code), calculationTimezone, legacyDailyBudget, displayCurrency)
  }

  if (fields.get('budget_period') !== 'fixed_flight') {
    return blocked('invalid', 'BUDGET_PERIOD_INVALID', remediationFor('BUDGET_PERIOD_INVALID'), calculationTimezone, legacyDailyBudget, displayCurrency)
  }

  const currency = rawCurrency
  if (!currency) {
    return blocked('invalid', 'BUDGET_CURRENCY_MISSING', remediationFor('BUDGET_CURRENCY_MISSING'), calculationTimezone, legacyDailyBudget, displayCurrency)
  }

  const result = normalizeFixedFlightBudget({
    currency,
    // Actual account currency is checked later in preflight. Here both sides are
    // the brief currency so normalization validates structure without claiming it.
    accountCurrency: currency,
    accountTimezone: calculationTimezone,
    startDate: typeof fields.get('start_date') === 'string' ? fields.get('start_date') as string : '',
    endDate: typeof fields.get('end_date') === 'string' ? fields.get('end_date') as string : '',
    allocatedTotal
  })

  if (result.ok === false) {
    return blocked('invalid', result.code, remediationFor(result.code), calculationTimezone, legacyDailyBudget, displayCurrency)
  }

  return {
    status: 'ready',
    launchBlocked: false,
    code: null,
    remediation: null,
    calculationTimezone,
    accountValidation: 'pending',
    legacyDailyBudget,
    displayCurrency,
    contract: result.value
  }
}
