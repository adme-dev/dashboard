import { describe, it, expect } from 'vitest'
import { periodBounds, resolveByName } from '~~/server/utils/ai/tools/economics'

describe('periodBounds', () => {
  const now = new Date('2026-06-07T10:00:00Z')

  it('mtd → first..last of the current month + single media period', () => {
    const b = periodBounds('mtd', now)
    expect(b.start).toBe('2026-06-01')
    expect(b.end).toBe('2026-06-30')
    expect(b.mediaPeriods).toEqual(['2026-06'])
  })

  it('ytd → Jan 1..today + one media period per elapsed month', () => {
    const b = periodBounds('ytd', now)
    expect(b.start).toBe('2026-01-01')
    expect(b.end).toBe('2026-06-07')
    expect(b.mediaPeriods).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
  })
})

describe('resolveByName', () => {
  const rows = [{ name: 'Acme Corp' }, { name: 'Acme Media' }, { name: 'Globex' }]

  it('exact case-insensitive match wins even when substrings also match', () => {
    expect(resolveByName([{ name: 'Acme' }, { name: 'Acme Corp' }], 'acme').match).toEqual({ name: 'Acme' })
  })
  it('single substring match resolves', () => {
    expect(resolveByName(rows, 'globe').match).toEqual({ name: 'Globex' })
  })
  it('multiple substring matches → no match, candidates listed', () => {
    const r = resolveByName(rows, 'acme')
    expect(r.match).toBeUndefined()
    expect(r.candidates).toHaveLength(2)
  })
  it('no match → empty', () => {
    expect(resolveByName(rows, 'zzz')).toEqual({ candidates: [] })
  })
})
