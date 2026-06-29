export const DEFAULT_SYNC_RUN_TIMEOUT_MS = 90_000
export const MANUAL_SYNC_RUN_TIMEOUT_MS = 45_000
export const PROVIDER_SYNC_TIMEOUT_MS = 12_000

const MIN_SYNC_RUN_TIMEOUT_MS = 5_000
const MAX_SYNC_RUN_TIMEOUT_MS = 100_000

export function normaliseSyncMaxMs(value: unknown, fallbackMs = DEFAULT_SYNC_RUN_TIMEOUT_MS): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallbackMs
  return Math.min(MAX_SYNC_RUN_TIMEOUT_MS, Math.max(MIN_SYNC_RUN_TIMEOUT_MS, Math.floor(n)))
}

export function createSyncBudget(maxMs: number, now: () => number = Date.now) {
  const startedAt = now()

  return {
    remainingMs() {
      return Math.max(0, maxMs - (now() - startedAt))
    },
    expired(reserveMs = 0) {
      return this.remainingMs() <= reserveMs
    },
    timeoutFor(maxOperationMs: number, reserveMs = 1_000) {
      return Math.max(0, Math.min(maxOperationMs, this.remainingMs() - reserveMs))
    },
  }
}

export async function withSyncTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${label} timed out before it could start`)
  }

  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.ceil(timeoutMs)}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([operation, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
