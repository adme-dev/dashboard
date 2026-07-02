import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

import {
  SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
  SOCIAL_PUBLISHING_WORKFLOW_KIND,
  type AgencyWorkflowEnv,
  type SocialInboxAutomationWorkflowPayload,
  type SocialPublishingWorkflowPayload,
  buildSocialInboxAutomationWorkflowInstanceId,
  buildSocialPublishingWorkflowInstanceId,
  normalizeSocialInboxAutomationWorkflowPayload,
  normalizeSocialPublishingWorkflowPayload,
  parseWorkflowRequestBody,
  workflowFeatureEnabled
} from './contracts'

type JsonRecord = Record<string, unknown>

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init)
}

function unauthorized(): Response {
  return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

function serviceUnavailable(message: string): Response {
  return json({ ok: false, error: message }, { status: 503 })
}

function requireServiceAuth(request: Request, env: AgencyWorkflowEnv): Response | null {
  const expected = env.WORKFLOW_SERVICE_SECRET?.trim()
  if (!expected) return serviceUnavailable('WORKFLOW_SERVICE_SECRET is not configured')
  return request.headers.get('Authorization') === `Bearer ${expected}` ? null : unauthorized()
}

async function readJson(request: Request): Promise<JsonRecord> {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected JSON object body')
  }
  return body as JsonRecord
}

function callbackSecret(env: AgencyWorkflowEnv): string {
  const secret = env.WORKFLOW_CALLBACK_SECRET?.trim() || env.WORKFLOW_SERVICE_SECRET?.trim()
  if (!secret) throw new Error('WORKFLOW_CALLBACK_SECRET is not configured')
  return secret
}

function appBaseUrl(env: AgencyWorkflowEnv): string {
  const baseUrl = env.APP_BASE_URL?.trim().replace(/\/+$/, '')
  if (!baseUrl) throw new Error('APP_BASE_URL is not configured')
  return baseUrl
}

export class SocialPublishingWorkflow extends WorkflowEntrypoint<AgencyWorkflowEnv, SocialPublishingWorkflowPayload> {
  async run(event: WorkflowEvent<SocialPublishingWorkflowPayload>, step: WorkflowStep) {
    const payload = normalizeSocialPublishingWorkflowPayload(event.payload)
    if (payload.scheduledAt) {
      const wakeAt = Date.parse(payload.scheduledAt)
      if (wakeAt > Date.now()) {
        await step.sleepUntil('wait until scheduled social publish time', wakeAt)
      }
    }

    return await step.do(
      'publish social post through Pages',
      { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => {
        const response = await fetch(`${appBaseUrl(this.env)}/api/internal/workflows/social-publishing/publish`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workflow-secret': callbackSecret(this.env)
          },
          body: JSON.stringify(payload)
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(`Pages publish callback failed: ${response.status} ${text.slice(0, 200)}`)
        }
        return {
          ok: true,
          status: response.status,
          bodyText: text ? text.slice(0, 1000) : null
        }
      }
    )
  }
}

export class SocialInboxAutomationWorkflow extends WorkflowEntrypoint<AgencyWorkflowEnv, SocialInboxAutomationWorkflowPayload> {
  async run(event: WorkflowEvent<SocialInboxAutomationWorkflowPayload>, step: WorkflowStep) {
    const payload = normalizeSocialInboxAutomationWorkflowPayload(event.payload)

    return await step.do(
      'run social inbox automation through Pages',
      { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => {
        const response = await fetch(`${appBaseUrl(this.env)}/api/internal/workflows/social-inbox/automation`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workflow-secret': callbackSecret(this.env)
          },
          body: JSON.stringify(payload)
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(`Pages inbox automation callback failed: ${response.status} ${text.slice(0, 200)}`)
        }
        return {
          ok: true,
          status: response.status,
          bodyText: text ? text.slice(0, 1000) : null
        }
      }
    )
  }
}

export async function handleAgencyWorkflowsFetch(request: Request, env: AgencyWorkflowEnv): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/health') {
    const workflows = workflowHealth(env)
    return json({
      ok: workflows.every(workflow => workflow.bindingConfigured),
      worker: 'agency-workflows',
      enabled: workflowFeatureEnabled(env),
      workflows
    })
  }

  if (url.pathname === '/workflows/start' && request.method === 'POST') {
    const authResponse = requireServiceAuth(request, env)
    if (authResponse) return authResponse
    if (!workflowFeatureEnabled(env)) return serviceUnavailable('Agency workflows are disabled')

    try {
      const body = parseWorkflowRequestBody(await readJson(request))
      const instance = body.workflow === SOCIAL_PUBLISHING_WORKFLOW_KIND
        ? await env.SOCIAL_PUBLISHING_WORKFLOW.create({
            id: buildSocialPublishingWorkflowInstanceId(body.payload),
            params: body.payload
          })
        : await env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.create({
            id: buildSocialInboxAutomationWorkflowInstanceId(body.payload),
            params: body.payload
          })
      return json({ ok: true, workflow: body.workflow, instanceId: instance.id, status: await instance.status() })
    } catch (error) {
      return json({ ok: false, error: errorMessage(error) }, { status: 400 })
    }
  }

  if (url.pathname === '/workflows/status' && request.method === 'GET') {
    const authResponse = requireServiceAuth(request, env)
    if (authResponse) return authResponse

    const workflow = url.searchParams.get('workflow')
    const instanceId = url.searchParams.get('instanceId')
    if (!instanceId || (workflow !== SOCIAL_PUBLISHING_WORKFLOW_KIND && workflow !== SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND)) {
      return json({ ok: false, error: 'workflow and instanceId are required' }, { status: 400 })
    }

    const instance = workflow === SOCIAL_PUBLISHING_WORKFLOW_KIND
      ? await env.SOCIAL_PUBLISHING_WORKFLOW.get(instanceId)
      : await env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.get(instanceId)
    return json({ ok: true, workflow, instanceId: instance.id, status: await instance.status() })
  }

  return new Response('Not found', { status: 404 })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function workflowHealth(env: AgencyWorkflowEnv) {
  return [
    {
      kind: SOCIAL_PUBLISHING_WORKFLOW_KIND,
      binding: 'SOCIAL_PUBLISHING_WORKFLOW',
      bindingConfigured: isWorkflowBinding(env.SOCIAL_PUBLISHING_WORKFLOW)
    },
    {
      kind: SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
      binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW',
      bindingConfigured: isWorkflowBinding(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW)
    }
  ]
}

function isWorkflowBinding(input: unknown): boolean {
  return Boolean(
    input
    && typeof input === 'object'
    && typeof (input as { create?: unknown }).create === 'function'
    && typeof (input as { get?: unknown }).get === 'function'
  )
}

export default {
  fetch: handleAgencyWorkflowsFetch
} satisfies ExportedHandler<AgencyWorkflowEnv>
