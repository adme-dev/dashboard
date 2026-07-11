import { describe, expect, it, vi } from 'vitest'
import { runAfterResponse } from '~~/server/utils/asyncBackground'

describe('runAfterResponse', () => {
  it('registers work with Nitro event.waitUntil', async () => {
    const waitUntil = vi.fn()
    const work = Promise.resolve('done')

    runAfterResponse({ waitUntil, context: {} } as any, work, 'test-work')

    expect(waitUntil).toHaveBeenCalledTimes(1)
    await expect(waitUntil.mock.calls[0][0]).resolves.toBe('done')
  })

  it('falls back to Cloudflare context for older runtimes', async () => {
    const waitUntil = vi.fn()
    const work = Promise.resolve('done')

    runAfterResponse({ context: { cloudflare: { context: { waitUntil } } } } as any, work)

    expect(waitUntil).toHaveBeenCalledTimes(1)
    await expect(waitUntil.mock.calls[0][0]).resolves.toBe('done')
  })
})
