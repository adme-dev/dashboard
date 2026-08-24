export type DiagnosticDataStatus = 'fresh' | 'stale' | 'unavailable' | 'unsupported'

export type PolicyIssue = {
  code: string | null
  topic: string | null
  summary: string
  message: string | null
  type: string | null
  level: string | null
}

const GOOGLE_SERVING_REASON_MAP: Record<string, string> = {
  BUDGET_CONSTRAINED: 'LIMITED_BY_BUDGET',
  BIDDING_STRATEGY_CONSTRAINED: 'BIDDING_LIMITED',
  BIDDING_STRATEGY_LEARNING: 'LEARNING',
  AD_GROUPS_PAUSED: 'AD_GROUP_PAUSED',
  AD_GROUP_ADS_PAUSED: 'AD_GROUP_PAUSED',
  SEARCH_VOLUME_LIMITED: 'LOW_SEARCH_VOLUME',
}

const META_APPROVED_EFFECTIVE_STATUSES = new Set([
  'ACTIVE',
  'PAUSED',
  'CAMPAIGN_PAUSED',
  'ADSET_PAUSED',
  'ARCHIVED',
])

const META_PENDING_EFFECTIVE_STATUSES = new Set([
  'PENDING_REVIEW',
  'PREAPPROVED',
  'PENDING_BILLING_INFO',
])

function providerCode(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const code = String(value).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  return code || null
}

function providerCodes(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]
  return [...new Set(values.map(providerCode).filter((item): item is string => item !== null))]
}

/** Keep provider-authored text bounded and strip control characters before storage or projection. */
export function sanitizeDiagnosticText(value: unknown, maxLength = 500): string | null {
  if (value == null) return null
  const clean = String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return null
  return clean.slice(0, Math.max(1, Math.trunc(maxLength)))
}

export function sanitizeDiagnosticError(value: unknown): string {
  const message = value instanceof Error ? value.message : sanitizeDiagnosticText(value, 300)
  return (message || 'Provider diagnostic collection failed')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|client[_-]?secret))=([^\s&]+)/gi, '$1=[REDACTED]')
    .slice(0, 300)
}

export function normalizeGoogleServingReasons(values: unknown): {
  normalized: string[]
  provider: string[]
} {
  const provider = providerCodes(values)
  const normalized = [...new Set(provider.map(code => GOOGLE_SERVING_REASON_MAP[code] || 'OTHER_PROVIDER_REASON'))]
  return { normalized, provider }
}

export function normalizeGoogleApprovalStatus(value: unknown): string | null {
  const code = providerCode(value)
  if (!code) return null
  if (code === 'APPROVED') return 'APPROVED'
  if (code === 'DISAPPROVED') return 'DISAPPROVED'
  if (code === 'APPROVED_LIMITED' || code === 'AREA_OF_INTEREST_ONLY') return 'LIMITED'
  if (code === 'UNDER_REVIEW' || code === 'REVIEW_IN_PROGRESS') return 'PENDING_REVIEW'
  return code
}

export function normalizeMetaApprovalStatus(value: unknown): string | null {
  const code = providerCode(value)
  if (!code) return null
  if (code === 'DISAPPROVED') return 'DISAPPROVED'
  if (META_PENDING_EFFECTIVE_STATUSES.has(code)) return 'PENDING_REVIEW'
  if (META_APPROVED_EFFECTIVE_STATUSES.has(code)) return 'APPROVED'
  if (code === 'WITH_ISSUES') return 'LIMITED'
  return code
}

export function normalizeMetaLearningStage(value: unknown): string | null {
  const code = providerCode(value)
  if (!code) return null
  if (code.includes('LEARNING_LIMITED')) return 'LEARNING_LIMITED'
  if (code === 'LEARNING') return 'LEARNING'
  if (code === 'SUCCESS' || code === 'ACTIVE' || code === 'EXITED_LEARNING') return 'ACTIVE'
  if (code === 'NOT_ACTIVE' || code === 'INACTIVE') return 'NOT_ACTIVE'
  return code
}

function compactIssue(issue: PolicyIssue): PolicyIssue | null {
  const summary = sanitizeDiagnosticText(issue.summary, 300)
  if (!summary) return null
  return {
    code: providerCode(issue.code),
    topic: providerCode(issue.topic),
    summary,
    message: sanitizeDiagnosticText(issue.message, 500),
    type: providerCode(issue.type),
    level: providerCode(issue.level),
  }
}

export function normalizeGooglePolicyIssues(value: unknown): PolicyIssue[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 50).map((entry: any) => compactIssue({
    code: entry?.policyTopicEntryType ?? entry?.type ?? null,
    topic: entry?.topic ?? entry?.policyTopic ?? null,
    summary: entry?.topic || entry?.policyTopic || entry?.type || 'Google Ads policy issue',
    message: Array.isArray(entry?.evidences)
      ? entry.evidences.map((evidence: any) => evidence?.textList?.texts?.join(' ')).filter(Boolean).join(' ')
      : null,
    type: entry?.type ?? entry?.policyTopicEntryType ?? null,
    level: null,
  })).filter((issue): issue is PolicyIssue => issue !== null)
}

export function normalizeMetaPolicyIssues(value: unknown): PolicyIssue[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 50).map((entry: any) => compactIssue({
    code: entry?.error_code ?? entry?.code ?? null,
    topic: entry?.error_type ?? entry?.type ?? null,
    summary: entry?.error_summary || entry?.summary || entry?.error_message || 'Meta ad issue',
    message: entry?.error_message ?? entry?.message ?? null,
    type: entry?.error_type ?? entry?.type ?? null,
    level: entry?.level ?? null,
  })).filter((issue): issue is PolicyIssue => issue !== null)
}

export function diagnosticDataStatus(input: {
  supported: boolean
  asOf: string | Date | null
  unavailableReason?: string | null
  now?: Date
  freshForHours?: number
}): DiagnosticDataStatus {
  if (!input.supported) return 'unsupported'
  if (!input.asOf) return 'unavailable'
  const asOfMs = input.asOf instanceof Date ? input.asOf.getTime() : Date.parse(input.asOf)
  if (!Number.isFinite(asOfMs)) return 'unavailable'
  const freshForHours = Math.max(1, input.freshForHours ?? 24)
  return (input.now ?? new Date()).getTime() - asOfMs > freshForHours * 3_600_000 ? 'stale' : 'fresh'
}
