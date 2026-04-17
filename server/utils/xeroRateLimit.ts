/**
 * Xero API Rate Limiting — concurrency queue, exponential backoff, in-flight dedup.
 *
 * Xero enforces a concurrent request limit (typically 5 per tenant).
 * This module ensures at most MAX_CONCURRENT calls fly at once,
 * retries on 429 with exponential backoff, and deduplicates identical
 * in-flight requests so multiple callers share a single Promise.
 */

// Xero allows 5 concurrent requests per tenant. Match that ceiling so
// pages like /reports (which fires ~10 Xero-backed endpoints in parallel)
// don't wedge behind a 3-slot queue until CF kills the handler at 30s.
const MAX_CONCURRENT = 5
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
// Per-call ceiling AFTER the concurrency slot is acquired. Keeps any one
// Xero call from hanging indefinitely.
const CALL_TIMEOUT_MS = 15_000
// Total wall-clock ceiling for queue wait + call. CF Pages kills handlers
// at 30s; bail earlier so the handler can return a clean 504 instead of
// getting nuked with no response body.
const TOTAL_TIMEOUT_MS = 25_000

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

async function acquireSlotWithTimeout(label: string, deadline: number): Promise<void> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) {
    const err: any = new Error(`[xero-rate-limit] "${label}" aborted before acquiring concurrency slot`)
    err.statusCode = 504
    throw err
  }
  return new Promise<void>((resolve, reject) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      const err: any = new Error(`[xero-rate-limit] "${label}" gave up waiting for a slot after ${Math.round(remaining)}ms`)
      err.statusCode = 504
      reject(err)
    }, remaining)
    acquireSlot().then(() => {
      if (timedOut) {
        releaseSlot() // immediately hand back the slot we briefly held
        return
      }
      clearTimeout(timer)
      resolve()
    })
  })
}

async function executeWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await acquireSlotWithTimeout(label, deadline)
    try {
      const result = await withTimeout(label, fn)
      return result
    } catch (err: any) {
      if (is429(err) && attempt < MAX_RETRIES && Date.now() < deadline) {
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
