import { describe, expect, it, vi } from 'vitest'
import {
  captureGoogleAiMaxCacheInvalidator,
  googleAiMaxReadinessCacheKey,
  readGoogleAiMaxReadinessCached,
} from '~~/server/utils/googleAiMaxCache'

const filters = {
  page: 1,
  pageSize: 25,
  status: 'needs_review' as const,
  search: 'Hilux',
}

describe('Google AI Max readiness cache', () => {
  it('keys entries by tenant and normalized filters', () => {
    const first = googleAiMaxReadinessCacheKey('tenant-a', filters)
    const same = googleAiMaxReadinessCacheKey('tenant-a', { search: 'Hilux', status: 'needs_review', pageSize: 25, page: 1 })
    const otherTenant = googleAiMaxReadinessCacheKey('tenant-b', filters)

    expect(first).toBe(same)
    expect(first).not.toBe(otherTenant)
    expect(first).toContain('google-ai-max:tenant-a:')
  })

  it('serves a second identical request from cache for at most 60 seconds', async () => {
    const loader = vi.fn(async () => ({ items: [{ id: 'state-1' }], latestRun: null }))
    let stored: unknown = null
    const cache = {
      get: vi.fn(async () => stored),
      put: vi.fn(async (_key: string, value: unknown) => { stored = value }),
    }

    const first = await readGoogleAiMaxReadinessCached({ key: 'key', loader, now: 1_000, cache })
    const second = await readGoogleAiMaxReadinessCached({ key: 'key', loader, now: 20_000, cache })

    expect(first).toEqual(second)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.put).toHaveBeenCalledWith('key', expect.anything(), 60)
  })

  it('does not cache a failed healthy-looking zero state', async () => {
    const loader = vi.fn(async () => ({
      items: [],
      latestRun: { status: 'failed' },
      summary: { eligible: 0, affected: 0, unknown: 0 },
    }))
    const cache = { get: vi.fn(async () => null), put: vi.fn() }

    await readGoogleAiMaxReadinessCached({ key: 'key', loader, now: 1_000, cache })
    await readGoogleAiMaxReadinessCached({ key: 'key', loader, now: 2_000, cache })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('invalidates every cached filter variant for one tenant after a scan', async () => {
    const deleteKey = vi.fn(async () => undefined)
    const list = vi.fn(async () => ({
      keys: [
        { name: 'google-ai-max:tenant-a:readiness:page=1' },
        { name: 'google-ai-max:tenant-a:readiness:page=2' },
      ],
      list_complete: true,
    }))
    const invalidate = captureGoogleAiMaxCacheInvalidator({
      context: { cloudflare: { env: { CACHE: { list, delete: deleteKey } } } },
    } as any)

    await expect(invalidate('tenant-a')).resolves.toBe(2)
    expect(list).toHaveBeenCalledWith({ prefix: 'google-ai-max:tenant-a:', cursor: undefined })
    expect(deleteKey).toHaveBeenCalledTimes(2)
  })
})
