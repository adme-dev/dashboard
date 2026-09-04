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

export interface TikTokTestEvidence {
  status: 'requested' | 'accepted' | 'failed'
  completedAt: string | null
  errorClass: string | null
}

export interface TikTokTestHealth {
  healthStatus: 'ready' | 'degraded' | 'blocked'
  evidenceAt: string | null
  reason: string | null
}

const TIKTOK_TEST_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000

function transientTikTokTestFailure(errorClass: string | null): boolean {
  return errorClass === 'provider_network_error'
    || errorClass === 'tiktok_response_invalid'
    || errorClass === 'tiktok_request_id_missing'
    || errorClass === 'tiktok_browser_context_unavailable'
    || errorClass === 'provider_http_408'
    || errorClass === 'provider_http_429'
    || /^provider_http_5\d\d$/.test(errorClass ?? '')
}

export function deriveTikTokTestHealth(
  evidence: TikTokTestEvidence,
  now: Date
): TikTokTestHealth {
  if (evidence.status === 'requested') {
    return {
      healthStatus: 'degraded',
      evidenceAt: null,
      reason: 'tiktok_test_evidence_pending'
    }
  }

  const completedAt = evidence.completedAt ? new Date(evidence.completedAt) : null
  const evidenceAt = completedAt && Number.isFinite(completedAt.getTime())
    ? completedAt.toISOString()
    : null
  if (evidence.status === 'accepted') {
    const age = completedAt ? now.getTime() - completedAt.getTime() : Number.POSITIVE_INFINITY
    if (!Number.isFinite(age) || age < 0 || age > TIKTOK_TEST_EVIDENCE_MAX_AGE_MS) {
      return {
        healthStatus: 'degraded',
        evidenceAt,
        reason: 'tiktok_test_evidence_stale'
      }
    }
    return { healthStatus: 'ready', evidenceAt, reason: null }
  }

  if (transientTikTokTestFailure(evidence.errorClass)) {
    return {
      healthStatus: 'degraded',
      evidenceAt,
      reason: 'tiktok_test_delivery_transient'
    }
  }
  return {
    healthStatus: 'blocked',
    evidenceAt,
    reason: evidence.errorClass ?? 'tiktok_test_delivery_rejected'
  }
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
