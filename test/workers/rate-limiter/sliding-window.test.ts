import { describe, it, expect } from 'vitest'
import { newWindow, checkAndCount, LruMap, type WindowState } from '../../../workers/rate-limiter/src/sliding-window'

describe('checkAndCount', () => {
  it('allows up to the limit within one window, then denies', () => {
    const s: WindowState = newWindow(0)
    const t = 1_000_000
    for (let i = 0; i < 3; i++) {
      expect(checkAndCount(s, t, 3, 10_000).allowed).toBe(true)
    }
    const denied = checkAndCount(s, t, 3, 10_000)
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterSec).toBeGreaterThan(0)
  })

  it('refills after the window fully elapses', () => {
    const s: WindowState = newWindow(0)
    const t = 1_000_000
    for (let i = 0; i < 3; i++) checkAndCount(s, t, 3, 10_000)
    expect(checkAndCount(s, t, 3, 10_000).allowed).toBe(false)
    // two full windows later: prev+curr both cleared
    expect(checkAndCount(s, t + 20_001, 3, 10_000).allowed).toBe(true)
  })

  it('weights the previous window (no hard reset at the boundary)', () => {
    const s: WindowState = newWindow(0)
    const t = 1_000_000
    for (let i = 0; i < 3; i++) checkAndCount(s, t, 3, 10_000)
    // one window later, ~start of new window: prevCount=3 weighted ~1.0 ⇒ still over limit
    expect(checkAndCount(s, t + 10_001, 3, 10_000).allowed).toBe(false)
  })
})

describe('LruMap', () => {
  it('evicts the least-recently-set entry past capacity', () => {
    const m = new LruMap<number>(2)
    m.set('a', 1); m.set('b', 2); m.set('c', 3) // 'a' evicted
    expect(m.get('a')).toBeUndefined()
    expect(m.get('b')).toBe(2)
    expect(m.get('c')).toBe(3)
    expect(m.size).toBe(2)
  })
  it('re-setting a key refreshes its recency', () => {
    const m = new LruMap<number>(2)
    m.set('a', 1); m.set('b', 2); m.set('a', 11); m.set('c', 3) // 'b' evicted, 'a' kept
    expect(m.get('b')).toBeUndefined()
    expect(m.get('a')).toBe(11)
    expect(m.get('c')).toBe(3)
  })
})
