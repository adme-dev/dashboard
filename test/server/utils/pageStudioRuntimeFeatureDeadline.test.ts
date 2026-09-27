import { expect, it, vi } from 'vitest'
import { runtimeFeatureDeadline } from '~~/server/utils/pageStudio/runtimeFeatureDeadline'

it('prevents a late storage result from reaching publication after timeout', async () => {
  vi.useFakeTimers()
  const deadline = runtimeFeatureDeadline()
  let complete: (value: string) => void = () => {}
  const storage = new Promise<string>((resolve) => {
    complete = resolve
  })
  const activate = vi.fn()
  try {
    const request = (async () => {
      const value = await deadline.run(() => storage)
      activate(value)
    })()
    const rejected = expect(request).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10_001)
    await rejected
    complete('late')
    await Promise.resolve()
    expect(activate).not.toHaveBeenCalled()
    await expect(deadline.run(async () => 'retry')).rejects.toThrow('timed out')
  } finally {
    deadline.dispose()
    vi.useRealTimers()
  }
})
