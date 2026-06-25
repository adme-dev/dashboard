import { ORCHESTRATOR_READ_TOOLS, callReadOnlyTool, type Env } from './contracts'

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init)
}

async function handleToolCall(request: Request, env: Env): Promise<Response> {
  const expectedKey = env.INTERNAL_API_KEY?.trim()
  if (!expectedKey || request.headers.get('Authorization') !== `Bearer ${expectedKey}`) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as {
    tool?: unknown
    input?: Record<string, unknown>
  }
  const toolName = String(body.tool || '')
  const result = await callReadOnlyTool(env, toolName, body.input ?? {})
  return json({ ok: true, tool: toolName, result })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        worker: 'ai-orchestrator-agent',
        mode: 'read-only-foundation',
        tools: ORCHESTRATOR_READ_TOOLS.map((tool) => ({
          name: tool.name,
          mode: tool.mode,
          description: tool.description,
        })),
      })
    }

    if (request.method === 'POST' && url.pathname === '/tools/call') {
      try {
        return await handleToolCall(request, env)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return json({ ok: false, error: message }, { status: 400 })
      }
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

export { ORCHESTRATOR_READ_TOOLS, callReadOnlyTool } from './contracts'
