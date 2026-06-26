import { Think } from '@cloudflare/think'
import { routeAgentRequest } from 'agents'
import { tool } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'

interface SpendControllerBridgeBody {
  prompt?: unknown
  context?: unknown
}

interface PublishingPlannerBridgeBody {
  prompt?: unknown
  context?: unknown
}

export interface Env {
  AI: Ai
  APP_BASE_URL: string
  INTERNAL_API_KEY?: string
  THINK_MODEL?: string
  SpendControllerAgent: DurableObjectNamespace
  PublishingPlannerAgent: DurableObjectNamespace
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init)
}

function expectedAuth(env: Env): string | null {
  const key = env.INTERNAL_API_KEY?.trim()
  return key ? `Bearer ${key}` : null
}

async function callAppBridge(env: Env, path: string, body: { prompt?: unknown, context?: unknown }) {
  const expected = expectedAuth(env)
  if (!expected) {
    throw new Error('INTERNAL_API_KEY is not configured')
  }
  const prompt = String(body.prompt || '').trim()
  if (!prompt) {
    throw new Error('prompt required')
  }

  const appBaseUrl = env.APP_BASE_URL || 'https://app.xeroflow.io'
  const response = await fetch(`${appBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: expected,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      context: body.context && typeof body.context === 'object' ? body.context : {},
      draftActions: false,
    }),
  })

  const payload = await response.json().catch(() => ({
    ok: false,
    error: `App bridge returned ${response.status}`,
  }))
  if (!response.ok) {
    throw new Error(typeof (payload as any).error === 'string' ? (payload as any).error : `App bridge returned ${response.status}`)
  }
  return payload
}

async function callSpendControllerAppBridge(env: Env, body: SpendControllerBridgeBody) {
  return callAppBridge(env, '/api/internal/platform-agents/spend-controller/ask', body)
}

async function callPublishingPlannerAppBridge(env: Env, body: PublishingPlannerBridgeBody) {
  return callAppBridge(env, '/api/internal/platform-agents/publishing-planner/ask', body)
}

async function handleSpendControllerBridge(request: Request, env: Env): Promise<Response> {
  const expected = expectedAuth(env)
  if (!expected || request.headers.get('authorization') !== expected) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as SpendControllerBridgeBody
  try {
    const payload = await callSpendControllerAppBridge(env, body)
    return json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message === 'prompt required' ? 400 : 502
    return json({ ok: false, error: message }, { status })
  }
}

async function handlePublishingPlannerBridge(request: Request, env: Env): Promise<Response> {
  const expected = expectedAuth(env)
  if (!expected || request.headers.get('authorization') !== expected) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as PublishingPlannerBridgeBody
  try {
    const payload = await callPublishingPlannerAppBridge(env, body)
    return json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message === 'prompt required' ? 400 : 502
    return json({ ok: false, error: message }, { status })
  }
}

export class SpendControllerAgent extends Think<Env> {
  override workspaceBash = false

  getModel() {
    const model = this.env.THINK_MODEL || '@cf/moonshotai/kimi-k2.7-code'
    return createWorkersAI({ binding: this.env.AI })(model as any)
  }

  getSystemPrompt() {
    return [
      'You are the XeroFlow Spend Controller Agent.',
      'Use read-only platform data to identify spend pacing risks, stale syncs, and safe next steps.',
      'Never execute budget, bid, campaign, publishing, payment, or account changes directly.',
      'When an action is needed, produce an explainable recommendation and require human approval in the app.',
    ].join(' ')
  }

  getTools() {
    return {
      reviewSpendPacing: tool({
        description: 'Read current Meta and Google Ads spend pacing, stale syncs, and safe recommendations from the XeroFlow app.',
        inputSchema: z.object({
          prompt: z.string().min(1).describe('The spend question to answer.'),
          period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Reporting period in YYYY-MM format.'),
          platform: z.enum(['all', 'meta', 'google', 'google_ads']).optional().describe('Platform filter.'),
          clientId: z.string().optional().describe('Optional client id filter when supplied by the app.'),
        }),
        execute: async ({ prompt, period, platform, clientId }) => callSpendControllerAppBridge(this.env, {
          prompt,
          context: {
            period,
            platform,
            clientId,
          },
        }),
      }),
    }
  }
}

export class PublishingPlannerAgent extends Think<Env> {
  override workspaceBash = false

  getModel() {
    const model = this.env.THINK_MODEL || '@cf/moonshotai/kimi-k2.7-code'
    return createWorkersAI({ binding: this.env.AI })(model as any)
  }

  getSystemPrompt() {
    return [
      'You are the XeroFlow Publishing Planner Agent.',
      'Use read-only planner, queue, slot, campaign, and connection data to identify scheduling risks and draft-safe next steps.',
      'Never schedule, approve, publish, delete, or mutate posts directly.',
      'When a plan is needed, recommend draft-only actions that require human review in the app.',
    ].join(' ')
  }

  getTools() {
    return {
      reviewPublishingPlan: tool({
        description: 'Read the current publishing planner state for a client, including campaigns, queue, slots, accounts, and upcoming scheduled posts.',
        inputSchema: z.object({
          prompt: z.string().min(1).describe('The planner question to answer.'),
          clientId: z.string().min(1).describe('Client id to scope the planner review.'),
        }),
        execute: async ({ prompt, clientId }) => callPublishingPlannerAppBridge(this.env, {
          prompt,
          context: { clientId },
        }),
      }),
      draftPublishingPlan: tool({
        description: 'Generate editable draft-only social post suggestions for a client. This never schedules, publishes, approves, deletes, or creates posts.',
        inputSchema: z.object({
          prompt: z.string().min(1).describe('The draft plan brief or request.'),
          clientId: z.string().min(1).describe('Client id to scope the draft plan.'),
          campaignId: z.string().optional().describe('Optional campaign id for the generated draft suggestions.'),
          count: z.number().int().min(1).max(14).optional().describe('Number of draft suggestions to return.'),
          dateFrom: z.string().optional().describe('Optional ISO start date for suggested draft schedule hints.'),
          dateTo: z.string().optional().describe('Optional ISO end date for suggested draft schedule hints.'),
          tone: z.string().optional().describe('Optional tone for generated draft suggestions.'),
          platforms: z.array(z.string()).optional().describe('Target social platforms for the draft suggestions.'),
        }),
        execute: async ({ prompt, clientId, campaignId, count, dateFrom, dateTo, tone, platforms }) => callPublishingPlannerAppBridge(this.env, {
          prompt,
          context: {
            clientId,
            campaignId,
            count,
            dateFrom,
            dateTo,
            tone,
            platforms,
            draftPlan: true,
          },
        }),
      }),
    }
  }
}

export async function handlePlatformAgentsFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/health') {
    return json({
      ok: true,
      worker: 'platform-agents',
      runtime: 'cloudflare-think',
      agents: [
        {
          className: 'SpendControllerAgent',
          route: '/agents/spend-controller-agent/{name}',
          mode: 'read-only-and-propose-via-app',
        },
        {
          className: 'PublishingPlannerAgent',
          route: '/agents/publishing-planner-agent/{name}',
          mode: 'read-only-and-draft-only',
        },
      ],
      bridges: [
        {
          path: '/tools/spend-controller/ask',
          auth: 'INTERNAL_API_KEY',
          mode: 'read_only',
        },
        {
          path: '/tools/publishing-planner/ask',
          auth: 'INTERNAL_API_KEY',
          mode: 'read_only_or_draft_only',
        },
      ],
    })
  }

  if (request.method === 'POST' && url.pathname === '/tools/spend-controller/ask') {
    return handleSpendControllerBridge(request, env)
  }

  if (request.method === 'POST' && url.pathname === '/tools/publishing-planner/ask') {
    return handlePublishingPlannerBridge(request, env)
  }

  const routed = await routeAgentRequest(request, env)
  if (routed) return routed

  return new Response('Not found', { status: 404 })
}

export default {
  fetch: handlePlatformAgentsFetch,
} satisfies ExportedHandler<Env>
