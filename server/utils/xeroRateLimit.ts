/**
 * Xero API Rate Limiting — retry on 429, per-call timeout.
 *
 * Earlier versions of this module also did cross-request concurrency
 * queuing and in-flight dedup via module-level state (`activeCount`,
 * `waitQueue`, `inFlight`). On Cloudflare Pages those structures hold
 * Promises and resolve callbacks that span request boundaries, and any
 * second request awaiting them throws "Cannot perform I/O on behalf of
 * a different request" — which surfaces as Cloudflare error 1101 and a
 * generic HTML error page. That broke /api/xero/invoices, /overheads,
 * /reports/budget-variance, etc. as soon as a page fired more than one
 * Xero-backed endpoint in parallel.
 *
 * Cross-request promise sharing is removed. Each call retries on 429
 * with exponential backoff and a wall-clock deadline, which is enough
 * for the dashboard's load pattern (a logged-in user clicking around).
 */

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const CALL_TIMEOUT_MS = 15_000
const TOTAL_TIMEOUT_MS = 25_000

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
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (Date.now() >= deadline) {
      const err: any = new Error(`[xero-rate-limit] "${label}" total deadline exceeded`)
      err.statusCode = 504
      throw err
    }
    try {
      return await withTimeout(label, fn)
    } catch (err: any) {
      if (is429(err) && attempt < MAX_RETRIES && Date.now() < deadline) {
        const delay = jitter(BASE_DELAY_MS * Math.pow(2, attempt))
        console.warn(`[xero-rate-limit] 429 on "${label}" — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error(`[xero-rate-limit] Exhausted retries for "${label}"`)
}

/**
 * Execute a Xero API call with retry on 429 and a per-call timeout.
 *
 * The `key` argument is kept for callsite compatibility but no longer
 * deduplicates across requests — see module header.
 */
export async function dedupedXeroCall<T>(_key: string, label: string, fn: () => Promise<T>): Promise<T> {
  return executeWithRetry(label, fn)
}
