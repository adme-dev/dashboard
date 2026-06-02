import { describe, it, expect } from 'vitest'
import { isListeningAlertsEnabled, parseAlertAllowlist, detectVolumeSpike } from '~~/server/utils/socialListening/alerts'

describe('isListeningAlertsEnabled', () => {
  it('only true for the exact string "true"', () => {
    expect(isListeningAlertsEnabled({ SOCIAL_LISTENING_ALERTS_ENABLED: 'true' })).toBe(true)
    expect(isListeningAlertsEnabled({ SOCIAL_LISTENING_ALERTS_ENABLED: 'TRUE' })).toBe(false)
    expect(isListeningAlertsEnabled({})).toBe(false)
  })
})

describe('parseAlertAllowlist', () => {
  it('lowercases, trims, dedupes; empty/unset → empty set', () => {
    expect([...parseAlertAllowlist('A@x.com, b@y.com , a@x.com')]).toEqual(['a@x.com', 'b@y.com'])
    expect(parseAlertAllowlist(undefined).size).toBe(0)
    expect(parseAlertAllowlist('   ').size).toBe(0)
  })
})

describe('detectVolumeSpike', () => {
  it('flags when today exceeds the baseline mean by the multiplier and clears the floor', () => {
    expect(detectVolumeSpike(20, [2, 3, 2, 3], { minToday: 5, multiplier: 3 }).spiked).toBe(true)
  })
  it('does not flag below the absolute floor even if ratio is high', () => {
    expect(detectVolumeSpike(4, [0, 0, 0], { minToday: 5, multiplier: 3 }).spiked).toBe(false)
  })
  it('does not flag when within normal range', () => {
    expect(detectVolumeSpike(6, [5, 6, 7], { minToday: 5, multiplier: 3 }).spiked).toBe(false)
  })
  it('no baseline → not a spike (avoids day-one false alarms)', () => {
    expect(detectVolumeSpike(50, [], { minToday: 5, multiplier: 3 }).spiked).toBe(false)
  })
})

import { dispatchListeningAlerts } from '~~/server/utils/socialListening/alerts'
import { vi } from 'vitest'

const baseDeps = (env: any, negs: any[] = [], recips: any[] = [{ id: 'u1' }]) => {
  const db = {
    queryRows: vi.fn(async (sql: string) => /team_members/.test(sql) ? recips : negs),
    execute: vi.fn(async () => 1),
  }
  const notify = vi.fn(async () => null as any)
  return { deps: { db, env, notify, baseUrl: 'https://x' }, db, notify }
}

describe('dispatchListeningAlerts gating', () => {
  it('no-op when gate off', async () => {
    const { deps, notify } = baseDeps({ SOCIAL_LISTENING_NOTIFY_ALLOWLIST: 'a@x.com' })
    expect(await dispatchListeningAlerts(deps as any)).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })
  it('no-op when allowlist empty even if gate on', async () => {
    const { deps, notify } = baseDeps({ SOCIAL_LISTENING_ALERTS_ENABLED: 'true' })
    expect(await dispatchListeningAlerts(deps as any)).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })
  it('notifies each recipient per negative mention and stamps alerted_at when fully enabled', async () => {
    const { deps, db, notify } = baseDeps(
      { SOCIAL_LISTENING_ALERTS_ENABLED: 'true', SOCIAL_LISTENING_NOTIFY_ALLOWLIST: 'a@x.com' },
      [{ id: 'm1', client_id: 'c1', title: 'awful', content: null, url: null }],
      [{ id: 'u1' }, { id: 'u2' }],
    )
    expect(await dispatchListeningAlerts(deps as any)).toBe(2)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('alerted_at = NOW()'), ['m1'])
  })
})
