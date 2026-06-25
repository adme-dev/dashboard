export interface Env {
  API_URL: string
  INTERNAL_API_KEY: string
}

export type OrchestratorReadToolName =
  | 'model_ops_model_map'
  | 'model_ops_invocations'
  | 'model_ops_graphify_status'
  | 'model_ops_agent_runs'
  | 'social_spend_sync_status'

export interface OrchestratorReadTool {
  name: OrchestratorReadToolName
  mode: 'read'
  description: string
  appEndpoint: '/api/internal/ai-orchestrator/read-tool'
}

export const ORCHESTRATOR_READ_TOOLS: OrchestratorReadTool[] = [
  {
    name: 'model_ops_model_map',
    mode: 'read',
    description: 'Read the static Model Ops feature/model map and provider readiness.',
    appEndpoint: '/api/internal/ai-orchestrator/read-tool',
  },
  {
    name: 'model_ops_invocations',
    mode: 'read',
    description: 'Read summarized AI invocation, gateway, fallback, and legacy-message cost telemetry.',
    appEndpoint: '/api/internal/ai-orchestrator/read-tool',
  },
  {
    name: 'model_ops_graphify_status',
    mode: 'read',
    description: 'Read Graphify artifact readiness and freshness for connected repositories.',
    appEndpoint: '/api/internal/ai-orchestrator/read-tool',
  },
  {
    name: 'model_ops_agent_runs',
    mode: 'read',
    description: 'Read existing app-agent run counts, duration, and failure status.',
    appEndpoint: '/api/internal/ai-orchestrator/read-tool',
  },
  {
    name: 'social_spend_sync_status',
    mode: 'read',
    description: 'Read social spend sync health and current running job status.',
    appEndpoint: '/api/internal/ai-orchestrator/read-tool',
  },
]

const toolByName = new Map(ORCHESTRATOR_READ_TOOLS.map((tool) => [tool.name, tool]))

export function normalizeApiBaseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '')
}

export function getReadOnlyTool(toolName: string): OrchestratorReadTool {
  const tool = toolByName.get(toolName as OrchestratorReadToolName)
  if (!tool) {
    throw new Error(`${toolName} is not an allowed read-only orchestrator tool`)
  }
  return tool
}

export function buildInternalToolRequest(input: {
  apiUrl: string
  internalApiKey: string
  toolName: string
  input?: Record<string, unknown>
}): { url: string, init: RequestInit } {
  const tool = getReadOnlyTool(input.toolName)
  const url = `${normalizeApiBaseUrl(input.apiUrl)}${tool.appEndpoint}`
  const internalApiKey = input.internalApiKey.trim()
  if (!internalApiKey) {
    throw new Error('INTERNAL_API_KEY is not configured')
  }

  return {
    url,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${internalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: tool.name,
        input: input.input ?? {},
      }),
    },
  }
}

export async function callReadOnlyTool(
  env: Env,
  toolName: string,
  input: Record<string, unknown> = {},
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const request = buildInternalToolRequest({
    apiUrl: env.API_URL,
    internalApiKey: env.INTERNAL_API_KEY,
    toolName,
    input,
  })

  const response = await fetcher(request.url, request.init)
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${toolName} failed (${response.status}): ${errorText}`)
  }

  return await response.json()
}
