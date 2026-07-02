export const SOCIAL_PUBLISHING_WORKFLOW_KIND = 'social.post.publish' as const

export type SupportedWorkflowKind = typeof SOCIAL_PUBLISHING_WORKFLOW_KIND

export type SocialPublishingWorkflowTrigger = 'manual' | 'schedule' | 'cron' | 'retry'

export interface SocialPublishingWorkflowPayload {
  kind: typeof SOCIAL_PUBLISHING_WORKFLOW_KIND
  postId: string
  clientId: string
  scheduledAt?: string
  trigger: SocialPublishingWorkflowTrigger
  requestedBy?: string
}

export interface WorkflowRequestBody {
  workflow: SupportedWorkflowKind
  payload: SocialPublishingWorkflowPayload
}

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
}

export function workflowFeatureEnabled(env: WorkflowFeatureEnv): boolean {
  return env.AGENCY_WORKFLOWS_ENABLED === 'true'
}

export function parseWorkflowRequestBody(input: unknown): WorkflowRequestBody {
  const body = objectInput(input)
  const workflow = String(body.workflow ?? '')
  if (workflow !== SOCIAL_PUBLISHING_WORKFLOW_KIND) {
    throw new Error(`Unsupported workflow: ${workflow || 'missing'}`)
  }
  return {
    workflow,
    payload: normalizeSocialPublishingWorkflowPayload(body.payload)
  }
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
  return `social-publish-${instancePart(payload.clientId)}-${instancePart(payload.postId)}`.slice(0, 256)
}

function normalizeTrigger(input: unknown): SocialPublishingWorkflowTrigger {
  const value = optionalText(input) ?? 'manual'
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

function instancePart(input: string): string {
  const value = input.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return value || 'unknown'
}
