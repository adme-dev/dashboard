import { describe, expect, it } from 'vitest'
import {
  defaultSocialSpendColumnVisibility,
  socialSpendColumnCount,
  socialSpendPresetVisibility,
  socialSpendVisibleColumnIds,
} from '~~/app/utils/socialSpendColumnVisibility'

describe('socialSpendColumnVisibility', () => {
  it('hides commission by default while keeping pacing and variance visible', () => {
    expect(defaultSocialSpendColumnVisibility()).toMatchObject({
      health: true,
      owner: true,
      budgetControl: true,
      reasonCodes: true,
      aiPacing: true,
      pacing: true,
      projectedMonthEnd: true,
      lastAction: true,
      commission: false,
      variance: true,
      variancePercent: true,
    })
  })

  it('returns visible optional columns in table order', () => {
    const visible = socialSpendVisibleColumnIds({
      hasBankData: true,
      visibility: {
        ...defaultSocialSpendColumnVisibility(),
        bankCharged: true,
        commission: true,
        variancePercent: false,
      },
    })

    expect(visible).toEqual([
      'client',
      'platform',
      'budget',
      'spend',
      'health',
      'owner',
      'budgetControl',
      'reasonCodes',
      'bankCharged',
      'aiPacing',
      'pacing',
      'projectedMonthEnd',
      'lastAction',
      'commission',
      'variance',
    ])
  })

  it('counts table columns after hidden optional columns and unavailable bank data are removed', () => {
    expect(socialSpendColumnCount({
      hasBankData: false,
      visibility: {
        ...defaultSocialSpendColumnVisibility(),
        health: false,
        owner: false,
        budgetControl: false,
        reasonCodes: false,
        aiPacing: false,
        pacing: false,
        projectedMonthEnd: false,
        lastAction: false,
        commission: false,
      },
    })).toBe(6)
  })

  it('provides a finance preset that restores commission and hides operational AI columns', () => {
    expect(socialSpendPresetVisibility('finance')).toMatchObject({
      bankCharged: true,
      owner: false,
      budgetControl: false,
      reasonCodes: false,
      aiPacing: false,
      pacing: false,
      projectedMonthEnd: true,
      lastAction: false,
      commission: true,
      variance: true,
    })
  })
})
