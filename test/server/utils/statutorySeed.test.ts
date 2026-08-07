import { describe, it, expect } from 'vitest'
import { STATUTORY_SEEDS, nextWeekday, nextMonthlyDay, seedNoteFor } from '../../../server/utils/statutorySeed'

describe('statutory seed config', () => {
  it('contains exactly the four agreed obligations', () => {
    expect(STATUTORY_SEEDS.map(s => s.seedKey).sort()).toEqual([
      'ato-debt-instalment', 'sro-payroll-tax', 'super-weekly', 'wages-weekly'
    ])
  })

  it('never contains PAYGW or BAS entries (double-count guard)', () => {
    for (const s of STATUTORY_SEEDS) {
      const text = `${s.seedKey} ${s.supplier} ${s.description}`.toLowerCase()
      expect(text).not.toMatch(/paygw|pay-as-you-go|\bbas\b/)
    }
  })

  it('uses the spreadsheet working figures', () => {
    const byKey = Object.fromEntries(STATUTORY_SEEDS.map(s => [s.seedKey, s]))
    expect(byKey['wages-weekly']!.amountCents).toBe(1_650_000)
    expect(byKey['super-weekly']!.amountCents).toBe(240_000)
    expect(byKey['sro-payroll-tax']!.amountCents).toBe(50_000)
    expect(byKey['ato-debt-instalment']!.amountCents).toBe(600_000)
    expect(byKey['sro-payroll-tax']!.paymentAccount).toBe('NAB_TAX')
    expect(byKey['sro-payroll-tax']!.confidence).toBe('provisional')
  })
})

describe('anchor date helpers', () => {
  it('nextWeekday finds the next Friday', () => {
    // 2026-08-07 is a Friday → next Friday is the 14th (strictly after)
    expect(nextWeekday(new Date('2026-08-07T00:00:00Z'), 5)).toBe('2026-08-14')
    expect(nextWeekday(new Date('2026-08-05T00:00:00Z'), 5)).toBe('2026-08-07')
  })

  it('nextMonthlyDay rolls into next month when the day has passed', () => {
    expect(nextMonthlyDay(new Date('2026-08-07T00:00:00Z'), 7)).toBe('2026-09-07')
    expect(nextMonthlyDay(new Date('2026-08-07T00:00:00Z'), 13)).toBe('2026-08-13')
  })

  it('seedNoteFor leads with the seedKey marker', () => {
    expect(seedNoteFor(STATUTORY_SEEDS[0]!)).toMatch(/^seedKey:[a-z-]+ /)
  })
})
