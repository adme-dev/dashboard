import { describe, it, expect } from 'vitest'
import { parseRange } from '../../../../server/utils/tracking/analytics-range'

describe('parseRange', () => {
  it('defaults to a ~30 day window when from/to absent', () => {
    const r = parseRange({}, () => new Date('2026-05-31T00:00:00Z'))
    expect(r.toDate).toBe('2026-05-31')
    expect(r.fromDate).toBe('2026-05-02') // 29 days earlier
  })
  it('returns the local date strings verbatim', () => {
    const r = parseRange({ from: '2026-05-01', to: '2026-05-10' }, () => new Date('2026-05-31T00:00:00Z'))
    expect(r.fromDate).toBe('2026-05-01')
    expect(r.toDate).toBe('2026-05-10')
  })
  it('throws when from > to', () => {
    expect(() => parseRange({ from: '2026-05-10', to: '2026-05-01' }, () => new Date())).toThrow()
  })
  it('caps ranges longer than 366 days', () => {
    expect(() => parseRange({ from: '2020-01-01', to: '2026-01-01' }, () => new Date())).toThrow()
  })
})
