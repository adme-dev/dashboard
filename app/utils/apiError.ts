interface ApiErrorRecord {
  data?: {
    statusMessage?: string
    data?: {
      reasons?: string[]
    }
  }
  message?: string
  statusCode?: number
  response?: {
    status?: number
  }
}

function isRecord(value: unknown): value is ApiErrorRecord {
  return Boolean(value) && typeof value === 'object'
}

export function apiErrorDescription(error: unknown, fallback = 'Failed'): string {
  if (!isRecord(error)) return fallback
  return error.data?.statusMessage ?? error.message ?? fallback
}

export function apiErrorReasons(error: unknown): string[] | null {
  if (!isRecord(error)) return null
  const reasons = error.data?.data?.reasons
  return Array.isArray(reasons) ? reasons : null
}

export function apiErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) return null
  return error.statusCode ?? error.response?.status ?? null
}

/** A request without an HTTP response may have committed, so its idempotency key must be retained. */
export function isAmbiguousApiFailure(error: unknown): boolean {
  return apiErrorStatus(error) === null
}

/**
 * True when the server could not prove the request did NOT take effect: no HTTP
 * response at all, or the God-mode ledger refusing to replay a dispatched attempt.
 * Callers should tell the user to check the queue rather than retry blindly.
 */
export function isPossiblyAppliedFailure(error: unknown): boolean {
  if (isAmbiguousApiFailure(error)) return true
  return apiErrorStatus(error) === 409 && /not safely replayable|still in progress/i.test(apiErrorDescription(error, ''))
}
