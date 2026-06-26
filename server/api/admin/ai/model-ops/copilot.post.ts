import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { listAiModelAssignments } from '~~/server/utils/ai/modelAssignments'
import { listCloudflareModelCatalog } from '~~/server/utils/ai/cloudflareModelCatalog'
import {
  createModelOpsCopilotResponse,
  type ModelOpsCopilotTelemetry,
} from '~~/server/utils/ai/modelOpsCopilot'

function cleanString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function toNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function isMissingTelemetryError(error: unknown): boolean {
  const err = error as { code?: unknown, message?: unknown }
  const message = String(err?.message || '')
  return err?.code === '42P01' || message.includes('ai_invocations') || message.includes('ai_agent_runs')
}

async function loadCopilotTelemetry(mappedFeatureKeys: string[]): Promise<ModelOpsCopilotTelemetry> {
  try {
    const [summaryRows, topFeatureRows, topModelRows, seenFeatureRows, agentRows] = await Promise.all([
      queryRows<{
        total_invocations: string | number | null
        error_count: string | number | null
        fallback_count: string | number | null
        gateway_count: string | number | null
      }>(`
        SELECT
          COUNT(*) AS total_invocations,
          COUNT(*) FILTER (WHERE status <> 'success') AS error_count,
          COUNT(*) FILTER (WHERE fallback_used) AS fallback_count,
          COUNT(*) FILTER (WHERE gateway_used) AS gateway_count
        FROM ai_invocations
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      queryRows<{ feature_key: string }>(`
        SELECT feature_key
        FROM ai_invocations
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY feature_key
        ORDER BY COUNT(*) DESC, feature_key ASC
        LIMIT 1
      `),
      queryRows<{ model_id: string }>(`
        SELECT model_id
        FROM ai_invocations
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY model_id
        ORDER BY COUNT(*) DESC, model_id ASC
        LIMIT 1
      `),
      queryRows<{ feature_key: string }>(`
        SELECT DISTINCT feature_key
        FROM ai_invocations
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      queryRows<{
        total_runs: string | number | null
        failed_runs: string | number | null
        orchestrator_read_tool_failures: string | number | null
      }>(`
        SELECT
          COUNT(*) AS total_runs,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed_runs,
          COUNT(*) FILTER (WHERE run_type = 'ai_orchestrator_read_tool' AND status <> 'completed') AS orchestrator_read_tool_failures
        FROM ai_agent_runs
        WHERE started_at >= NOW() - INTERVAL '30 days'
      `),
    ])
    const summary = summaryRows[0]
    const totalInvocations = toNumber(summary?.total_invocations)
    const seenFeatureKeys = new Set(seenFeatureRows.map(row => row.feature_key))
    const totalRuns = toNumber(agentRows[0]?.total_runs)

    return {
      available: true,
      totalInvocations,
      fallbackRate: totalInvocations > 0 ? toNumber(summary?.fallback_count) / totalInvocations : 0,
      errorRate: totalInvocations > 0 ? toNumber(summary?.error_count) / totalInvocations : 0,
      gatewayRate: totalInvocations > 0 ? toNumber(summary?.gateway_count) / totalInvocations : 0,
      missingMappedFeatureCount: mappedFeatureKeys.filter(key => !seenFeatureKeys.has(key)).length,
      topFeatureKey: topFeatureRows[0]?.feature_key ?? null,
      topModelKey: topModelRows[0]?.model_id ?? null,
      agentFailureRate: totalRuns > 0 ? toNumber(agentRows[0]?.failed_runs) / totalRuns : 0,
      orchestratorReadToolFailures: toNumber(agentRows[0]?.orchestrator_read_tool_failures),
    }
  } catch (error) {
    if (!isMissingTelemetryError(error)) {
      console.warn('[Admin AI Model Ops Copilot] Telemetry unavailable:', error)
    }
    return {
      available: false,
      totalInvocations: 0,
      fallbackRate: 0,
      errorRate: 0,
      gatewayRate: 0,
      missingMappedFeatureCount: 0,
      topFeatureKey: null,
      topModelKey: null,
      agentFailureRate: 0,
      orchestratorReadToolFailures: 0,
    }
  }
}

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const body = await readBody(event)
  const prompt = cleanString((body as any)?.prompt, 1200)
  const featureKey = cleanString((body as any)?.featureKey, 160) || null

  if (!prompt) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Prompt is required.',
    })
  }

  const [{ rows }, catalog] = await Promise.all([
    listAiModelAssignments(),
    listCloudflareModelCatalog({
      env: (event.context as any)?.cloudflare?.env ?? null,
    }),
  ])
  const mappedFeatureKeys = Array.from(new Set(rows.map(row => row.featureKey)))
  const telemetry = await loadCopilotTelemetry(mappedFeatureKeys)

  return createModelOpsCopilotResponse({
    prompt,
    featureKey,
    rows,
    catalog,
    telemetry,
  })
})
