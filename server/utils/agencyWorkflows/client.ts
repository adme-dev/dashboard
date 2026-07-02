import {
  SOCIAL_PUBLISHING_WORKFLOW_KIND,
  normalizeSocialPublishingWorkflowPayload,
  type SocialPublishingWorkflowPayload,
  type SocialPublishingWorkflowTrigger
} from '~~/server/utils/agencyWorkflows/socialPublishing'

const AGENCY_WORKFLOWS_BINDING = 'AGENCY_WORKFLOWS'
const WORKFLOW_START_URL = 'https://agency-workflows.internal/workflows/start'
const WORKFLOW_START_PATH = '/workflows/start'
const MAX_ERROR_LENGTH = 300
const WORKFLOW_START_TIMEOUT_MS = 5_000

type WorkflowTransport = 'service-binding' | 'fetch'

interface AgencyWorkflowServiceBinding {
  fetch: (request: Request) => Promise<Response>
}

export interface StartSocialPublishingWorkflowEvent {
  context?: {
    cloudflare?: {
      env?: Record<string, unknown>
    }
  }
}

export interface StartSocialPublishingWorkflowInput {
  postId: string
  clientId: string
  scheduledAt?: string
  trigger: SocialPublishingWorkflowTrigger
  requestedBy?: string
  fetchImpl?: (request: Request) => Promise<Response>
}

export interface StartSocialPublishingWorkflowSuccess {
  ok: true
  enabled: true
  transport: WorkflowTransport
  workflow: typeof SOCIAL_PUBLISHING_WORKFLOW_KIND
  instanceId?: string
  status?: unknown
}

export interface StartSocialPublishingWorkflowDisabled {
  ok: false
  enabled: false
  reason: 'disabled'
}

export interface StartSocialPublishingWorkflowFailure {
  ok: false
  enabled: true
  reason: 'not_configured' | 'bad_response' | 'request_failed'
  transport?: WorkflowTransport
  status?: number
  error?: string
}

export type StartSocialPublishingWorkflowResult
  = StartSocialPublishingWorkflowSuccess
    | StartSocialPublishingWorkflowDisabled
    | StartSocialPublishingWorkflowFailure

interface WorkflowStartTarget {
  transport: WorkflowTransport
  request: Request
  send: (request: Request) => Promise<Response>
}

export async function startSocialPublishingWorkflow(
  event: StartSocialPublishingWorkflowEvent,
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
    const result = failedResult('request_failed', {
      postId: input.postId,
      clientId: input.clientId,
      error: safeError(error)
    })
    logFailure(input, result)
    return result
  }

  const secret = envText(env, 'WORKFLOW_SERVICE_SECRET')
  const target = secret ? buildWorkflowStartTarget(env, payload, secret, input.fetchImpl) : null
  if (!target) {
    const result = failedResult('not_configured', {
      postId: payload.postId,
      clientId: payload.clientId
    })
    logFailure(payload, result)
    return result
  }

  try {
    const response = await target.send(target.request)
    const body = await readResponseBody(response)

    if (!response.ok) {
      const result = failedResult('bad_response', {
        postId: payload.postId,
        clientId: payload.clientId,
        transport: target.transport,
        status: response.status,
        error: responseError(body, response.statusText)
      })
      logFailure(payload, result)
      return result
    }

    const result = successResult(target.transport, body)
    console.info('agency-workflows.social-publishing.start.succeeded', {
      postId: payload.postId,
      clientId: payload.clientId,
      transport: target.transport,
      instanceId: result.instanceId
    })
    return result
  } catch (error) {
    const result = failedResult('request_failed', {
      postId: payload.postId,
      clientId: payload.clientId,
      transport: target.transport,
      error: safeError(error)
    })
    logFailure(payload, result)
    return result
  }
}

function getCloudflareEnv(event: StartSocialPublishingWorkflowEvent): Record<string, unknown> {
  return event.context?.cloudflare?.env ?? {}
}

function envText(env: Record<string, unknown>, key: string): string {
  const bindingValue = env[key]
  if (typeof bindingValue === 'string') return bindingValue.trim()
  return process.env[key]?.trim() ?? ''
}

function buildWorkflowStartTarget(
  env: Record<string, unknown>,
  payload: SocialPublishingWorkflowPayload,
  secret: string,
  fetchImpl?: (request: Request) => Promise<Response>
): WorkflowStartTarget | null {
  const body = JSON.stringify({
    workflow: SOCIAL_PUBLISHING_WORKFLOW_KIND,
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

function isServiceBinding(input: unknown): input is AgencyWorkflowServiceBinding {
  return Boolean(input && typeof input === 'object' && typeof (input as AgencyWorkflowServiceBinding).fetch === 'function')
}

function workflowStartRequest(url: string, body: string, secret: string): Request {
  const signal = workflowStartSignal()
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

function workflowStartSignal(): AbortSignal | undefined {
  const timeout = (AbortSignal as typeof AbortSignal & { timeout?: (milliseconds: number) => AbortSignal }).timeout
  return typeof timeout === 'function' ? timeout(WORKFLOW_START_TIMEOUT_MS) : undefined
}

function workflowStartUrl(raw: string): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && !isLocalHttp(url)) return null
    if (!url.pathname || url.pathname === '/') {
      url.pathname = WORKFLOW_START_PATH
    } else if (!url.pathname.endsWith(WORKFLOW_START_PATH)) {
      url.pathname = `${url.pathname.replace(/\/+$/, '')}${WORKFLOW_START_PATH}`
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

function successResult(transport: WorkflowTransport, body: Record<string, unknown>): StartSocialPublishingWorkflowSuccess {
  const instanceId = typeof body.instanceId === 'string' ? body.instanceId : undefined
  return {
    ok: true,
    enabled: true,
    transport,
    workflow: SOCIAL_PUBLISHING_WORKFLOW_KIND,
    ...(instanceId ? { instanceId } : {}),
    ...('status' in body ? { status: body.status } : {})
  }
}

function failedResult(
  reason: 'not_configured' | 'bad_response' | 'request_failed',
  context: {
    postId: string
    clientId: string
    transport?: WorkflowTransport
    status?: number
    error?: string
  }
): StartSocialPublishingWorkflowFailure {
  return {
    ok: false,
    enabled: true,
    reason,
    ...(context.transport ? { transport: context.transport } : {}),
    ...(context.status ? { status: context.status } : {}),
    ...(context.error ? { error: context.error } : {})
  }
}

function responseError(body: Record<string, unknown>, statusText: string): string | undefined {
  const bodyError = typeof body.error === 'string' ? body.error.trim() : ''
  const message = bodyError || statusText.trim()
  return message ? truncate(message) : undefined
}

function safeError(error: unknown): string {
  if (error instanceof Error) return truncate(error.message)
  return truncate(String(error))
}

function truncate(input: string): string {
  return input.length > MAX_ERROR_LENGTH ? `${input.slice(0, MAX_ERROR_LENGTH)}...` : input
}

function logFailure(
  payload: { postId: string, clientId: string },
  result: StartSocialPublishingWorkflowFailure
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
