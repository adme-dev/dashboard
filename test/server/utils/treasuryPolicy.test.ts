import { describe, expect, it } from 'vitest'
import {
  deriveTaxTransferLines,
  deriveAmexPaydownLines,
  type TaxTransferConfig,
} from '../../../server/utils/treasuryPolicy'

// Kellie's actual August 2026 rule: $16k every Monday, skip the 1st Monday
// of the month. August 2026 Mondays: 3, 10, 17, 24, 31 → transfers 17/24/31
// within a mid-month horizon.
const KELLIE_CONFIG: TaxTransferConfig = {
  fromAccount: 'NAB_BUSINESS',
  toAccount: 'NAB_TAX',
  months: {
    '2026-08': { weeklyAmountCents: 1_600_000, skipMondays: [1, 2] }, // 3rd+10th already done
    '2026-09': { weeklyAmountCents: 1_100_000, skipMondays: [1] },
  },
}

describe('deriveTaxTransferLines', () => {
  it('generates Mondays with per-month amounts and skip rules', () => {
    const lines = deriveTaxTransferLines(
      KELLIE_CONFIG,
      new Date('2026-08-13T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
    )
    expect(lines.map(l => l.date)).toEqual([
      '2026-08-17', '2026-08-24', '2026-08-31',        // Aug, first two skipped
      '2026-09-14', '2026-09-21', '2026-09-28',        // Sep Mondays: 7(skip),14,21,28
    ])
    expect(lines.filter(l => l.date.startsWith('2026-08')).every(l => l.amountCents === 1_600_000)).toBe(true)
    expect(lines.filter(l => l.date.startsWith('2026-09')).every(l => l.amountCents === 1_100_000)).toBe(true)
    expect(lines.every(l => l.kind === 'internal_transfer')).toBe(true)
  })

  it('months without config and without default derive nothing', () => {
    const lines = deriveTaxTransferLines(
      KELLIE_CONFIG,
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-11-01T00:00:00Z'),
    )
    expect(lines).toEqual([])
  })

  it('falls back to default for unconfigured months', () => {
    const lines = deriveTaxTransferLines(
      { ...KELLIE_CONFIG, default: { weeklyAmountCents: 1_000_000, skipMondays: [1] } },
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-11-01T00:00:00Z'),
    )
    // Oct 2026 Mondays: 5(skip), 12, 19, 26
    expect(lines.map(l => l.date)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26'])
  })

  it('excludes lines outside the horizon', () => {
    const lines = deriveTaxTransferLines(
      KELLIE_CONFIG,
      new Date('2026-08-18T00:00:00Z'),
      new Date('2026-08-31T00:00:00Z'), // end exclusive — 31 Aug not included
    )
    expect(lines.map(l => l.date)).toEqual(['2026-08-24'])
  })
})

describe('deriveAmexPaydownLines', () => {
  const config = {
    payFromAccount: 'NAB_BUSINESS',
    tranches: [
      { date: '2026-08-13', amountCents: 5_000_000, label: 'Amex tranche 1' },
      { date: '2026-08-21', amountCents: 3_532_737 },
    ],
  }

  it('keeps tranches inside the horizon as real outflows', () => {
    const lines = deriveAmexPaydownLines(config, new Date('2026-08-10T00:00:00Z'), new Date('2026-11-10T00:00:00Z'))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ date: '2026-08-13', amountCents: 5_000_000, kind: 'amex_paydown' })
    expect(lines[1].label).toBe('Amex statement paydown')
  })

  it('drops past tranches', () => {
    const lines = deriveAmexPaydownLines(config, new Date('2026-08-15T00:00:00Z'), new Date('2026-11-10T00:00:00Z'))
    expect(lines.map(l => l.date)).toEqual(['2026-08-21'])
  })
})
