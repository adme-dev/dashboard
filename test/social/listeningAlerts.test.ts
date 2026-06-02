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
