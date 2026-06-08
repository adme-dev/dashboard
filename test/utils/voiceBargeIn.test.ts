import { describe, expect, it } from 'vitest'
import { createBargeInDetector } from '~~/app/utils/voiceBargeIn'

describe('createBargeInDetector', () => {
  it('stays false below the threshold', () => {
    const d = createBargeInDetector({ threshold: 0.08, sustainMs: 300 })
    expect(d.sample(0.02, 0)).toBe(false)
    expect(d.sample(0.05, 1000)).toBe(false)
  })
  it('requires sustained speech above the threshold', () => {
    const d = createBargeInDetector({ threshold: 0.08, sustainMs: 300 })
    expect(d.sample(0.2, 0)).toBe(false) // first frame above — starts the clock
    expect(d.sample(0.2, 200)).toBe(false) // not long enough yet
    expect(d.sample(0.2, 300)).toBe(true) // sustained >= 300ms -> barge-in
  })
  it('resets the clock when speech drops below threshold', () => {
    const d = createBargeInDetector({ threshold: 0.08, sustainMs: 300 })
    expect(d.sample(0.2, 0)).toBe(false)
    expect(d.sample(0.01, 100)).toBe(false) // dropped — clock resets
    expect(d.sample(0.2, 200)).toBe(false) // restart; not yet 300 from 200
    expect(d.sample(0.2, 500)).toBe(true)
  })
  it('reset() clears state', () => {
    const d = createBargeInDetector({ threshold: 0.08, sustainMs: 300 })
    d.sample(0.2, 0)
    d.reset()
    expect(d.sample(0.2, 100)).toBe(false) // clock restarted at 100
  })
})
