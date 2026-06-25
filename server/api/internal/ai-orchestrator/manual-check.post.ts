import readToolHandler from './read-tool.post'

const DEFAULT_TOOLS = [
  'model_ops_model_map',
  'model_ops_invocations',
  'model_ops_graphify_status',
  'model_ops_agent_runs',
  'social_spend_sync_status',
]

function parseTools(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_TOOLS
  const tools = value.map((item) => String(item || '').trim()).filter(Boolean)
  return tools.length > 0 ? tools : DEFAULT_TOOLS
}

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const expectedKey = process.env.INTERNAL_API_KEY?.trim()

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event) as { tools?: unknown, input?: Record<string, unknown> }
  const tools = parseTools(body.tools)
  const input = body.input && typeof body.input === 'object' ? body.input : {}

  const results = []
  for (const tool of tools) {
    try {
      const result = await readToolHandler({
        headers: { authorization: authHeader },
        body: {
          tool,
          input,
        },
      } as any)
      results.push({
        tool,
        ok: true,
        data: result.data,
      })
    } catch (error) {
      results.push({
        tool,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const successfulTools = results.filter((item) => item.ok).length

  return {
    ok: true,
    mode: 'manual_read_only_check',
    summary: {
      totalTools: results.length,
      successfulTools,
      failedTools: results.length - successfulTools,
      readOnly: true,
    },
    results,
  }
})
