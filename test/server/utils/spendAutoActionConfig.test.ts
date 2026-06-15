import { describe, it, expect } from 'vitest'
import { mergeAutoActionPolicy, DEFAULT_AUTO_ACTION_POLICY } from '~~/server/utils/spendAutoActionConfig'

describe('mergeAutoActionPolicy', () => {
  it('defaults to disabled with all severities off', () => {
    expect(DEFAULT_AUTO_ACTION_POLICY.enabled).toBe(false)
    expect(DEFAULT_AUTO_ACTION_POLICY.perSeverity).toEqual({ critical: 'off', warning: 'off', info: 'off' })
  })
  it('overlays a stored partial over defaults', () => {
    const m = mergeAutoActionPolicy({ enabled: true, perSeverity: { critical: 'propose' } as any })
    expect(m.enabled).toBe(true)
    expect(m.perSeverity.critical).toBe('propose')
    expect(m.perSeverity.warning).toBe('off')
  })
  it('returns defaults for null/undefined', () => {
    expect(mergeAutoActionPolicy(null)).toEqual(DEFAULT_AUTO_ACTION_POLICY)
  })
})
