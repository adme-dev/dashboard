import { requireRole } from '~~/server/utils/auth'
import { listAiModelAssignments } from '~~/server/utils/ai/modelAssignments'

const ORCHESTRATOR_READ_TOOL_COUNT = 5

function present(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && !value.toLowerCase().includes('your_')
}

function gatewayHost(value: string | undefined): string | null {
  if (!present(value)) return null
  try {
    return new URL(value as string).host
  } catch {
    return 'invalid-url'
  }
}

function host(value: string | undefined): string | null {
  if (!present(value)) return null
  try {
    return new URL(value as string).host
  } catch {
    return 'invalid-url'
  }
}

function aiConfigReadiness() {
  const gatewayUrl = process.env.AI_GATEWAY_URL
  const groqConfigured = present(process.env.GROQ_API_KEY) || present(process.env.GROQ_API)
  const anthropicConfigured = present(process.env.ANTHROPIC_API_KEY)
  const gatewayConfigured = present(gatewayUrl) && gatewayHost(gatewayUrl) !== 'invalid-url'
  const gatewayAuthConfigured = present(process.env.AI_GATEWAY_AUTH_TOKEN)
    || present(process.env.CF_API_TOKEN)
    || present(process.env.CLOUDFLARE_API_TOKEN)
  const workersAiEvalConfigured = present(process.env.CLOUDFLARE_ACCOUNT_ID) && present(process.env.CLOUDFLARE_API_KEY)
  const orchestratorWorkerUrl = process.env.AI_ORCHESTRATOR_WORKER_URL
  const orchestratorWorkerHost = host(orchestratorWorkerUrl)
  const internalApiKeyConfigured = present(process.env.INTERNAL_API_KEY)
  const orchestratorWorkerConfigured = present(orchestratorWorkerUrl) && orchestratorWorkerHost !== 'invalid-url'

  return {
    gateway: {
      configured: gatewayConfigured,
      host: gatewayHost(gatewayUrl),
      authTokenConfigured: gatewayAuthConfigured,
    },
    providers: [
      {
        key: 'groq',
        label: 'Groq',
        configured: groqConfigured,
        requiredFor: 'Groq chat, spend recommendations, summaries, drafts, and tool loops',
      },
      {
        key: 'anthropic',
        label: 'Anthropic',
        configured: anthropicConfigured,
        requiredFor: 'Claude advisor/tool-loop escape hatch',
      },
      {
        key: 'workers_ai_external_eval',
        label: 'Workers AI external eval',
        configured: workersAiEvalConfigured,
        requiredFor: 'Local/server-side evaluation of @cf Workers AI models outside bound Workers',
      },
    ],
    loop: {
      toolsEnabled: process.env.AI_TOOLS_ENABLED === 'true',
      model: process.env.AI_LOOP_MODEL || 'groq/openai/gpt-oss-120b',
      fallbackModel: process.env.AI_LOOP_FALLBACK_MODEL || 'groq/openai/gpt-oss-20b',
      budgetUsd: Number(process.env.AI_LOOP_BUDGET_USD || '0.25'),
      advisorBackend: (process.env.ADVISOR_BACKEND || 'groq').toLowerCase(),
    },
    orchestrator: {
      internalApiKeyConfigured,
      workerConfigured: orchestratorWorkerConfigured,
      workerHost: orchestratorWorkerHost,
      manualCheckReady: internalApiKeyConfigured,
      readToolCount: ORCHESTRATOR_READ_TOOL_COUNT,
    },
  }
}

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const { rows, summary, assignments } = await listAiModelAssignments()
  return {
    rows,
    summary,
    config: aiConfigReadiness(),
    assignments,
  }
})
