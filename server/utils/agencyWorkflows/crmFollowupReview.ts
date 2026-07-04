export const CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND = 'crm.followup.review' as const

export type CrmFollowupReviewWorkflowTrigger = 'cron' | 'manual' | 'retry'
export type CrmFollowupReviewWorkflowScope = 'all' | 'client'

export interface CrmFollowupReviewWorkflowPayload {
  kind: typeof CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND
  bucket: string
  trigger: CrmFollowupReviewWorkflowTrigger
  scope: CrmFollowupReviewWorkflowScope
  clientId?: string
  requestedBy?: string
}

const WORKFLOW_INSTANCE_ID_MAX_LENGTH = 100
const REVIEW_BUCKET_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}$/

export function normalizeCrmFollowupReviewWorkflowPayload(input: unknown): CrmFollowupReviewWorkflowPayload {
  const body = objectInput(input)
  const kind = requiredText(body.kind, 'kind')
  if (kind !== CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND) {
    throw new Error(`Unsupported workflow kind: ${kind}`)
  }

  const bucket = normalizeReviewBucket(body.bucket)
  const trigger = normalizeTrigger(body.trigger)
  const scope = normalizeScope(body.scope)
  const clientId = optionalText(body.clientId)
  const requestedBy = optionalText(body.requestedBy)

  if (scope === 'client' && !clientId) throw new Error('clientId required for client scope')

  return {
    kind: CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND,
    bucket,
    trigger,
    scope,
    ...(clientId ? { clientId } : {}),
    ...(requestedBy ? { requestedBy } : {})
  }
}

export function buildCrmFollowupReviewWorkflowInstanceId(payload: CrmFollowupReviewWorkflowPayload): string {
  const discriminator = payload.scope === 'client' ? payload.clientId || 'unknown' : 'all'
  return `crm-followup-review-${workflowInstancePart(payload.bucket)}-${workflowInstancePart(payload.scope)}-${workflowInstancePart(discriminator)}`
    .slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
}

function normalizeReviewBucket(input: unknown): string {
  const value = requiredText(input, 'bucket')
  if (REVIEW_BUCKET_PATTERN.test(value)) return value

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error('bucket must be a valid ISO datetime or YYYY-MM-DDTHH')
  return new Date(timestamp).toISOString().slice(0, 13)
}

function normalizeTrigger(input: unknown): CrmFollowupReviewWorkflowTrigger {
  const value = requiredText(input, 'trigger')
  if (value === 'cron' || value === 'manual' || value === 'retry') return value
  throw new Error(`Unsupported trigger: ${value}`)
}

function normalizeScope(input: unknown): CrmFollowupReviewWorkflowScope {
  const value = requiredText(input, 'scope')
  if (value === 'all' || value === 'client') return value
  throw new Error(`Unsupported scope: ${value}`)
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
