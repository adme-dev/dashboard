import { describe, expect, it } from 'vitest'

import { reconcileGooglePmaxInventoryBudget } from '~~/server/utils/googleCampaignBudgetReconciliation'

const cpFordFields = [
  { fieldKey: 'pmax_type', value: 'inventory' },
  { fieldKey: 'budget_period', value: 'fixed_flight' },
  { fieldKey: 'allocated_total', value: 1_000 },
  { fieldKey: 'budget_currency', value: 'AUD' },
  { fieldKey: 'start_date', value: '2026-07-17' },
  { fieldKey: 'end_date', value: '2026-07-31' }
]

describe('reconcileGooglePmaxInventoryBudget', () => {
  it('returns the CP Ford fixed-flight contract without treating pace as provider total', () => {
    const result = reconcileGooglePmaxInventoryBudget({
      templateSlug: 'google-pmax',
      fieldValues: cpFordFields
    })

    expect(result).toMatchObject({
      status: 'ready',
      launchBlocked: false,
      calculationTimezone: 'Australia/Melbourne',
      accountValidation: 'pending',
      contract: {
        currency: 'AUD',
        period: 'CUSTOM_PERIOD',
        campaignDays: 15,
        allocatedTotal: 1_000,
        calculatedDailyPace: 1_000 / 15,
        provider: {
          totalAmountMicros: '1000000000',
          amountMicros: null
        }
      }
    })
  })

  it('blocks a legacy brief whose only monetary value is daily_budget', () => {
    const result = reconcileGooglePmaxInventoryBudget({
      templateSlug: 'google-pmax',
      fieldValues: [
        { fieldKey: 'pmax_type', value: 'inventory' },
        { fieldKey: 'daily_budget', value: 66.67 },
        { fieldKey: 'start_date', value: '2026-07-17' },
        { fieldKey: 'end_date', value: '2026-07-31' }
      ]
    })

    expect(result).toMatchObject({
      status: 'legacy_ambiguous',
      launchBlocked: true,
      legacyDailyBudget: 66.67,
      displayCurrency: null,
      contract: null
    })
    expect(result?.remediation).toContain('approved total allocation')
    expect(result?.remediation).toContain('not infer it from the legacy daily budget')
  })

  it('blocks a legacy daily-only PMax brief even when its historical subtype is missing', () => {
    const result = reconcileGooglePmaxInventoryBudget({
      templateSlug: 'google-pmax',
      fieldValues: [
        { fieldKey: 'daily_budget', value: 66.67 },
        { fieldKey: 'start_date', value: '2026-07-17' },
        { fieldKey: 'end_date', value: '2026-07-31' }
      ]
    })

    expect(result).toMatchObject({
      status: 'legacy_ambiguous',
      launchBlocked: true,
      code: 'BUDGET_LEGACY_DAILY_AMBIGUOUS'
    })
  })

  it.each([true, [1_000], { total: 1_000 }])('rejects non-scalar allocation JSON %j', (allocatedTotal) => {
    const result = reconcileGooglePmaxInventoryBudget({
      templateSlug: 'google-pmax',
      fieldValues: cpFordFields.map(field => (
        field.fieldKey === 'allocated_total' ? { ...field, value: allocatedTotal } : field
      ))
    })

    expect(result).toMatchObject({
      status: 'invalid',
      launchBlocked: true,
      code: 'BUDGET_ALLOCATION_INVALID'
    })
  })

  it('accepts historical Inventory casing while new submissions remain canonical', () => {
    const result = reconcileGooglePmaxInventoryBudget({
      templateSlug: 'google-pmax',
      fieldValues: cpFordFields.map(field => (
        field.fieldKey === 'pmax_type' ? { ...field, value: 'Inventory' } : field
      ))
    })

    expect(result).toMatchObject({ status: 'ready', launchBlocked: false })
  })

  it.each([
    ['missing allocation', cpFordFields.filter(field => field.fieldKey !== 'allocated_total'), 'BUDGET_ALLOCATION_MISSING'],
    ['non-numeric allocation', cpFordFields.map(field => field.fieldKey === 'allocated_total' ? { ...field, value: 'daily pace' } : field), 'BUDGET_ALLOCATION_INVALID'],
    ['invalid allocation', cpFordFields.map(field => field.fieldKey === 'allocated_total' ? { ...field, value: 0 } : field), 'BUDGET_ALLOCATION_INVALID'],
    ['reversed dates', cpFordFields.map(field => field.fieldKey === 'end_date' ? { ...field, value: '2026-07-16' } : field), 'BUDGET_DATE_RANGE_INVALID']
  ])('blocks %s with actionable remediation', (_label, fieldValues, code) => {
    const result = reconcileGooglePmaxInventoryBudget({
      templateSlug: 'google-pmax',
      fieldValues
    })

    expect(result).toMatchObject({
      status: 'invalid',
      launchBlocked: true,
      code,
      contract: null
    })
    expect(result?.remediation).toBeTruthy()
  })

  it('does not reconcile PMax Standard or unrelated briefs in the Inventory-only release', () => {
    expect(reconcileGooglePmaxInventoryBudget({
      templateSlug: 'google-pmax',
      fieldValues: cpFordFields.map(field => field.fieldKey === 'pmax_type' ? { ...field, value: 'standard' } : field)
    })).toBeNull()

    expect(reconcileGooglePmaxInventoryBudget({
      templateSlug: 'facebook-ads',
      fieldValues: cpFordFields
    })).toBeNull()
  })
})
