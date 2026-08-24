import { describe, it, expect, vi, beforeEach } from 'vitest'

import { runCappedBeforeResponse } from '../../server/utils/asyncBackground'

describe('runCappedBeforeResponse', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves before the cap', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runCappedBeforeResponse(Promise.resolve('ok'), 'test-label')).resolves.toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
  })

  it('swallows a rejection', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runCappedBeforeResponse(Promise.reject(new Error('boom')), 'test-label')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledWith('[test-label]', expect.any(Error))
  })

  it('returns after the cap when the promise hangs, without throwing or unhandled rejection', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const hanging = new Promise(() => {})
      const p = runCappedBeforeResponse(hanging, 'test-label', 1500)
      await vi.advanceTimersByTimeAsync(1600)
      await expect(p).resolves.toBeUndefined()
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[test-label] exceeded 1500ms cap'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs a late failure after the cap without unhandled rejection', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      let reject!: (err: unknown) => void
      const late = new Promise((_resolve, rej) => { reject = rej })
      const p = runCappedBeforeResponse(late, 'test-label', 1500)
      await vi.advanceTimersByTimeAsync(1600)
      await p
      reject(new Error('late boom'))
      await Promise.resolve()
      await Promise.resolve()
      expect(spy).toHaveBeenCalledWith('[test-label] late failure', expect.any(Error))
    } finally {
      vi.useRealTimers()
    }
  })
})
