import { Think } from '@cloudflare/think'
import { routeAgentRequest } from 'agents'
import { tool } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'

interface SpendControllerBridgeBody {
  prompt?: unknown
  context?: unknown
}

export interface Env {
  AI: Ai
  APP_BASE_URL: string
  INTERNAL_API_KEY?: string
  THINK_MODEL?: string
  SpendControllerAgent: DurableObjectNamespace
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init)
}

function expectedAuth(env: Env): string | null {
  const key = env.INTERNAL_API_KEY?.trim()
  return key ? `Bearer ${key}` : null
}

async function callSpendControllerAppBridge(env: Env, body: SpendControllerBridgeBody) {
  const expected = expectedAuth(env)
  if (!expected) {
    throw new Error('INTERNAL_API_KEY is not configured')
  }
  const prompt = String(body.prompt || '').trim()
  if (!prompt) {
    throw new Error('prompt required')
  }

  const appBaseUrl = env.APP_BASE_URL || 'https://app.xeroflow.io'
  const response = await fetch(`${appBaseUrl}/api/internal/platform-agents/spend-controller/ask`, {
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
      ],
      bridges: [
        {
          path: '/tools/spend-controller/ask',
          auth: 'INTERNAL_API_KEY',
          mode: 'read_only',
        },
      ],
    })
  }

  if (request.method === 'POST' && url.pathname === '/tools/spend-controller/ask') {
    return handleSpendControllerBridge(request, env)
  }

  const routed = await routeAgentRequest(request, env)
  if (routed) return routed

  return new Response('Not found', { status: 404 })
}

export default {
  fetch: handlePlatformAgentsFetch,
} satisfies ExportedHandler<Env>
