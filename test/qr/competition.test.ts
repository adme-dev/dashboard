import { describe, it, expect } from 'vitest'
import { CompetitionDetailsSchema, permitLikelyRequired, defaultPermits, generateTerms, totalPrizeValue } from '../../shared/qr/competition'

const details = () => CompetitionDetailsSchema.parse({
  promoter: { legal_name: 'Frankston Motor Group Pty Ltd', abn: '12 345 678 901' },
  prize_items: [{ name: 'Weekend away', value: 4000, quantity: 1 }, { name: 'Fuel card', value: 500, quantity: 4 }],
  eligibility: { states: ['VIC', 'NSW', 'ACT', 'SA', 'NT'] }
})

describe('permit rules', () => {
  it('flags by state threshold for chance draws', () => {
    expect(permitLikelyRequired('NSW', 'chance', 10_000).required).toBe(false)
    expect(permitLikelyRequired('NSW', 'chance', 10_001).required).toBe(true)
    expect(permitLikelyRequired('ACT', 'chance', 3_001).required).toBe(true)
    expect(permitLikelyRequired('SA', 'chance', 100, { scratchAndWin: true }).required).toBe(true)
    expect(permitLikelyRequired('NT', 'chance', 6_000, { holdsOtherPermit: true }).required).toBe(false)
    expect(permitLikelyRequired('VIC', 'chance', 1_000_000).required).toBe(false)
  })
  it('never flags skill competitions', () => {
    expect(permitLikelyRequired('ACT', 'skill', 50_000).required).toBe(false)
  })
  it('seeds permit rows from eligible states and prize pool', () => {
    const d = details()
    expect(totalPrizeValue(d)).toBe(6000)
    const rows = defaultPermits(d, 'chance')
    expect(rows.map(r => `${r.state}:${r.status}`)).toEqual(['VIC:not_required', 'NSW:not_required', 'ACT:to_apply', 'SA:to_apply', 'NT:to_apply'])
  })
})

describe('generateTerms', () => {
  it('renders every required section and the permit numbers', () => {
    const md = generateTerms({
      name: 'Win a weekend away', type: 'chance', timezone: 'Australia/Melbourne',
      opensAt: '2026-09-01T00:00:00+10:00', closesAt: '2026-09-30T13:59:59+10:00',
      details: details(),
      permits: [{ state: 'ACT', required: 'auto', status: 'approved', permit_number: 'ACT TP 26/01234', applied_at: null, approved_at: null, expires_at: null, document_id: null, note: '' }]
    })
    for (const h of ['## 1. Promoter', '## 2. Eligibility', '## 3. Promotion period', '## 5. Draw', '## 6. Prizes', '## 7. Winner notification', '## 9. Verification', '## 10. Privacy', '## 12. Permits']) expect(md).toContain(h)
    expect(md).toContain('ABN 12 345 678 901')
    expect(md).toContain('Total prize pool $6,000')
    expect(md).toContain('4 × Fuel card — $500 each')
    expect(md).toContain('- ACT: ACT TP 26/01234')
    expect(md).toContain('aged 18 years or over')
  })
  it('is deterministic for the same input', () => {
    const args = { name: 'X', type: 'skill' as const, timezone: 'Australia/Sydney', opensAt: null, closesAt: null, details: details(), permits: [] }
    expect(generateTerms(args)).toBe(generateTerms(args))
    expect(generateTerms(args)).toContain('game of skill')
  })
})
