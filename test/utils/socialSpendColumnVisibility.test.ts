import { describe, expect, it } from 'vitest'
import {
  defaultSocialSpendColumnVisibility,
  socialSpendColumnCount,
  socialSpendVisibleColumnIds,
} from '~~/app/utils/socialSpendColumnVisibility'

describe('socialSpendColumnVisibility', () => {
  it('hides commission by default while keeping pacing and variance visible', () => {
    expect(defaultSocialSpendColumnVisibility()).toMatchObject({
      aiPacing: true,
      pacing: true,
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
      'bankCharged',
      'aiPacing',
      'pacing',
      'commission',
      'variance',
    ])
  })

  it('counts table columns after hidden optional columns and unavailable bank data are removed', () => {
    expect(socialSpendColumnCount({
      hasBankData: false,
      visibility: {
        ...defaultSocialSpendColumnVisibility(),
        aiPacing: false,
        pacing: false,
        commission: false,
      },
    })).toBe(6)
  })
})
