/**
 * RateLimiter Durable Object — one instance per tracking write key
 * (`env.RATE_LIMITER.idFromName(writeKey)`).
 *
 * Holds a sliding-window counter for the per-key ceiling plus a bounded-LRU map
 * of per-ip_hash windows for the burst cap. Strongly consistent (single-threaded
 * per instance) — this is what KV/CF-native rate limiting cannot provide globally.
 *
 * Accessed only via the binding (stub.fetch → this.fetch). POST /check with
 * { ipHash, keyLimit, ipLimit, windowMs } → { allowed, layer?, retryAfterSec? }.
 */
import { DurableObject } from 'cloudflare:workers'
import { newWindow, checkAndCount, LruMap, type WindowState } from './sliding-window'

interface Env {}

interface CheckBody {
  ipHash: string | null
  keyLimit: number
  ipLimit: number
  windowMs: number
}

const IP_BUCKET_CAP = 5_000

export class RateLimiter extends DurableObject<Env> {
  private keyWindow: WindowState = newWindow(0)
  private ipWindows = new LruMap<WindowState>(IP_BUCKET_CAP)

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== '/check') {
      return new Response('Not found', { status: 404 })
    }
    const body = (await request.json()) as CheckBody
    const now = Date.now()

    // Layer 1 — per-key ceiling (checked first; a key-deny does not consume IP budget).
    const keyVerdict = checkAndCount(this.keyWindow, now, body.keyLimit, body.windowMs)
    if (!keyVerdict.allowed) {
      return Response.json({ allowed: false, layer: 'key', retryAfterSec: keyVerdict.retryAfterSec })
    }

    // Layer 2 — per-IP burst (only when an ip_hash is present).
    if (body.ipHash) {
      const ipState = this.ipWindows.get(body.ipHash) ?? newWindow(now)
      const ipVerdict = checkAndCount(ipState, now, body.ipLimit, body.windowMs)
      this.ipWindows.set(body.ipHash, ipState) // refreshes LRU recency
      if (!ipVerdict.allowed) {
        return Response.json({ allowed: false, layer: 'ip', retryAfterSec: ipVerdict.retryAfterSec })
      }
    }

    return Response.json({ allowed: true })
  }
}
