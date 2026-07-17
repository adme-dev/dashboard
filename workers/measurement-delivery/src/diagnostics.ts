export type GoogleDiagnosticOutcome
  = 'processing'
    | 'success'
    | 'partial_success'
    | 'failed'
    | 'http_failure'

export interface GoogleDiagnosticResult {
  outcome: GoogleDiagnosticOutcome
  warningCount: number
  errorCount: number
  reason: string | null
  retryable: boolean
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

interface RetrieveGoogleRequestStatusInput {
  requestId: string
  accessToken: string
  fetch: FetchLike
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(record) : []
}

function safeCount(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 0
  const count = Number(value)
  return Number.isSafeInteger(count) && count > 0 ? count : 0
}

function aggregateCounts(
  statuses: Array<Record<string, unknown>>,
  infoKey: 'warningInfo' | 'errorInfo',
  countsKey: 'warningCounts' | 'errorCounts'
): { count: number, firstReason: string | null } {
  let count = 0
  let firstReason: string | null = null
  for (const status of statuses) {
    const info = record(status[infoKey])
    for (const item of records(info[countsKey])) {
      count = Math.min(Number.MAX_SAFE_INTEGER, count + safeCount(item.recordCount))
      if (!firstReason && typeof item.reason === 'string') {
        firstReason = item.reason.slice(0, 255)
      }
    }
  }
  return { count, firstReason }
}

function normalizedOutcome(statuses: Array<Record<string, unknown>>): GoogleDiagnosticOutcome {
  const values = statuses.map(status => status.requestStatus)
  if (values.length === 0 || values.some(value => value === 'PROCESSING' || value === 'REQUEST_STATUS_UNKNOWN')) {
    return 'processing'
  }
  if (values.some(value => value === 'FAILED')) return 'failed'
  if (values.some(value => value === 'PARTIAL_SUCCESS')) return 'partial_success'
  return values.every(value => value === 'SUCCESS') ? 'success' : 'processing'
}

export async function retrieveGoogleDataManagerRequestStatus(
  input: RetrieveGoogleRequestStatusInput
): Promise<GoogleDiagnosticResult> {
  const url = new URL('https://datamanager.googleapis.com/v1/requestStatus:retrieve')
  url.searchParams.set('requestId', input.requestId)
  const response = await input.fetch(url.toString(), {
    method: 'GET',
    headers: { authorization: `Bearer ${input.accessToken}` }
  })
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500
    return {
      outcome: 'http_failure',
      warningCount: 0,
      errorCount: 0,
      reason: `provider_http_${response.status}`,
      retryable
    }
  }

  let body: Record<string, unknown> = {}
  try {
    body = record(await response.json())
  } catch {
    // An empty or invalid success response remains non-terminal and will be checked again.
  }
  const statuses = records(body.requestStatusPerDestination)
  const warnings = aggregateCounts(statuses, 'warningInfo', 'warningCounts')
  const errors = aggregateCounts(statuses, 'errorInfo', 'errorCounts')
  const outcome = normalizedOutcome(statuses)

  return {
    outcome,
    warningCount: warnings.count,
    errorCount: errors.count,
    reason: errors.firstReason ?? warnings.firstReason,
    retryable: outcome === 'processing'
  }
}
