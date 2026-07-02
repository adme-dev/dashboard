export const SOCIAL_SPEND_REVIEW_WORKFLOW_KIND = 'social.spend.review' as const

export type SocialSpendReviewWorkflowTrigger = 'cron' | 'manual' | 'retry'
export type SocialSpendReviewWorkflowScope = 'all' | 'client' | 'platform'
export type SocialSpendReviewPlatform = 'all' | 'meta' | 'google_ads'

export interface SocialSpendReviewWorkflowPayload {
  kind: typeof SOCIAL_SPEND_REVIEW_WORKFLOW_KIND
  period: string
  trigger: SocialSpendReviewWorkflowTrigger
  scope: SocialSpendReviewWorkflowScope
  clientId?: string
  platform?: SocialSpendReviewPlatform
  requestedBy?: string
}

const WORKFLOW_INSTANCE_ID_MAX_LENGTH = 100

export function normalizeSocialSpendReviewWorkflowPayload(input: unknown): SocialSpendReviewWorkflowPayload {
  const body = objectInput(input)
  const kind = requiredText(body.kind, 'kind')
  if (kind !== SOCIAL_SPEND_REVIEW_WORKFLOW_KIND) {
    throw new Error(`Unsupported workflow kind: ${kind}`)
  }

  const period = normalizePeriod(body.period)
  const trigger = normalizeTrigger(body.trigger)
  const scope = normalizeScope(body.scope)
  const clientId = optionalText(body.clientId)
  const platform = normalizePlatform(body.platform)
  const requestedBy = optionalText(body.requestedBy)

  if (scope === 'client' && !clientId) throw new Error('clientId required for client scope')
  if (scope === 'platform' && (!platform || platform === 'all')) throw new Error('platform required for platform scope')

  return {
    kind: SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
    period,
    trigger,
    scope,
    ...(clientId ? { clientId } : {}),
    ...(platform ? { platform } : {}),
    ...(requestedBy ? { requestedBy } : {})
  }
}

export function buildSocialSpendReviewWorkflowInstanceId(payload: SocialSpendReviewWorkflowPayload): string {
  const discriminator = payload.scope === 'client'
    ? payload.clientId || 'unknown'
    : payload.scope === 'platform'
      ? payload.platform || 'unknown'
      : 'all'
  return `social-spend-review-${workflowInstancePart(payload.period)}-${workflowInstancePart(payload.scope)}-${workflowInstancePart(discriminator)}`
    .slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
}

function normalizePeriod(input: unknown): string {
  const value = requiredText(input, 'period')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('period must be YYYY-MM')
  return value
}

function normalizeTrigger(input: unknown): SocialSpendReviewWorkflowTrigger {
  const value = requiredText(input, 'trigger')
  if (value === 'cron' || value === 'manual' || value === 'retry') return value
  throw new Error(`Unsupported trigger: ${value}`)
}

function normalizeScope(input: unknown): SocialSpendReviewWorkflowScope {
  const value = requiredText(input, 'scope')
  if (value === 'all' || value === 'client' || value === 'platform') return value
  throw new Error(`Unsupported scope: ${value}`)
}

function normalizePlatform(input: unknown): SocialSpendReviewPlatform | undefined {
  const value = optionalText(input)
  if (!value) return undefined
  if (value === 'all' || value === 'meta' || value === 'google_ads' || value === 'google') {
    return value === 'google' ? 'google_ads' : value
  }
  throw new Error(`Unsupported platform: ${value}`)
}

function requiredText(input: unknown, field: string): string {
  const value = optionalText(input)
  if (!value) throw new Error(`${field} required`)
  return value
}

function optionalText(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const value = input.trim()
  return value || undefined
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected object payload')
  }
  return input as Record<string, unknown>
}

function workflowInstancePart(input: string): string {
  const value = input.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return value || 'unknown'
}
