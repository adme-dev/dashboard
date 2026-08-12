import { describe, expect, it } from 'vitest'

import {
  normalizeFixedFlightBudget,
  validateProviderBudgetAmounts
} from '~~/server/utils/googleCampaignBudgetContract'

describe('normalizeFixedFlightBudget', () => {
  it('preserves the CP Ford allocation as the custom-period provider total', () => {
    const result = normalizeFixedFlightBudget({
      currency: 'AUD',
      accountCurrency: 'AUD',
      accountTimezone: 'Australia/Melbourne',
      startDate: '2026-07-17',
      endDate: '2026-07-31',
      allocatedTotal: 1_000
    })

    expect(result).toEqual({
      ok: true,
      value: {
        currency: 'AUD',
        period: 'CUSTOM_PERIOD',
        startDate: '2026-07-17',
        endDate: '2026-07-31',
        campaignDays: 15,
        allocatedTotal: 1_000,
        dailyBudget: null,
        calculatedDailyPace: 1_000 / 15,
        provider: {
          totalAmountMicros: '1000000000',
          amountMicros: null
        }
      }
    })

    if (!result.ok) throw new Error(result.message)
    expect(result.value.calculatedDailyPace.toFixed(2)).toBe('66.67')
    expect(result.value.provider.totalAmountMicros).not.toBe('66670000')
  })

  it.each([
    ['a year boundary', '2026-12-31', '2027-01-02', 3],
    ['Melbourne daylight-saving transition dates', '2026-10-04', '2026-10-06', 3]
  ])('counts inclusive calendar days across %s', (_label, startDate, endDate, campaignDays) => {
    const result = normalizeFixedFlightBudget({
      currency: 'AUD',
      accountCurrency: 'AUD',
      accountTimezone: 'Australia/Melbourne',
      startDate,
      endDate,
      allocatedTotal: 300
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.campaignDays).toBe(campaignDays)
    expect(result.value.calculatedDailyPace).toBe(100)
  })

  it.each([
    [
      'BUDGET_CURRENCY_MISMATCH',
      { currency: 'AUD', accountCurrency: 'USD' }
    ],
    [
      'BUDGET_TIMEZONE_INVALID',
      { accountTimezone: 'Australia/Not_A_Zone' }
    ],
    [
      'BUDGET_DATE_RANGE_INVALID',
      { startDate: '2026-08-01', endDate: '2026-07-31' }
    ],
    [
      'BUDGET_ALLOCATION_INVALID',
      { allocatedTotal: 0 }
    ]
  ])('returns %s for an invalid fixed-flight contract', (code, overrides) => {
    const result = normalizeFixedFlightBudget({
      currency: 'AUD',
      accountCurrency: 'AUD',
      accountTimezone: 'Australia/Melbourne',
      startDate: '2026-07-17',
      endDate: '2026-07-31',
      allocatedTotal: 1_000,
      ...overrides
    })

    expect(result).toMatchObject({ ok: false, code })
  })
})

describe('validateProviderBudgetAmounts', () => {
  it('rejects daily and total provider amount fields coexisting', () => {
    expect(validateProviderBudgetAmounts('CUSTOM_PERIOD', {
      totalAmountMicros: '1000000000',
      amountMicros: '66670000'
    })).toMatchObject({
      ok: false,
      code: 'BUDGET_PROVIDER_AMOUNTS_CONFLICT'
    })
  })

  it('requires the provider field that corresponds to the budget period', () => {
    expect(validateProviderBudgetAmounts('CUSTOM_PERIOD', {
      totalAmountMicros: null,
      amountMicros: '66670000'
    })).toMatchObject({
      ok: false,
      code: 'BUDGET_PROVIDER_AMOUNT_PERIOD_MISMATCH'
    })

    expect(validateProviderBudgetAmounts('DAILY', {
      totalAmountMicros: null,
      amountMicros: '66670000'
    })).toEqual({ ok: true })
  })
})
