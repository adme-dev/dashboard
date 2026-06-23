// Safety rails for Ops Autopilot activation:
//  - escalation notify allowlist (cap fan-out during gradual rollout — mirrors
//    ANOMALY_NOTIFY_ALLOWLIST; protects C1 pacing's first-run email burst).
//  - lifecycle-guard kill switch (the guard is wired live with no off-switch).
import { describe, it, expect, afterEach } from 'vitest'
import { parseNotifyAllowlist, applyNotifyAllowlist } from '~~/server/utils/automation/notifyEscalation'
import { isLifecycleGuardEnabled } from '~~/server/utils/automation/lifecycleGuard'

describe('escalation notify allowlist', () => {
  it('treats unset / empty / comma-only as null (full fan-out)', () => {
    expect(parseNotifyAllowlist(undefined)).toBeNull()
    expect(parseNotifyAllowlist('')).toBeNull()
    expect(parseNotifyAllowlist('   ')).toBeNull()
    expect(parseNotifyAllowlist(' , ,')).toBeNull()
  })

  it('parses a comma list, trimming and lowercasing', () => {
    expect(parseNotifyAllowlist(' Paul@Adme.net.au , B@Y.com '))
      .toEqual(new Set(['paul@adme.net.au', 'b@y.com']))
  })

  it('null allowlist passes every recipient through (current behaviour)', () => {
    const r = [{ id: '1', email: 'a@x.com' }, { id: '2', email: null }]
    expect(applyNotifyAllowlist(r, null)).toEqual(r)
  })

  it('caps recipients to allowlisted emails (case-insensitive) and drops null emails', () => {
    const r = [
      { id: '1', email: 'Paul@Adme.net.au' },
      { id: '2', email: 'other@x.com' },
      { id: '3', email: null }
    ]
    expect(applyNotifyAllowlist(r, new Set(['paul@adme.net.au'])).map(x => x.id)).toEqual(['1'])
  })
})

describe('lifecycle guard kill switch', () => {
  const prev = process.env.LIFECYCLE_GUARD_ENABLED
  afterEach(() => {
    if (prev === undefined) delete process.env.LIFECYCLE_GUARD_ENABLED
    else process.env.LIFECYCLE_GUARD_ENABLED = prev
  })

  it('defaults to OFF (dormant) when unset', () => {
    delete process.env.LIFECYCLE_GUARD_ENABLED
    expect(isLifecycleGuardEnabled()).toBe(false)
  })

  it('only the exact string "true" enables it', () => {
    process.env.LIFECYCLE_GUARD_ENABLED = 'false'
    expect(isLifecycleGuardEnabled()).toBe(false)
    process.env.LIFECYCLE_GUARD_ENABLED = '1'
    expect(isLifecycleGuardEnabled()).toBe(false)
    process.env.LIFECYCLE_GUARD_ENABLED = 'true'
    expect(isLifecycleGuardEnabled()).toBe(true)
  })
})
