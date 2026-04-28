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

  const ctx = (event.context as any).cloudflare?.ctx
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(wrapped)
  }
  // Local Node: the promise just runs in the background — fine, Node won't
  // cancel it. The .catch() above swallows any rejection.
}
