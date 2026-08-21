import { describe, expect, it, vi } from 'vitest'
import { cachedFetch, cachedFetchWithMeta } from '~~/server/utils/kv'

// No Cloudflare env on the event → kv.ts falls back to its in-memory store, which is exactly what
// we want to exercise the provenance branches without a KV binding.
const event = () => ({ context: {}, node: { req: { url: '/x' } }, path: '/x' }) as any
// kv.ts uses Nitro's auto-imported getQuery; provide it for the unit test.
vi.stubGlobal('getQuery', (e: any) => Object.fromEntries(new URL(`http://x${e.path ?? '/'}`).searchParams))

describe('cachedFetchWithMeta — P-01 provenance', () => {
  it('stamps a live fetch, then serves it as cache_fresh with the same cachedAt', async () => {
    const key = `t:${Math.random()}`
    const fetcher = vi.fn().mockResolvedValue({ n: 1 })
    const first = await cachedFetchWithMeta(event(), key, 300, fetcher)
    expect(first.value).toEqual({ n: 1 })
    expect(first.asOf.source).toBe('live')
    expect(first.asOf.servedStale).toBe(false)
    expect(Date.parse(first.asOf.cachedAt!)).toBeGreaterThan(0)

    const second = await cachedFetchWithMeta(event(), key, 300, fetcher)
    expect(second.asOf.source).toBe('cache_fresh')
    expect(second.asOf.cachedAt).toBe(first.asOf.cachedAt)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('marks a stale-if-error response as servedStale with the original cachedAt', async () => {
    const key = `t:${Math.random()}`
    const fetcher = vi.fn().mockResolvedValueOnce({ n: 1 })
    const first = await cachedFetchWithMeta(event(), key, 300, fetcher)
    // Force a bust so the fetcher runs again and fails transiently.
    const busted = { ...event(), node: { req: { url: '/x?bust=1' } }, path: '/x?bust=1' }
    fetcher.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
    const served = await cachedFetchWithMeta(busted, key, 300, fetcher)
    expect(served.value).toEqual({ n: 1 })
    expect(served.asOf.source).toBe('cache_stale_if_error')
    expect(served.asOf.servedStale).toBe(true)
    expect(served.asOf.cachedAt).toBe(first.asOf.cachedAt)
  })

  it('keeps the plain cachedFetch contract for existing callers', async () => {
    const key = `t:${Math.random()}`
    expect(await cachedFetch(event(), key, 60, async () => 'v')).toBe('v')
  })
})
