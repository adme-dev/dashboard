export interface SpendSyncFailure {
  account: string
  reason: string
}

const SECRET_QUERY_PARAM = /(^|[?&\s])((?:access_token|refresh_token|client_secret|appsecret_proof|token)=)([^&#\s"']+)/gi
const BEARER_CREDENTIAL = /(\b(?:authorization\s*:\s*)?bearer\s+)([^\s,"']+)/gi

export function sanitizeSpendSyncFailureReason(value: unknown): string {
  const reason = typeof value === 'string' ? value : 'Unknown provider error'
  return reason
    .replace(SECRET_QUERY_PARAM, '$1$2[redacted]')
    .replace(BEARER_CREDENTIAL, '$1[redacted]')
    .slice(0, 1000)
}

export function sanitizeSpendSyncFailure(value: Partial<SpendSyncFailure> | null | undefined): SpendSyncFailure {
  return {
    account: String(value?.account || 'Unknown account').slice(0, 250),
    reason: sanitizeSpendSyncFailureReason(value?.reason),
  }
}

export function sanitizeSpendSyncFailures(values: unknown): SpendSyncFailure[] {
  if (!Array.isArray(values)) return []
  return values.map(value => sanitizeSpendSyncFailure(value as Partial<SpendSyncFailure>))
}
