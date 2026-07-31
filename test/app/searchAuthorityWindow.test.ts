import { describe, expect, it } from 'vitest'
import { normalizeSearchAuthorityWindow } from '~~/app/utils/searchAuthorityWindow'

const fallback = {
  startDate: '2026-07-04',
  endDate: '2026-07-31'
}

describe('Search Authority evidence window', () => {
  it('uses the overview window for an initial empty selection', () => {
    expect(normalizeSearchAuthorityWindow('', '', fallback)).toEqual(fallback)
  })

  it('replaces a half-cleared selection as one atomic window', () => {
    expect(normalizeSearchAuthorityWindow('2026-07-10', '', fallback)).toEqual(fallback)
    expect(normalizeSearchAuthorityWindow('', '2026-07-20', fallback)).toEqual(fallback)
  })

  it('preserves a complete operator-selected window', () => {
    expect(normalizeSearchAuthorityWindow(
      '2026-07-10',
      '2026-07-20',
      fallback
    )).toEqual({
      startDate: '2026-07-10',
      endDate: '2026-07-20'
    })
  })
})
