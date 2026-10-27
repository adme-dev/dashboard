export const SOCIAL_PUBLISHING_WORKFLOW_KIND = 'social.post.publish' as const

export type SocialPublishingWorkflowTrigger = 'manual' | 'schedule' | 'cron' | 'retry'

export interface SocialPublishingWorkflowPayload {
  kind: typeof SOCIAL_PUBLISHING_WORKFLOW_KIND
  postId: string
  clientId: string
  scheduledAt?: string
  trigger: SocialPublishingWorkflowTrigger
  requestedBy?: string
  /** Approved revision this run may publish (delegated posts); bound into the instance id. */
  revisionId?: string
}

const WORKFLOW_INSTANCE_ID_MAX_LENGTH = 100

export function normalizeSocialPublishingWorkflowPayload(input: unknown): SocialPublishingWorkflowPayload {
  const body = objectInput(input)
  const kind = requiredText(body.kind, 'kind')
  if (kind !== SOCIAL_PUBLISHING_WORKFLOW_KIND) {
    throw new Error(`Unsupported workflow kind: ${kind}`)
  }

  const postId = requiredText(body.postId, 'postId')
  const clientId = requiredText(body.clientId, 'clientId')
  const trigger = normalizeTrigger(body.trigger)
  const scheduledAt = optionalIsoDateTime(body.scheduledAt, 'scheduledAt')
  const requestedBy = optionalText(body.requestedBy)
  const revisionId = optionalRevisionId(body.revisionId)

  return {
    kind: SOCIAL_PUBLISHING_WORKFLOW_KIND,
    postId,
    clientId,
    trigger,
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(requestedBy ? { requestedBy } : {}),
    ...(revisionId ? { revisionId } : {})
  }
}

export function buildSocialPublishingWorkflowInstanceId(payload: SocialPublishingWorkflowPayload): string {
  const attempt = payload.scheduledAt ? `-${workflowInstancePart(payload.scheduledAt)}` : ''
  // Revision ids are unique per submission, so a new reviewed revision always gets a new instance.
  if (payload.revisionId) {
    return `social-publish-rev-${workflowInstancePart(payload.revisionId)}${attempt}`.slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
  }
  return `social-publish-${workflowInstancePart(payload.clientId)}-${workflowInstancePart(payload.postId)}${attempt}`
    .slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
}

function optionalRevisionId(input: unknown): string | undefined {
  const value = optionalText(input)
  if (!value) return undefined
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('revisionId must be a UUID')
  return value.toLowerCase()
}

export function socialPublishingWorkflowClaimStatuses(
  trigger: SocialPublishingWorkflowTrigger
): readonly string[] {
  return trigger === 'manual' ? ['approved'] : ['scheduled']
}

export function socialPublishingWorkflowMaxAttempts(
  trigger: SocialPublishingWorkflowTrigger
): number | null {
  return trigger === 'manual' ? null : 3
}

function normalizeTrigger(input: unknown): SocialPublishingWorkflowTrigger {
  const value = requiredText(input, 'trigger')
  if (value === 'manual' || value === 'schedule' || value === 'cron' || value === 'retry') return value
  throw new Error(`Unsupported trigger: ${value}`)
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

function optionalIsoDateTime(input: unknown, field: string): string | undefined {
  const value = optionalText(input)
  if (!value) return undefined
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be a valid ISO datetime`)
  return new Date(timestamp).toISOString()
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
