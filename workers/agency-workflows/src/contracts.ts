export const SOCIAL_PUBLISHING_WORKFLOW_KIND = 'social.post.publish' as const
export const SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND = 'social.inbox.automation' as const
export const SOCIAL_SPEND_REVIEW_WORKFLOW_KIND = 'social.spend.review' as const
export const BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND = 'brief.lifecycle.check' as const
export const CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND = 'crm.followup.review' as const
export const SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND = 'site.intelligence.crawl' as const
const WORKFLOW_INSTANCE_ID_MAX_LENGTH = 100
const REVIEW_BUCKET_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type SupportedWorkflowKind
  = typeof SOCIAL_PUBLISHING_WORKFLOW_KIND
    | typeof SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
    | typeof SOCIAL_SPEND_REVIEW_WORKFLOW_KIND
    | typeof BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND
    | typeof CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND
    | typeof SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND

export type SocialPublishingWorkflowTrigger = 'manual' | 'schedule' | 'cron' | 'retry'
export type SocialInboxAutomationWorkflowTrigger = 'inbound' | 'cron' | 'retry' | 'manual'
export type SocialSpendReviewWorkflowTrigger = 'cron' | 'manual' | 'retry'
export type SocialSpendReviewWorkflowScope = 'all' | 'client' | 'platform'
export type SocialSpendReviewPlatform = 'all' | 'meta' | 'google_ads'
export type BriefLifecycleCheckWorkflowTrigger = 'submit' | 'manual' | 'cron' | 'retry'
export type CrmFollowupReviewWorkflowTrigger = 'cron' | 'manual' | 'retry'
export type CrmFollowupReviewWorkflowScope = 'all' | 'client'
export type SiteIntelligenceCrawlWorkflowTrigger = 'manual' | 'schedule' | 'retry'

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

export interface CrmFollowupReviewWorkflowPayload {
  kind: typeof CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND
  bucket: string
  trigger: CrmFollowupReviewWorkflowTrigger
  scope: CrmFollowupReviewWorkflowScope
  clientId?: string
  requestedBy?: string
}

export interface SiteIntelligenceCrawlWorkflowPayload {
  kind: typeof SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND
  runId: string
  domainId: string
  clientId: string
  trigger: SiteIntelligenceCrawlWorkflowTrigger
  requestedBy?: string
}

export type WorkflowRequestBody
  = { workflow: typeof SOCIAL_PUBLISHING_WORKFLOW_KIND, payload: SocialPublishingWorkflowPayload }
    | { workflow: typeof SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND, payload: SocialInboxAutomationWorkflowPayload }
    | { workflow: typeof SOCIAL_SPEND_REVIEW_WORKFLOW_KIND, payload: SocialSpendReviewWorkflowPayload }
    | { workflow: typeof BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND, payload: BriefLifecycleCheckWorkflowPayload }
    | { workflow: typeof CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND, payload: CrmFollowupReviewWorkflowPayload }
    | { workflow: typeof SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND, payload: SiteIntelligenceCrawlWorkflowPayload }

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
  CLOUDFLARE_ACCOUNT_ID?: string
  BROWSER_RENDERING_API_TOKEN?: string
  SOCIAL_PUBLISHING_WORKFLOW: WorkflowBindingLike<SocialPublishingWorkflowPayload>
  SOCIAL_INBOX_AUTOMATION_WORKFLOW: WorkflowBindingLike<SocialInboxAutomationWorkflowPayload>
  SOCIAL_SPEND_REVIEW_WORKFLOW: WorkflowBindingLike<SocialSpendReviewWorkflowPayload>
  BRIEF_LIFECYCLE_CHECK_WORKFLOW: WorkflowBindingLike<BriefLifecycleCheckWorkflowPayload>
  CRM_FOLLOWUP_REVIEW_WORKFLOW: WorkflowBindingLike<CrmFollowupReviewWorkflowPayload>
  SITE_INTELLIGENCE_CRAWL_WORKFLOW: WorkflowBindingLike<SiteIntelligenceCrawlWorkflowPayload>
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
  if (workflow === CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND) {
    return {
      workflow,
      payload: normalizeCrmFollowupReviewWorkflowPayload(body.payload)
    }
  }
  if (workflow === SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND) {
    return {
      workflow,
      payload: normalizeSiteIntelligenceCrawlWorkflowPayload(body.payload)
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

export function normalizeCrmFollowupReviewWorkflowPayload(input: unknown): CrmFollowupReviewWorkflowPayload {
  const body = objectInput(input)
  const bucket = normalizeReviewBucket(body.bucket)
  const trigger = normalizeCrmFollowupReviewTrigger(body.trigger)
  const scope = normalizeCrmFollowupReviewScope(body.scope)
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
  return `crm-followup-review-${instancePart(payload.bucket)}-${instancePart(payload.scope)}-${instancePart(discriminator)}`
    .slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
}

export function normalizeSiteIntelligenceCrawlWorkflowPayload(
  input: unknown
): SiteIntelligenceCrawlWorkflowPayload {
  const body = objectInput(input)
  const runId = requiredUuid(body.runId, 'runId')
  const domainId = requiredUuid(body.domainId, 'domainId')
  const clientId = requiredUuid(body.clientId, 'clientId')
  const trigger = normalizeSiteIntelligenceCrawlTrigger(body.trigger)
  const requestedBy = optionalUuid(body.requestedBy, 'requestedBy')

  return {
    kind: SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
    runId,
    domainId,
    clientId,
    trigger,
    ...(requestedBy ? { requestedBy } : {})
  }
}

export function buildSiteIntelligenceCrawlWorkflowInstanceId(
  payload: SiteIntelligenceCrawlWorkflowPayload
): string {
  return `site-intel-${payload.runId}`.slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
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

function normalizeCrmFollowupReviewTrigger(input: unknown): CrmFollowupReviewWorkflowTrigger {
  const value = optionalText(input) ?? 'cron'
  if (value === 'cron' || value === 'manual' || value === 'retry') return value
  throw new Error(`Unsupported trigger: ${value}`)
}

function normalizeCrmFollowupReviewScope(input: unknown): CrmFollowupReviewWorkflowScope {
  const value = optionalText(input) ?? 'all'
  if (value === 'all' || value === 'client') return value
  throw new Error(`Unsupported scope: ${value}`)
}

function normalizeSiteIntelligenceCrawlTrigger(input: unknown): SiteIntelligenceCrawlWorkflowTrigger {
  const value = requiredText(input, 'trigger')
  if (value === 'manual' || value === 'schedule' || value === 'retry') return value
  throw new Error(`Unsupported trigger: ${value}`)
}

function normalizeReviewBucket(input: unknown): string {
  const value = requiredText(input, 'bucket')
  if (REVIEW_BUCKET_PATTERN.test(value)) return value

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error('bucket must be a valid ISO datetime or YYYY-MM-DDTHH')
  return new Date(timestamp).toISOString().slice(0, 13)
}

function requiredText(input: unknown, field: string): string {
  const value = optionalText(input)
  if (!value) throw new Error(`${field} required`)
  return value
}

function requiredUuid(input: unknown, field: string): string {
  const value = requiredText(input, field)
  if (!UUID_PATTERN.test(value)) throw new Error(`${field} must be a UUID`)
  return value.toLowerCase()
}

function optionalUuid(input: unknown, field: string): string | undefined {
  const value = optionalText(input)
  if (!value) return undefined
  if (!UUID_PATTERN.test(value)) throw new Error(`${field} must be a UUID`)
  return value.toLowerCase()
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
