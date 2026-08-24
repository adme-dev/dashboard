import { describe, it, expect } from 'vitest'
import { fillDays, parseQrRange } from '../../server/utils/qr/analytics'

describe('qr analytics helpers', () => {
  it('fills missing days with zero', () => {
    expect(fillDays('2026-08-01', '2026-08-03', [{ day: '2026-08-02', scans: 4, unique: 3 }])).toEqual([
      { day: '2026-08-01', scans: 0, unique: 0 }, { day: '2026-08-02', scans: 4, unique: 3 }, { day: '2026-08-03', scans: 0, unique: 0 },
    ])
  })
  it('defaults range to the last 30 days and rejects >366 days', () => {
    const r = parseQrRange({}, new Date('2026-08-24T00:00:00Z'))
    expect(r).toEqual({ from: '2026-07-26', to: '2026-08-24' })
    expect(() => parseQrRange({ from: '2024-01-01', to: '2026-08-24' }, new Date('2026-08-24'))).toThrow()
  })
})
