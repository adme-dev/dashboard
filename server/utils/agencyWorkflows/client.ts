import {
  SOCIAL_PUBLISHING_WORKFLOW_KIND,
  normalizeSocialPublishingWorkflowPayload,
  type SocialPublishingWorkflowPayload,
  type SocialPublishingWorkflowTrigger
} from '~~/server/utils/agencyWorkflows/socialPublishing'
import {
  BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND,
  normalizeBriefLifecycleCheckWorkflowPayload,
  type BriefLifecycleCheckWorkflowPayload,
  type BriefLifecycleCheckWorkflowTrigger
} from '~~/server/utils/agencyWorkflows/briefLifecycleCheck'
import {
  SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
  normalizeSocialInboxAutomationWorkflowPayload,
  type SocialInboxAutomationWorkflowPayload,
  type SocialInboxAutomationWorkflowTrigger
} from '~~/server/utils/agencyWorkflows/socialInboxAutomation'
import {
  SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
  normalizeSocialSpendReviewWorkflowPayload,
  type SocialSpendReviewWorkflowPayload,
  type SocialSpendReviewWorkflowScope,
  type SocialSpendReviewWorkflowTrigger,
  type SocialSpendReviewPlatform
} from '~~/server/utils/agencyWorkflows/socialSpendReview'

const AGENCY_WORKFLOWS_BINDING = 'AGENCY_WORKFLOWS'
const WORKFLOW_START_URL = 'https://agency-workflows.internal/workflows/start'
const WORKFLOW_HEALTH_URL = 'https://agency-workflows.internal/health'
const WORKFLOW_STATUS_URL = 'https://agency-workflows.internal/workflows/status'
const WORKFLOW_START_PATH = '/workflows/start'
const WORKFLOW_HEALTH_PATH = '/health'
const WORKFLOW_STATUS_PATH = '/workflows/status'
const MAX_ERROR_LENGTH = 300
const WORKFLOW_REQUEST_TIMEOUT_MS = 5_000

type WorkflowTransport = 'service-binding' | 'fetch'
export type AgencyWorkflowKind = typeof SOCIAL_PUBLISHING_WORKFLOW_KIND | typeof SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
  | typeof SOCIAL_SPEND_REVIEW_WORKFLOW_KIND
  | typeof BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND
type AgencyWorkflowPayload = SocialPublishingWorkflowPayload | SocialInboxAutomationWorkflowPayload | SocialSpendReviewWorkflowPayload | BriefLifecycleCheckWorkflowPayload

interface AgencyWorkflowServiceBinding {
  fetch: (request: Request) => Promise<Response>
}

export interface AgencyWorkflowEvent {
  context?: {
    cloudflare?: {
      env?: Record<string, unknown>
    }
  }
}

export type StartSocialPublishingWorkflowEvent = AgencyWorkflowEvent

export interface StartSocialPublishingWorkflowInput {
  postId: string
  clientId: string
  scheduledAt?: string
  trigger: SocialPublishingWorkflowTrigger
  requestedBy?: string
  fetchImpl?: (request: Request) => Promise<Response>
}

export interface StartSocialInboxAutomationWorkflowInput {
  conversationId: string
  clientId: string
  messageId?: string
  trigger: SocialInboxAutomationWorkflowTrigger
  requestedBy?: string
  fetchImpl?: (request: Request) => Promise<Response>
}

export interface StartSocialSpendReviewWorkflowInput {
  period: string
  trigger: SocialSpendReviewWorkflowTrigger
  scope: SocialSpendReviewWorkflowScope
  clientId?: string
  platform?: SocialSpendReviewPlatform
  requestedBy?: string
  fetchImpl?: (request: Request) => Promise<Response>
}

export interface StartBriefLifecycleCheckWorkflowInput {
  briefId: string
  trigger: BriefLifecycleCheckWorkflowTrigger
  clientId?: string
  requestedBy?: string
  fetchImpl?: (request: Request) => Promise<Response>
}

export interface StartAgencyWorkflowSuccess<TWorkflow extends AgencyWorkflowKind> {
  ok: true
  enabled: true
  transport: WorkflowTransport
  workflow: TWorkflow
  instanceId?: string
  status?: unknown
}

export interface StartAgencyWorkflowDisabled {
  ok: false
  enabled: false
  reason: 'disabled'
}

export interface StartAgencyWorkflowFailure {
  ok: false
  enabled: true
  reason: 'not_configured' | 'bad_response' | 'request_failed'
  transport?: WorkflowTransport
  status?: number
  error?: string
}

export type StartSocialPublishingWorkflowDisabled = StartAgencyWorkflowDisabled
export type StartSocialPublishingWorkflowFailure = StartAgencyWorkflowFailure

export type StartSocialPublishingWorkflowResult
  = StartAgencyWorkflowSuccess<typeof SOCIAL_PUBLISHING_WORKFLOW_KIND>
    | StartAgencyWorkflowDisabled
    | StartAgencyWorkflowFailure

export type StartSocialInboxAutomationWorkflowResult
  = StartAgencyWorkflowSuccess<typeof SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND>
    | StartAgencyWorkflowDisabled
    | StartAgencyWorkflowFailure

export type StartSocialSpendReviewWorkflowResult
  = StartAgencyWorkflowSuccess<typeof SOCIAL_SPEND_REVIEW_WORKFLOW_KIND>
    | StartAgencyWorkflowDisabled
    | StartAgencyWorkflowFailure

export type StartBriefLifecycleCheckWorkflowResult
  = StartAgencyWorkflowSuccess<typeof BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND>
    | StartAgencyWorkflowDisabled
    | StartAgencyWorkflowFailure

export type AgencyWorkflowReadinessStatus = 'ready' | 'disabled' | 'not_configured' | 'unreachable' | 'degraded'

export interface CheckAgencyWorkflowReadinessInput {
  fetchImpl?: (request: Request) => Promise<Response>
}

export interface GetAgencyWorkflowStatusInput {
  workflow: AgencyWorkflowKind
  instanceId: string
  fetchImpl?: (request: Request) => Promise<Response>
}

export interface AgencyWorkflowReadinessWorker {
  ok?: boolean
  worker?: string
  enabled?: boolean
  workflows?: unknown[]
}

export interface AgencyWorkflowReadinessResult {
  ok: boolean
  status: AgencyWorkflowReadinessStatus
  enabled: boolean
  bindingConfigured: boolean
  fallbackUrlConfigured: boolean
  serviceSecretConfigured: boolean
  transport?: WorkflowTransport
  httpStatus?: number
  worker?: AgencyWorkflowReadinessWorker
  missingWorkflows?: AgencyWorkflowKind[]
  error?: string
}

export type GetAgencyWorkflowStatusResult
  = StartAgencyWorkflowSuccess<AgencyWorkflowKind>
    | StartAgencyWorkflowDisabled
    | StartAgencyWorkflowFailure

interface WorkflowRequestTarget {
  transport: WorkflowTransport
  request: Request
  send: (request: Request) => Promise<Response>
}

export async function startSocialPublishingWorkflow(
  event: AgencyWorkflowEvent,
  input: StartSocialPublishingWorkflowInput
): Promise<StartSocialPublishingWorkflowResult> {
  const env = getCloudflareEnv(event)

  if (envText(env, 'AGENCY_WORKFLOWS_ENABLED') !== 'true') {
    console.info('agency-workflows.social-publishing.start.disabled', {
      postId: input.postId,
      clientId: input.clientId
    })
    return { ok: false, enabled: false, reason: 'disabled' }
  }

  let payload: SocialPublishingWorkflowPayload
  try {
    payload = normalizeSocialPublishingWorkflowPayload({
      kind: SOCIAL_PUBLISHING_WORKFLOW_KIND,
      postId: input.postId,
      clientId: input.clientId,
      scheduledAt: input.scheduledAt,
      trigger: input.trigger,
      requestedBy: input.requestedBy
    })
  } catch (error) {
    const result = failedResult('request_failed', { error: safeError(error) })
    logPublishingFailure(input, result)
    return result
  }

  const secret = envText(env, 'WORKFLOW_SERVICE_SECRET')
  const target = secret ? buildWorkflowStartTarget(env, SOCIAL_PUBLISHING_WORKFLOW_KIND, payload, secret, input.fetchImpl) : null
  if (!target) {
    const result = failedResult('not_configured')
    logPublishingFailure(payload, result)
    return result
  }

  try {
    const response = await target.send(target.request)
    const body = await readResponseBody(response)

    if (!response.ok) {
      const result = failedResult('bad_response', {
        transport: target.transport,
        status: response.status,
        error: responseError(body, response.statusText, [secret])
      })
      logPublishingFailure(payload, result)
      return result
    }

    const result = successResult(SOCIAL_PUBLISHING_WORKFLOW_KIND, target.transport, body)
    console.info('agency-workflows.social-publishing.start.succeeded', {
      postId: payload.postId,
      clientId: payload.clientId,
      transport: target.transport,
      instanceId: result.instanceId
    })
    return result
  } catch (error) {
    const result = failedResult('request_failed', {
      transport: target.transport,
      error: safeError(error, [secret])
    })
    logPublishingFailure(payload, result)
    return result
  }
}

export async function startSocialInboxAutomationWorkflow(
  event: AgencyWorkflowEvent,
  input: StartSocialInboxAutomationWorkflowInput
): Promise<StartSocialInboxAutomationWorkflowResult> {
  const env = getCloudflareEnv(event)

  if (envText(env, 'AGENCY_WORKFLOWS_ENABLED') !== 'true') {
    console.info('agency-workflows.social-inbox.automation.start.disabled', {
      conversationId: input.conversationId,
      clientId: input.clientId
    })
    return { ok: false, enabled: false, reason: 'disabled' }
  }

  let payload: SocialInboxAutomationWorkflowPayload
  try {
    payload = normalizeSocialInboxAutomationWorkflowPayload({
      kind: SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
      conversationId: input.conversationId,
      clientId: input.clientId,
      messageId: input.messageId,
      trigger: input.trigger,
      requestedBy: input.requestedBy
    })
  } catch (error) {
    const result = failedResult('request_failed', { error: safeError(error) })
    logInboxAutomationFailure(input, result)
    return result
  }

  const secret = envText(env, 'WORKFLOW_SERVICE_SECRET')
  const target = secret ? buildWorkflowStartTarget(env, SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND, payload, secret, input.fetchImpl) : null
  if (!target) {
    const result = failedResult('not_configured')
    logInboxAutomationFailure(payload, result)
    return result
  }

  try {
    const response = await target.send(target.request)
    const body = await readResponseBody(response)

    if (!response.ok) {
      const result = failedResult('bad_response', {
        transport: target.transport,
        status: response.status,
        error: responseError(body, response.statusText, [secret])
      })
      logInboxAutomationFailure(payload, result)
      return result
    }

    const result = successResult(SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND, target.transport, body)
    console.info('agency-workflows.social-inbox.automation.start.succeeded', {
      conversationId: payload.conversationId,
      clientId: payload.clientId,
      messageId: payload.messageId,
      transport: target.transport,
      instanceId: result.instanceId
    })
    return result
  } catch (error) {
    const result = failedResult('request_failed', {
      transport: target.transport,
      error: safeError(error, [secret])
    })
    logInboxAutomationFailure(payload, result)
    return result
  }
}

export async function startSocialSpendReviewWorkflow(
  event: AgencyWorkflowEvent,
  input: StartSocialSpendReviewWorkflowInput
): Promise<StartSocialSpendReviewWorkflowResult> {
  const env = getCloudflareEnv(event)

  if (envText(env, 'AGENCY_WORKFLOWS_ENABLED') !== 'true') {
    console.info('agency-workflows.social-spend.review.start.disabled', {
      period: input.period,
      scope: input.scope,
      clientId: input.clientId,
      platform: input.platform
    })
    return { ok: false, enabled: false, reason: 'disabled' }
  }

  let payload: SocialSpendReviewWorkflowPayload
  try {
    payload = normalizeSocialSpendReviewWorkflowPayload({
      kind: SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
      period: input.period,
      trigger: input.trigger,
      scope: input.scope,
      clientId: input.clientId,
      platform: input.platform,
      requestedBy: input.requestedBy
    })
  } catch (error) {
    const result = failedResult('request_failed', { error: safeError(error) })
    logSpendReviewFailure(input, result)
    return result
  }

  const secret = envText(env, 'WORKFLOW_SERVICE_SECRET')
  const target = secret ? buildWorkflowStartTarget(env, SOCIAL_SPEND_REVIEW_WORKFLOW_KIND, payload, secret, input.fetchImpl) : null
  if (!target) {
    const result = failedResult('not_configured')
    logSpendReviewFailure(payload, result)
    return result
  }

  try {
    const response = await target.send(target.request)
    const body = await readResponseBody(response)

    if (!response.ok) {
      const result = failedResult('bad_response', {
        transport: target.transport,
        status: response.status,
        error: responseError(body, response.statusText, [secret])
      })
      logSpendReviewFailure(payload, result)
      return result
    }

    const result = successResult(SOCIAL_SPEND_REVIEW_WORKFLOW_KIND, target.transport, body)
    console.info('agency-workflows.social-spend.review.start.succeeded', {
      period: payload.period,
      scope: payload.scope,
      clientId: payload.clientId,
      platform: payload.platform,
      transport: target.transport,
      instanceId: result.instanceId
    })
    return result
  } catch (error) {
    const result = failedResult('request_failed', {
      transport: target.transport,
      error: safeError(error, [secret])
    })
    logSpendReviewFailure(payload, result)
    return result
  }
}

export async function startBriefLifecycleCheckWorkflow(
  event: AgencyWorkflowEvent,
  input: StartBriefLifecycleCheckWorkflowInput
): Promise<StartBriefLifecycleCheckWorkflowResult> {
  const env = getCloudflareEnv(event)

  if (envText(env, 'AGENCY_WORKFLOWS_ENABLED') !== 'true') {
    console.info('agency-workflows.brief-lifecycle.check.start.disabled', {
      briefId: input.briefId,
      clientId: input.clientId
    })
    return { ok: false, enabled: false, reason: 'disabled' }
  }

  let payload: BriefLifecycleCheckWorkflowPayload
  try {
    payload = normalizeBriefLifecycleCheckWorkflowPayload({
      kind: BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND,
      briefId: input.briefId,
      trigger: input.trigger,
      clientId: input.clientId,
      requestedBy: input.requestedBy
    })
  } catch (error) {
    const result = failedResult('request_failed', { error: safeError(error) })
    logBriefLifecycleCheckFailure(input, result)
    return result
  }

  const secret = envText(env, 'WORKFLOW_SERVICE_SECRET')
  const target = secret ? buildWorkflowStartTarget(env, BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND, payload, secret, input.fetchImpl) : null
  if (!target) {
    const result = failedResult('not_configured')
    logBriefLifecycleCheckFailure(payload, result)
    return result
  }

  try {
    const response = await target.send(target.request)
    const body = await readResponseBody(response)

    if (!response.ok) {
      const result = failedResult('bad_response', {
        transport: target.transport,
        status: response.status,
        error: responseError(body, response.statusText, [secret])
      })
      logBriefLifecycleCheckFailure(payload, result)
      return result
    }

    const result = successResult(BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND, target.transport, body)
    console.info('agency-workflows.brief-lifecycle.check.start.succeeded', {
      briefId: payload.briefId,
      clientId: payload.clientId,
      transport: target.transport,
      instanceId: result.instanceId
    })
    return result
  } catch (error) {
    const result = failedResult('request_failed', {
      transport: target.transport,
      error: safeError(error, [secret])
    })
    logBriefLifecycleCheckFailure(payload, result)
    return result
  }
}

export async function checkAgencyWorkflowReadiness(
  event: AgencyWorkflowEvent,
  input: CheckAgencyWorkflowReadinessInput = {}
): Promise<AgencyWorkflowReadinessResult> {
  const env = getCloudflareEnv(event)
  const enabled = envText(env, 'AGENCY_WORKFLOWS_ENABLED') === 'true'
  const secret = envText(env, 'WORKFLOW_SERVICE_SECRET')
  const bindingConfigured = isServiceBinding(env[AGENCY_WORKFLOWS_BINDING])
  const fallbackUrlConfigured = Boolean(workflowServiceUrl(envText(env, 'AGENCY_WORKFLOWS_URL'), WORKFLOW_HEALTH_PATH))
  const config = {
    enabled,
    bindingConfigured,
    fallbackUrlConfigured,
    serviceSecretConfigured: Boolean(secret)
  }

  if (!enabled) {
    const result: AgencyWorkflowReadinessResult = {
      ok: false,
      status: 'disabled',
      ...config
    }
    console.info('agency-workflows.readiness.disabled', config)
    return result
  }

  if (!secret || (!bindingConfigured && !fallbackUrlConfigured)) {
    const result: AgencyWorkflowReadinessResult = {
      ok: false,
      status: 'not_configured',
      ...config
    }
    logReadinessFailure(result)
    return result
  }

  const target = buildWorkflowReadinessTarget(env, input.fetchImpl)
  if (!target) {
    const result: AgencyWorkflowReadinessResult = {
      ok: false,
      status: 'not_configured',
      ...config
    }
    logReadinessFailure(result)
    return result
  }

  try {
    const response = await target.send(target.request)
    const body = await readResponseBody(response)
    const worker = readinessWorker(body)

    if (!response.ok) {
      const result: AgencyWorkflowReadinessResult = {
        ok: false,
        status: 'unreachable',
        ...config,
        transport: target.transport,
        httpStatus: response.status,
        worker,
        error: responseError(body, response.statusText, [secret])
      }
      logReadinessFailure(result)
      return result
    }

    const missingWorkflows = missingRequiredWorkflows(worker.workflows)
    const ready = worker.ok === true
      && worker.enabled === true
      && missingWorkflows.length === 0
    const result: AgencyWorkflowReadinessResult = {
      ok: ready,
      status: ready ? 'ready' : 'degraded',
      ...config,
      transport: target.transport,
      worker,
      ...(missingWorkflows.length ? { missingWorkflows } : {})
    }
    if (ready) {
      console.info('agency-workflows.readiness.ready', {
        transport: target.transport,
        bindingConfigured,
        fallbackUrlConfigured
      })
    } else {
      logReadinessFailure(result)
    }
    return result
  } catch (error) {
    const result: AgencyWorkflowReadinessResult = {
      ok: false,
      status: 'unreachable',
      ...config,
      transport: target.transport,
      error: safeError(error, [secret])
    }
    logReadinessFailure(result)
    return result
  }
}

export async function getAgencyWorkflowStatus(
  event: AgencyWorkflowEvent,
  input: GetAgencyWorkflowStatusInput
): Promise<GetAgencyWorkflowStatusResult> {
  const env = getCloudflareEnv(event)

  if (envText(env, 'AGENCY_WORKFLOWS_ENABLED') !== 'true') {
    console.info('agency-workflows.status.disabled', {
      workflow: input.workflow,
      instanceId: input.instanceId
    })
    return { ok: false, enabled: false, reason: 'disabled' }
  }

  const secret = envText(env, 'WORKFLOW_SERVICE_SECRET')
  const target = secret ? buildWorkflowStatusTarget(env, input.workflow, input.instanceId, secret, input.fetchImpl) : null
  if (!target) {
    const result = failedResult('not_configured')
    logStatusFailure(input, result)
    return result
  }

  try {
    const response = await target.send(target.request)
    const body = await readResponseBody(response)

    if (!response.ok) {
      const result = failedResult('bad_response', {
        transport: target.transport,
        status: response.status,
        error: responseError(body, response.statusText, [secret])
      })
      logStatusFailure(input, result)
      return result
    }

    const result = successResult(input.workflow, target.transport, body)
    console.info('agency-workflows.status.succeeded', {
      workflow: input.workflow,
      instanceId: input.instanceId,
      transport: target.transport
    })
    return result
  } catch (error) {
    const result = failedResult('request_failed', {
      transport: target.transport,
      error: safeError(error, [secret])
    })
    logStatusFailure(input, result)
    return result
  }
}

function getCloudflareEnv(event: AgencyWorkflowEvent): Record<string, unknown> {
  return event.context?.cloudflare?.env ?? {}
}

function envText(env: Record<string, unknown>, key: string): string {
  const bindingValue = env[key]
  if (typeof bindingValue === 'string') return bindingValue.trim()
  return process.env[key]?.trim() ?? ''
}

function buildWorkflowStartTarget(
  env: Record<string, unknown>,
  workflow: AgencyWorkflowKind,
  payload: AgencyWorkflowPayload,
  secret: string,
  fetchImpl?: (request: Request) => Promise<Response>
): WorkflowRequestTarget | null {
  const body = JSON.stringify({
    workflow,
    payload
  })

  const binding = env[AGENCY_WORKFLOWS_BINDING]
  if (isServiceBinding(binding)) {
    return {
      transport: 'service-binding',
      request: workflowStartRequest(WORKFLOW_START_URL, body, secret),
      send: request => binding.fetch(request)
    }
  }

  const url = workflowStartUrl(envText(env, 'AGENCY_WORKFLOWS_URL'))
  const fetcher = fetchImpl ?? globalThis.fetch
  if (!url || typeof fetcher !== 'function') return null

  return {
    transport: 'fetch',
    request: workflowStartRequest(url, body, secret),
    send: request => fetcher(request)
  }
}

function buildWorkflowReadinessTarget(
  env: Record<string, unknown>,
  fetchImpl?: (request: Request) => Promise<Response>
): WorkflowRequestTarget | null {
  const binding = env[AGENCY_WORKFLOWS_BINDING]
  if (isServiceBinding(binding)) {
    return {
      transport: 'service-binding',
      request: workflowHealthRequest(WORKFLOW_HEALTH_URL),
      send: request => binding.fetch(request)
    }
  }

  const url = workflowServiceUrl(envText(env, 'AGENCY_WORKFLOWS_URL'), WORKFLOW_HEALTH_PATH)
  const fetcher = fetchImpl ?? globalThis.fetch
  if (!url || typeof fetcher !== 'function') return null

  return {
    transport: 'fetch',
    request: workflowHealthRequest(url),
    send: request => fetcher(request)
  }
}

function buildWorkflowStatusTarget(
  env: Record<string, unknown>,
  workflow: AgencyWorkflowKind,
  instanceId: string,
  secret: string,
  fetchImpl?: (request: Request) => Promise<Response>
): WorkflowRequestTarget | null {
  const binding = env[AGENCY_WORKFLOWS_BINDING]
  if (isServiceBinding(binding)) {
    return {
      transport: 'service-binding',
      request: workflowStatusRequest(WORKFLOW_STATUS_URL, workflow, instanceId, secret),
      send: request => binding.fetch(request)
    }
  }

  const url = workflowServiceUrl(envText(env, 'AGENCY_WORKFLOWS_URL'), WORKFLOW_STATUS_PATH)
  const fetcher = fetchImpl ?? globalThis.fetch
  if (!url || typeof fetcher !== 'function') return null

  return {
    transport: 'fetch',
    request: workflowStatusRequest(url, workflow, instanceId, secret),
    send: request => fetcher(request)
  }
}

function isServiceBinding(input: unknown): input is AgencyWorkflowServiceBinding {
  return Boolean(input && typeof input === 'object' && typeof (input as AgencyWorkflowServiceBinding).fetch === 'function')
}

function workflowStartRequest(url: string, body: string, secret: string): Request {
  const signal = workflowRequestSignal()
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${secret}`
    },
    ...(signal ? { signal } : {}),
    body
  })
}

function workflowHealthRequest(url: string): Request {
  const signal = workflowRequestSignal()
  return new Request(url, {
    method: 'GET',
    ...(signal ? { signal } : {})
  })
}

function workflowStatusRequest(url: string, workflow: AgencyWorkflowKind, instanceId: string, secret: string): Request {
  const target = new URL(url)
  target.searchParams.set('workflow', workflow)
  target.searchParams.set('instanceId', instanceId)
  const signal = workflowRequestSignal()
  return new Request(target.toString(), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${secret}`
    },
    ...(signal ? { signal } : {})
  })
}

function workflowRequestSignal(): AbortSignal | undefined {
  const timeout = (AbortSignal as typeof AbortSignal & { timeout?: (milliseconds: number) => AbortSignal }).timeout
  return typeof timeout === 'function' ? timeout(WORKFLOW_REQUEST_TIMEOUT_MS) : undefined
}

function workflowStartUrl(raw: string): string | null {
  return workflowServiceUrl(raw, WORKFLOW_START_PATH)
}

function workflowServiceUrl(raw: string, path: string): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && !isLocalHttp(url)) return null
    if (!url.pathname || url.pathname === '/') {
      url.pathname = path
    } else if (!url.pathname.endsWith(path)) {
      url.pathname = `${url.pathname.replace(/\/+$/, '')}${path}`
    }
    return url.toString()
  } catch {
    return null
  }
}

function isLocalHttp(url: URL): boolean {
  if (url.protocol !== 'http:') return false
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
}

async function readResponseBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function readinessWorker(body: Record<string, unknown>): AgencyWorkflowReadinessWorker {
  return {
    ...(typeof body.ok === 'boolean' ? { ok: body.ok } : {}),
    ...(typeof body.worker === 'string' ? { worker: body.worker } : {}),
    ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
    ...(Array.isArray(body.workflows) ? { workflows: body.workflows } : {})
  }
}

function missingRequiredWorkflows(workflows: unknown[] | undefined): AgencyWorkflowKind[] {
  const required: AgencyWorkflowKind[] = [
    SOCIAL_PUBLISHING_WORKFLOW_KIND,
    SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
    SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
    BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND
  ]
  return required.filter(kind => !hasWorkflowKind(workflows, kind))
}

function hasWorkflowKind(workflows: unknown[] | undefined, kind: AgencyWorkflowKind): boolean {
  return Boolean(workflows?.some((workflow) => {
    if (!workflow || typeof workflow !== 'object') return false
    return (workflow as { kind?: unknown }).kind === kind
  }))
}

function successResult<TWorkflow extends AgencyWorkflowKind>(
  workflow: TWorkflow,
  transport: WorkflowTransport,
  body: Record<string, unknown>
): StartAgencyWorkflowSuccess<TWorkflow> {
  const instanceId = typeof body.instanceId === 'string' ? body.instanceId : undefined
  return {
    ok: true,
    enabled: true,
    transport,
    workflow,
    ...(instanceId ? { instanceId } : {}),
    ...('status' in body ? { status: body.status } : {})
  }
}

function failedResult(
  reason: 'not_configured' | 'bad_response' | 'request_failed',
  context: {
    transport?: WorkflowTransport
    status?: number
    error?: string
  } = {}
): StartAgencyWorkflowFailure {
  return {
    ok: false,
    enabled: true,
    reason,
    ...(context.transport ? { transport: context.transport } : {}),
    ...(context.status ? { status: context.status } : {}),
    ...(context.error ? { error: context.error } : {})
  }
}

function responseError(body: Record<string, unknown>, statusText: string, redactions: string[] = []): string | undefined {
  const bodyError = typeof body.error === 'string' ? body.error.trim() : ''
  const message = bodyError || statusText.trim()
  return message ? truncate(message, redactions) : undefined
}

function safeError(error: unknown, redactions: string[] = []): string {
  if (error instanceof Error) return truncate(error.message, redactions)
  return truncate(String(error), redactions)
}

function truncate(input: string, redactions: string[] = []): string {
  const redacted = redact(input, redactions)
  return redacted.length > MAX_ERROR_LENGTH ? `${redacted.slice(0, MAX_ERROR_LENGTH)}...` : redacted
}

function redact(input: string, redactions: string[]): string {
  let output = input
  for (const value of redactions) {
    const token = value.trim()
    if (token.length >= 4) output = output.split(token).join('[redacted]')
  }
  return output
}

function logPublishingFailure(
  payload: { postId: string, clientId: string },
  result: StartAgencyWorkflowFailure
) {
  console.warn('agency-workflows.social-publishing.start.failed', {
    postId: payload.postId,
    clientId: payload.clientId,
    reason: result.reason,
    transport: result.transport,
    status: result.status,
    error: result.error
  })
}

function logInboxAutomationFailure(
  payload: { conversationId: string, clientId: string, messageId?: string },
  result: StartAgencyWorkflowFailure
) {
  console.warn('agency-workflows.social-inbox.automation.start.failed', {
    conversationId: payload.conversationId,
    clientId: payload.clientId,
    messageId: payload.messageId,
    reason: result.reason,
    transport: result.transport,
    status: result.status,
    error: result.error
  })
}

function logSpendReviewFailure(
  payload: { period: string, scope: string, clientId?: string, platform?: string },
  result: StartAgencyWorkflowFailure
) {
  console.warn('agency-workflows.social-spend.review.start.failed', {
    period: payload.period,
    scope: payload.scope,
    clientId: payload.clientId,
    platform: payload.platform,
    reason: result.reason,
    transport: result.transport,
    status: result.status,
    error: result.error
  })
}

function logBriefLifecycleCheckFailure(
  payload: { briefId: string, clientId?: string },
  result: StartAgencyWorkflowFailure
) {
  console.warn('agency-workflows.brief-lifecycle.check.start.failed', {
    briefId: payload.briefId,
    clientId: payload.clientId,
    reason: result.reason,
    transport: result.transport,
    status: result.status,
    error: result.error
  })
}

function logReadinessFailure(result: AgencyWorkflowReadinessResult) {
  console.warn('agency-workflows.readiness.failed', {
    status: result.status,
    enabled: result.enabled,
    bindingConfigured: result.bindingConfigured,
    fallbackUrlConfigured: result.fallbackUrlConfigured,
    serviceSecretConfigured: result.serviceSecretConfigured,
    transport: result.transport,
    httpStatus: result.httpStatus,
    workerEnabled: result.worker?.enabled,
    missingWorkflows: result.missingWorkflows,
    error: result.error
  })
}

function logStatusFailure(
  input: { workflow: AgencyWorkflowKind, instanceId: string },
  result: StartAgencyWorkflowFailure
) {
  console.warn('agency-workflows.status.failed', {
    workflow: input.workflow,
    instanceId: input.instanceId,
    reason: result.reason,
    transport: result.transport,
    status: result.status,
    error: result.error
  })
}
