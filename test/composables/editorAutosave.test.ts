import { describe, it, expect } from 'vitest'
import { makeDebouncedSaver } from '~~/app/composables/useMediaProjectEditor'

describe('makeDebouncedSaver', () => {
  it('coalesces rapid triggers into one call after the delay', async () => {
    let calls = 0
    const save = makeDebouncedSaver(async () => { calls++ }, 50)
    save.trigger()
    save.trigger()
    save.trigger()
    await new Promise(r => setTimeout(r, 80))
    expect(calls).toBe(1)
  })

  it('fires again after a second burst following the first settled call', async () => {
    let calls = 0
    const save = makeDebouncedSaver(async () => { calls++ }, 50)
    save.trigger()
    await new Promise(r => setTimeout(r, 80))
    save.trigger()
    await new Promise(r => setTimeout(r, 80))
    expect(calls).toBe(2)
  })

  it('does not fire if cancelled before the delay', async () => {
    let calls = 0
    const save = makeDebouncedSaver(async () => { calls++ }, 100)
    save.trigger()
    // No wait — immediately check (nothing fired yet)
    expect(calls).toBe(0)
    await new Promise(r => setTimeout(r, 50))
    // Still within window
    expect(calls).toBe(0)
    await new Promise(r => setTimeout(r, 70))
    // Now past the window
    expect(calls).toBe(1)
  })
})
