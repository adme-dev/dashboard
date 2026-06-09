import { describe, expect, it } from 'vitest'
import { assertResolvableSources } from '~~/server/utils/video-generation/sourceAssetStore'

const row = (over = {}) => ({ id: 'a1', client_id: 'dealer-1', r2_key: 'k1', status: 'approved', ...over })

describe('assertResolvableSources', () => {
  it('returns rows in id order when all are approved and owned', () => {
    const rows = [row({ id: 'a2', r2_key: 'k2' }), row({ id: 'a1' })]
    const out = assertResolvableSources(rows as any, ['a1', 'a2'], 'dealer-1')
    expect(out.map((r) => r.id)).toEqual(['a1', 'a2'])
  })
  it('throws when an id is missing', () => {
    expect(() => assertResolvableSources([row()] as any, ['a1', 'a2'], 'dealer-1')).toThrow(/source asset a2 not found/)
  })
  it('throws when a source is not approved', () => {
    expect(() => assertResolvableSources([row({ status: 'pending' })] as any, ['a1'], 'dealer-1')).toThrow(/not approved/)
  })
  it('throws on cross-tenant reference', () => {
    expect(() => assertResolvableSources([row({ client_id: 'other' })] as any, ['a1'], 'dealer-1')).toThrow(/not owned/)
  })
  it('allows agency-owned (client_id null) sources for any tenant', () => {
    expect(assertResolvableSources([row({ client_id: null })] as any, ['a1'], 'dealer-1').length).toBe(1)
  })
})
