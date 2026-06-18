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
