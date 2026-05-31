import { describe, it, expect } from 'vitest'
import { parseRange } from '../../../../server/utils/tracking/analytics-range'

describe('parseRange', () => {
  it('defaults to ~30 days when from/to absent', () => {
    const r = parseRange({}, () => new Date('2026-05-31T00:00:00Z'))
    expect(r.toExclusive.getTime() - r.from.getTime()).toBeGreaterThan(29 * 864e5)
  })
  it('makes "to" end-of-day exclusive (to + 1 day)', () => {
    const r = parseRange({ from: '2026-05-01', to: '2026-05-01' }, () => new Date('2026-05-31T00:00:00Z'))
    expect(r.toExclusive.toISOString().slice(0, 10)).toBe('2026-05-02')
  })
  it('throws when from > to', () => {
    expect(() => parseRange({ from: '2026-05-10', to: '2026-05-01' }, () => new Date())).toThrow()
  })
  it('caps ranges longer than 366 days', () => {
    expect(() => parseRange({ from: '2020-01-01', to: '2026-01-01' }, () => new Date())).toThrow()
  })
})
