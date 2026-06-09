import { describe, expect, it } from 'vitest'
import { resolveGoogleManagerId } from '~~/server/utils/spendSync'

describe('resolveGoogleManagerId', () => {
  it('uses the configured login-customer-id, stripping dashes', () => {
    expect(
      resolveGoogleManagerId({
        configured: '525-047-3322',
        accessibleIds: ['111', '222'],
        connectionAccountIds: new Set(['111']),
      })
    ).toBe('5250473322')
  })

  it('falls back to the accessible id that is not a connected client account (the manager)', () => {
    expect(
      resolveGoogleManagerId({
        configured: '',
        accessibleIds: ['5977044329', '5250473322'],
        connectionAccountIds: new Set(['5977044329']),
      })
    ).toBe('5250473322')
  })

  it('falls back to the first accessible id when every accessible account is a connected client', () => {
    expect(
      resolveGoogleManagerId({
        configured: null,
        accessibleIds: ['111', '222'],
        connectionAccountIds: new Set(['111', '222']),
      })
    ).toBe('111')
  })

  it('returns undefined when there is nothing to resolve from', () => {
    expect(
      resolveGoogleManagerId({
        configured: '',
        accessibleIds: [],
        connectionAccountIds: new Set(),
      })
    ).toBeUndefined()
  })

  it('normalises dashed accessible ids before comparing against connected accounts', () => {
    expect(
      resolveGoogleManagerId({
        configured: '',
        accessibleIds: ['597-704-4329', '525-047-3322'],
        connectionAccountIds: new Set(['5977044329']),
      })
    ).toBe('5250473322')
  })
})
