import { afterEach, describe, expect, it, vi } from 'vitest'

import { dedupedXeroCall } from '../../../server/utils/xeroRateLimit'

describe('dedupedXeroCall', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('honours a per-call retry limit for aggregate endpoints', async () => {
    vi.useFakeTimers()
    const rateLimitError = Object.assign(new Error('rate limited'), { statusCode: 429 })
    const operation = vi.fn(async () => {
      throw rateLimitError
    })

    const pending = dedupedXeroCall('aggregate', 'aggregate', operation, { maxRetries: 0 })
    const rejection = expect(pending).rejects.toBe(rateLimitError)
    await vi.runAllTimersAsync()

    await rejection
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
