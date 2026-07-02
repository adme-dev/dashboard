export const SOCIAL_PUBLISHING_WORKFLOW_KIND = 'social.post.publish' as const
export const SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND = 'social.inbox.automation' as const
export const SOCIAL_SPEND_REVIEW_WORKFLOW_KIND = 'social.spend.review' as const
export const BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND = 'brief.lifecycle.check' as const
const WORKFLOW_INSTANCE_ID_MAX_LENGTH = 100

export type SupportedWorkflowKind
  = typeof SOCIAL_PUBLISHING_WORKFLOW_KIND
    | typeof SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
    | typeof SOCIAL_SPEND_REVIEW_WORKFLOW_KIND
    | typeof BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND

export type SocialPublishingWorkflowTrigger = 'manual' | 'schedule' | 'cron' | 'retry'
export type SocialInboxAutomationWorkflowTrigger = 'inbound' | 'cron' | 'retry' | 'manual'
export type SocialSpendReviewWorkflowTrigger = 'cron' | 'manual' | 'retry'
export type SocialSpendReviewWorkflowScope = 'all' | 'client' | 'platform'
export type SocialSpendReviewPlatform = 'all' | 'meta' | 'google_ads'
export type BriefLifecycleCheckWorkflowTrigger = 'submit' | 'manual' | 'cron' | 'retry'

export interface SocialPublishingWorkflowPayload {
  kind: typeof SOCIAL_PUBLISHING_WORKFLOW_KIND
  postId: string
  clientId: string
  scheduledAt?: string
  trigger: SocialPublishingWorkflowTrigger
  requestedBy?: string
}

export interface SocialInboxAutomationWorkflowPayload {
  kind: typeof SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
  conversationId: string
  clientId: string
  messageId?: string
  trigger: SocialInboxAutomationWorkflowTrigger
  requestedBy?: string
}

export interface SocialSpendReviewWorkflowPayload {
  kind: typeof SOCIAL_SPEND_REVIEW_WORKFLOW_KIND
  period: string
  trigger: SocialSpendReviewWorkflowTrigger
  scope: SocialSpendReviewWorkflowScope
  clientId?: string
  platform?: SocialSpendReviewPlatform
  requestedBy?: string
}

export interface BriefLifecycleCheckWorkflowPayload {
  kind: typeof BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND
  briefId: string
  trigger: BriefLifecycleCheckWorkflowTrigger
  clientId?: string
  requestedBy?: string
}

export type WorkflowRequestBody
  = { workflow: typeof SOCIAL_PUBLISHING_WORKFLOW_KIND, payload: SocialPublishingWorkflowPayload }
    | { workflow: typeof SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND, payload: SocialInboxAutomationWorkflowPayload }
    | { workflow: typeof SOCIAL_SPEND_REVIEW_WORKFLOW_KIND, payload: SocialSpendReviewWorkflowPayload }
    | { workflow: typeof BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND, payload: BriefLifecycleCheckWorkflowPayload }

export interface WorkflowFeatureEnv {
  AGENCY_WORKFLOWS_ENABLED?: string
}

export interface WorkflowInstanceLike {
  id: string
  status(): Promise<unknown>
}

export interface WorkflowBindingLike<Payload> {
  create(options: { id?: string, params?: Payload }): Promise<WorkflowInstanceLike>
  get(id: string): Promise<WorkflowInstanceLike>
}

export interface AgencyWorkflowEnv extends WorkflowFeatureEnv {
  APP_BASE_URL?: string
  WORKFLOW_SERVICE_SECRET?: string
  WORKFLOW_CALLBACK_SECRET?: string
  SOCIAL_PUBLISHING_WORKFLOW: WorkflowBindingLike<SocialPublishingWorkflowPayload>
  SOCIAL_INBOX_AUTOMATION_WORKFLOW: WorkflowBindingLike<SocialInboxAutomationWorkflowPayload>
  SOCIAL_SPEND_REVIEW_WORKFLOW: WorkflowBindingLike<SocialSpendReviewWorkflowPayload>
  BRIEF_LIFECYCLE_CHECK_WORKFLOW: WorkflowBindingLike<BriefLifecycleCheckWorkflowPayload>
}

export function workflowFeatureEnabled(env: WorkflowFeatureEnv): boolean {
  return env.AGENCY_WORKFLOWS_ENABLED === 'true'
}

export function parseWorkflowRequestBody(input: unknown): WorkflowRequestBody {
  const body = objectInput(input)
  const workflow = String(body.workflow ?? '')
  if (workflow === SOCIAL_PUBLISHING_WORKFLOW_KIND) {
    return {
      workflow,
      payload: normalizeSocialPublishingWorkflowPayload(body.payload)
    }
  }
  if (workflow === SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND) {
    return {
      workflow,
      payload: normalizeSocialInboxAutomationWorkflowPayload(body.payload)
    }
  }
  if (workflow === SOCIAL_SPEND_REVIEW_WORKFLOW_KIND) {
    return {
      workflow,
      payload: normalizeSocialSpendReviewWorkflowPayload(body.payload)
    }
  }
  if (workflow === BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND) {
    return {
      workflow,
      payload: normalizeBriefLifecycleCheckWorkflowPayload(body.payload)
    }
  }
  throw new Error(`Unsupported workflow: ${workflow || 'missing'}`)
}

export function normalizeSocialPublishingWorkflowPayload(input: unknown): SocialPublishingWorkflowPayload {
  const body = objectInput(input)
  const postId = requiredText(body.postId, 'postId')
  const clientId = requiredText(body.clientId, 'clientId')
  const scheduledAt = optionalIsoDateTime(body.scheduledAt, 'scheduledAt')
  const requestedBy = optionalText(body.requestedBy)
  const trigger = normalizeTrigger(body.trigger)

  return {
    kind: SOCIAL_PUBLISHING_WORKFLOW_KIND,
    postId,
    clientId,
    ...(scheduledAt ? { scheduledAt } : {}),
    trigger,
    ...(requestedBy ? { requestedBy } : {})
  }
}

export function buildSocialPublishingWorkflowInstanceId(payload: SocialPublishingWorkflowPayload): string {
  const attempt = payload.scheduledAt ? `-${instancePart(payload.scheduledAt)}` : ''
  return `social-publish-${instancePart(payload.clientId)}-${instancePart(payload.postId)}${attempt}`
    .slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
}

export function normalizeSocialInboxAutomationWorkflowPayload(input: unknown): SocialInboxAutomationWorkflowPayload {
  const body = objectInput(input)
  const conversationId = requiredText(body.conversationId, 'conversationId')
  const clientId = requiredText(body.clientId, 'clientId')
  const messageId = optionalText(body.messageId)
  const requestedBy = optionalText(body.requestedBy)
  const trigger = normalizeInboxAutomationTrigger(body.trigger)

  return {
    kind: SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
    conversationId,
    clientId,
    ...(messageId ? { messageId } : {}),
    trigger,
    ...(requestedBy ? { requestedBy } : {})
  }
}

export function buildSocialInboxAutomationWorkflowInstanceId(payload: SocialInboxAutomationWorkflowPayload): string {
  const discriminator = payload.messageId || payload.trigger
  return `social-inbox-auto-${instancePart(payload.clientId)}-${instancePart(payload.conversationId)}-${instancePart(discriminator)}`
    .slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
}

export function normalizeSocialSpendReviewWorkflowPayload(input: unknown): SocialSpendReviewWorkflowPayload {
  const body = objectInput(input)
  const period = normalizePeriod(body.period)
  const requestedBy = optionalText(body.requestedBy)
  const trigger = normalizeSpendReviewTrigger(body.trigger)
  const scope = normalizeSpendReviewScope(body.scope)
  const clientId = optionalText(body.clientId)
  const platform = normalizeSpendReviewPlatform(body.platform)

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
  return `social-spend-review-${instancePart(payload.period)}-${instancePart(payload.scope)}-${instancePart(discriminator)}`
    .slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
}

export function normalizeBriefLifecycleCheckWorkflowPayload(input: unknown): BriefLifecycleCheckWorkflowPayload {
  const body = objectInput(input)
  const briefId = requiredText(body.briefId, 'briefId')
  const trigger = normalizeBriefLifecycleCheckTrigger(body.trigger)
  const clientId = optionalText(body.clientId)
  const requestedBy = optionalText(body.requestedBy)

  return {
    kind: BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND,
    briefId,
    trigger,
    ...(clientId ? { clientId } : {}),
    ...(requestedBy ? { requestedBy } : {})
  }
}

export function buildBriefLifecycleCheckWorkflowInstanceId(payload: BriefLifecycleCheckWorkflowPayload): string {
  return `brief-lifecycle-${instancePart(payload.briefId)}-${instancePart(payload.trigger)}`
    .slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
}

function normalizeTrigger(input: unknown): SocialPublishingWorkflowTrigger {
  const value = optionalText(input) ?? 'manual'
  if (value === 'manual' || value === 'schedule' || value === 'cron' || value === 'retry') return value
  throw new Error(`Unsupported trigger: ${value}`)
}

function normalizeInboxAutomationTrigger(input: unknown): SocialInboxAutomationWorkflowTrigger {
  const value = optionalText(input) ?? 'inbound'
  if (value === 'inbound' || value === 'cron' || value === 'retry' || value === 'manual') return value
  throw new Error(`Unsupported trigger: ${value}`)
}

function normalizeSpendReviewTrigger(input: unknown): SocialSpendReviewWorkflowTrigger {
  const value = optionalText(input) ?? 'cron'
  if (value === 'cron' || value === 'manual' || value === 'retry') return value
  throw new Error(`Unsupported trigger: ${value}`)
}

function normalizeSpendReviewScope(input: unknown): SocialSpendReviewWorkflowScope {
  const value = optionalText(input) ?? 'all'
  if (value === 'all' || value === 'client' || value === 'platform') return value
  throw new Error(`Unsupported scope: ${value}`)
}

function normalizeSpendReviewPlatform(input: unknown): SocialSpendReviewPlatform | undefined {
  const value = optionalText(input)
  if (!value) return undefined
  if (value === 'all' || value === 'meta' || value === 'google_ads' || value === 'google') {
    return value === 'google' ? 'google_ads' : value
  }
  throw new Error(`Unsupported platform: ${value}`)
}

function normalizePeriod(input: unknown): string {
  const value = requiredText(input, 'period')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('period must be YYYY-MM')
  return value
}

function normalizeBriefLifecycleCheckTrigger(input: unknown): BriefLifecycleCheckWorkflowTrigger {
  const value = optionalText(input) ?? 'manual'
  if (value === 'submit' || value === 'manual' || value === 'cron' || value === 'retry') return value
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

function instancePart(input: string): string {
  const value = input.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return value || 'unknown'
}
