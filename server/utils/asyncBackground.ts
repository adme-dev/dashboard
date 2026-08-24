/**
 * Run a promise to completion AFTER the response is sent.
 *
 * On Cloudflare Workers / Pages, async work that escapes the request handler
 * is killed when the response is returned ("Cannot perform I/O on behalf of
 * a different request"). The fix is to register the work with the runtime's
 * `waitUntil()` so the worker stays alive until it resolves.
 *
 * This helper is safe to call from any endpoint:
 *   - Cloudflare runtime → registers via ctx.waitUntil
 *   - Local Node / dev → no-op fallback (promise runs normally; Node won't kill it)
 *
 * Errors from the promise are logged but never thrown — callers don't need
 * their own .catch().
 */

import type { H3Event } from 'h3'

export function runAfterResponse(
  event: H3Event,
  promise: Promise<unknown>,
  label = 'runAfterResponse'
): void {
  const wrapped = Promise.resolve(promise).catch(err => {
    console.error(`[${label}]`, err)
  })

  if (typeof event.waitUntil === 'function') {
    event.waitUntil(wrapped)
    return
  }

  const context = event.context as any
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(wrapped)
    return
  }

  const cloudflareContext = context.cloudflare?.context ?? context.cloudflare?.ctx
  if (cloudflareContext && typeof cloudflareContext.waitUntil === 'function') {
    cloudflareContext.waitUntil(wrapped)
  }
  // Local Node: the promise just runs in the background — fine, Node won't
  // cancel it. The .catch() above swallows any rejection.
}

interface KVBinding {
  delete(key: string): Promise<void>
}

/**
 * Fire-and-forget pattern for spend sync endpoints.
 *
 * Each /api/agency/social/<platform>/sync-spend handler runs a long Meta /
 * Google / etc. API loop that almost always exceeds CF Pages' ~30s function
 * limit when an agency has more than a couple of connected accounts. This
 * helper kicks the work off via waitUntil so the HTTP response returns
 * immediately, then busts the KV cache once the sync completes.
 *
 * The cache binding is captured synchronously because reaching into
 * event.context after the request has ended throws "Cannot perform I/O on
 * behalf of a different request" (CF error 1101).
 */
export function runSpendSyncInBackground<R = unknown>(
  event: H3Event,
  options: {
    label: string
    sync: () => Promise<R>
    kvKeys: string[]
    /** Run after the sync resolves and the KV cache is busted (e.g. mark a job row completed). */
    onComplete?: (result: R) => Promise<void> | void
    /** Run if the sync (or onComplete) throws (e.g. mark a job row failed). */
    onError?: (err: unknown) => Promise<void> | void
    /** Extra fields merged into the synchronous response (e.g. a job id to poll). */
    extra?: Record<string, unknown>
  }
): { status: 'started'; startedAt: string } & Record<string, unknown> {
  const cache = (event.context as any).cloudflare?.env?.CACHE as
    | KVBinding
    | undefined

  const work = (async () => {
    try {
      const result = await options.sync()
      if (cache) {
        await Promise.all(
          options.kvKeys.map(k => cache.delete(k).catch(() => {}))
        )
      }
      if (options.onComplete) await options.onComplete(result)
    } catch (err) {
      if (options.onError) {
        try { await options.onError(err) } catch { /* don't mask the original */ }
      }
      throw err // surfaced by runAfterResponse's logger
    }
  })()

  runAfterResponse(event, work, options.label)
  return { status: 'started', startedAt: new Date().toISOString(), ...(options.extra || {}) }
}

/**
 * Await best-effort side-effect work IN-REQUEST, capped so it can never stall
 * the response. Errors are swallowed + logged; a late failure after the cap
 * still logs (and never becomes an unhandled rejection). Use for small DB
 * writes that were previously deferred via runAfterResponse and silently lost
 * on the Pages runtime (see qr/scans.ts history).
 */
export async function runCappedBeforeResponse(
  promise: Promise<unknown>,
  label: string,
  timeoutMs = 1500
): Promise<void> {
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs) })
    const guarded = Promise.resolve(promise).then(() => 'ok' as const)
    const result = await Promise.race([guarded, timeout])
    clearTimeout(timer)
    if (result === 'timeout') {
      console.error(`[${label}] exceeded ${timeoutMs}ms cap; response not delayed further`)
      guarded.catch(err => console.error(`[${label}] late failure`, err))
    }
  } catch (err) {
    console.error(`[${label}]`, err)
  }
}
