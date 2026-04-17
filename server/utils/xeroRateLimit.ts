/**
 * Xero API Rate Limiting — concurrency queue, exponential backoff, in-flight dedup.
 *
 * Xero enforces a concurrent request limit (typically 5 per tenant).
 * This module ensures at most MAX_CONCURRENT calls fly at once,
 * retries on 429 with exponential backoff, and deduplicates identical
 * in-flight requests so multiple callers share a single Promise.
 */

const MAX_CONCURRENT = 3
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
// Hard ceiling per SDK call. Axios inside xero-node runs on nodejs_compat and
// occasionally hangs indefinitely on Cloudflare Pages. Without this, handlers
// wedge the concurrency slot and are killed silently by CF at 30s.
const CALL_TIMEOUT_MS = 15_000

// Module-scope state (per isolate)
let activeCount = 0
const waitQueue: Array<() => void> = []
const inFlight = new Map<string, Promise<any>>()

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeCount++
      resolve()
    })
  })
}

function releaseSlot() {
  activeCount--
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!
    next()
  }
}

function jitter(ms: number): number {
  return ms + Math.random() * ms * 0.3
}

function is429(err: any): boolean {
  const status = err?.response?.statusCode ?? err?.response?.status ?? err?.statusCode ?? err?.status
  return status === 429
}

function withTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err: any = new Error(`[xero-rate-limit] "${label}" timed out after ${CALL_TIMEOUT_MS}ms`)
      err.statusCode = 504
      err.__xeroTimeout = true
      reject(err)
    }, CALL_TIMEOUT_MS)
    fn().then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

async function executeWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await acquireSlot()
    try {
      const result = await withTimeout(label, fn)
      return result
    } catch (err: any) {
      if (is429(err) && attempt < MAX_RETRIES) {
        const delay = jitter(BASE_DELAY_MS * Math.pow(2, attempt))
        console.warn(`[xero-rate-limit] 429 on "${label}" — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    } finally {
      releaseSlot()
    }
  }
  // Unreachable, but satisfies TS
  throw new Error(`[xero-rate-limit] Exhausted retries for "${label}"`)
}

/**
 * Execute a Xero API call with concurrency limiting, retry on 429,
 * and in-flight deduplication.
 *
 * @param key   Canonical dedup key (e.g. `bankSummary:{tenantId}:{date}`)
 * @param label Human-readable label for logs
 * @param fn    The actual Xero API call
 */
export async function dedupedXeroCall<T>(key: string, label: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) {
    return existing as Promise<T>
  }

  const promise = executeWithRetry<T>(label, fn).finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, promise)
  return promise
}
