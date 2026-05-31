/**
 * Pages-side helper to consult the RateLimiter Durable Object once per beacon.
 * Routes to the per-write_key DO instance and returns its verdict. The caller
 * (track.post.ts) owns mode/limits config and fail-open handling.
 */

export interface RateVerdict {
  allowed: boolean
  layer?: 'key' | 'ip'
  retryAfterSec?: number
}

/** Minimal structural type for the DurableObjectNamespace binding we use. */
export interface RateLimiterNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> }
}

export async function rateCheck(
  limiter: RateLimiterNamespace,
  opts: { writeKey: string; ipHash: string | null; keyLimit: number; ipLimit: number; windowMs: number },
): Promise<RateVerdict> {
  const stub = limiter.get(limiter.idFromName(opts.writeKey))
  const res = await stub.fetch('https://rate-limiter/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ipHash: opts.ipHash,
      keyLimit: opts.keyLimit,
      ipLimit: opts.ipLimit,
      windowMs: opts.windowMs,
    }),
  })
  return (await res.json()) as RateVerdict
}
