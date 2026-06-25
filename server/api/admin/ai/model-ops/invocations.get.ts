import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { listAiModelMap } from '~~/server/utils/ai/modelRegistry'

type SummaryRow = {
  total_invocations: string | number | null
  success_count: string | number | null
  error_count: string | number | null
  gateway_count: string | number | null
  fallback_count: string | number | null
  total_tokens: string | number | null
  estimated_cost_usd: string | number | null
  avg_latency_ms: string | number | null
  first_seen_at: string | null
  last_seen_at: string | null
}

type BreakdownRow = {
  key: string
  invocations: string | number
  estimated_cost_usd: string | number | null
  total_tokens: string | number | null
  fallback_count: string | number | null
  error_count: string | number | null
}

type RecentRow = {
  id: string
  feature_key: string
  provider: string
  model_id: string
  gateway_used: boolean
  fallback_used: boolean
  prompt_tokens: number | string | null
  completion_tokens: number | string | null
  total_tokens: number | string | null
  estimated_cost_usd: number | string | null
  status: string
  error_code: string | null
  latency_ms: number | string | null
  created_at: string
}

type HealthRow = {
  total_rows: string | number | null
  oldest_row_at: string | null
  newest_row_at: string | null
  request_rows: string | number | null
  runtime_rows: string | number | null
  completion_rows: string | number | null
  distinct_features: string | number | null
  distinct_models: string | number | null
}

type FeatureSeenRow = {
  feature_key: string
  invocations: string | number
  last_seen_at: string | null
}

type LegacyMessageUsageRow = {
  turns: string | number | null
  estimated_cost_usd: string | number | null
  total_tokens: string | number | null
  first_seen_at: string | null
  last_seen_at: string | null
}

const toNumber = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

const unavailable = (reason = 'AI invocation ledger is not available yet.') => ({
  available: false,
  reason,
  health: {
    tableReady: false,
    totalRows: 0,
    oldestRowAt: null,
    newestRowAt: null,
    requestRows: 0,
    runtimeRows: 0,
    completionRows: 0,
    distinctFeatures: 0,
    distinctModels: 0,
    hasRequestTelemetry: false,
    hasRuntimeTelemetry: false,
    hasCompletionTelemetry: false,
  },
  coverage: {
    mappedFeatureCount: listAiModelMap().reduce((set, row) => set.add(row.featureKey), new Set<string>()).size,
    seenMappedFeatureCount: 0,
    unmappedSeenFeatureCount: 0,
    missingMappedFeatureKeys: [],
    unmappedSeenFeatureKeys: [],
    coverageRate: 0,
  },
  summary: {
    totalInvocations: 0,
    successCount: 0,
    errorCount: 0,
    gatewayCount: 0,
    fallbackCount: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    avgLatencyMs: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    fallbackRate: 0,
    errorRate: 0,
    gatewayRate: 0,
  },
  byFeature: [],
  byModel: [],
  recent: [],
  legacyMessages: {
    available: false,
    turns: 0,
    estimatedCostUsd: 0,
    totalTokens: 0,
    firstSeenAt: null,
    lastSeenAt: null,
  },
})

function isMissingLedgerError(error: unknown): boolean {
  const err = error as { code?: unknown, message?: unknown }
  return err?.code === '42P01' || String(err?.message || '').includes('ai_invocations')
}

function mapBreakdown(row: BreakdownRow) {
  return {
    key: row.key,
    invocations: toNumber(row.invocations),
    estimatedCostUsd: toNumber(row.estimated_cost_usd),
    totalTokens: toNumber(row.total_tokens),
    fallbackCount: toNumber(row.fallback_count),
    errorCount: toNumber(row.error_count),
  }
}

function unavailableLegacyMessages() {
  return {
    available: false,
    turns: 0,
    estimatedCostUsd: 0,
    totalTokens: 0,
    firstSeenAt: null,
    lastSeenAt: null,
  }
}

function mapLegacyMessages(row: LegacyMessageUsageRow | undefined) {
  if (!row) return unavailableLegacyMessages()

  return {
    available: true,
    turns: toNumber(row.turns),
    estimatedCostUsd: toNumber(row.estimated_cost_usd),
    totalTokens: toNumber(row.total_tokens),
    firstSeenAt: row.first_seen_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
  }
}

async function loadLegacyMessageUsageRows(): Promise<LegacyMessageUsageRow[]> {
  try {
    return await queryRows<LegacyMessageUsageRow>(`
      SELECT
        COUNT(*) AS turns,
        COALESCE(SUM(cost_usd), 0) AS estimated_cost_usd,
        COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS total_tokens,
        MIN(created_at) AS first_seen_at,
        MAX(created_at) AS last_seen_at
      FROM ai_messages
      WHERE role = 'assistant' AND created_at >= NOW() - INTERVAL '30 days'
    `)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[Admin AI Model Ops Invocations] Legacy ai_messages usage unavailable:', message)
    return []
  }
}

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  try {
    const [healthRows, seenFeatureRows, summaryRows, byFeature, byModel, recent, legacyMessageRows] = await Promise.all([
      queryRows<HealthRow>(`
        SELECT
          COUNT(*) AS total_rows,
          MIN(created_at) AS oldest_row_at,
          MAX(created_at) AS newest_row_at,
          COUNT(*) FILTER (WHERE feature_key IN ('video_generation_job', 'audio_music_generation', 'video_asset_intelligence_job')) AS request_rows,
          COUNT(*) FILTER (WHERE feature_key IN ('video_generation_worker_runtime', 'audio_music_generation_worker_runtime', 'video_asset_intelligence_worker_runtime')) AS runtime_rows,
          COUNT(*) FILTER (WHERE feature_key = 'video_generation_completion') AS completion_rows,
          COUNT(DISTINCT feature_key) AS distinct_features,
          COUNT(DISTINCT model_id) AS distinct_models
        FROM ai_invocations
      `),
      queryRows<FeatureSeenRow>(`
        SELECT
          feature_key,
          COUNT(*) AS invocations,
          MAX(created_at) AS last_seen_at
        FROM ai_invocations
        GROUP BY feature_key
      `),
      queryRows<SummaryRow>(`
        SELECT
          COUNT(*) AS total_invocations,
          COUNT(*) FILTER (WHERE status = 'success') AS success_count,
          COUNT(*) FILTER (WHERE status <> 'success') AS error_count,
          COUNT(*) FILTER (WHERE gateway_used) AS gateway_count,
          COUNT(*) FILTER (WHERE fallback_used) AS fallback_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
          COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
          MIN(created_at) AS first_seen_at,
          MAX(created_at) AS last_seen_at
        FROM ai_invocations
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      queryRows<BreakdownRow>(`
        SELECT
          feature_key AS key,
          COUNT(*) AS invocations,
          COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COUNT(*) FILTER (WHERE fallback_used) AS fallback_count,
          COUNT(*) FILTER (WHERE status <> 'success') AS error_count
        FROM ai_invocations
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY feature_key
        ORDER BY invocations DESC, key ASC
        LIMIT 20
      `),
      queryRows<BreakdownRow>(`
        SELECT
          model_id AS key,
          COUNT(*) AS invocations,
          COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COUNT(*) FILTER (WHERE fallback_used) AS fallback_count,
          COUNT(*) FILTER (WHERE status <> 'success') AS error_count
        FROM ai_invocations
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY model_id
        ORDER BY invocations DESC, key ASC
        LIMIT 20
      `),
      queryRows<RecentRow>(`
        SELECT
          id::text,
          feature_key,
          provider,
          model_id,
          gateway_used,
          fallback_used,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          estimated_cost_usd,
          status,
          error_code,
          latency_ms,
          created_at
        FROM ai_invocations
        ORDER BY created_at DESC
        LIMIT 25
      `),
      loadLegacyMessageUsageRows(),
    ])

    const row = summaryRows[0]
    const health = healthRows[0]
    const totalInvocations = toNumber(row?.total_invocations)
    const gatewayCount = toNumber(row?.gateway_count)
    const fallbackCount = toNumber(row?.fallback_count)
    const errorCount = toNumber(row?.error_count)
    const requestRows = toNumber(health?.request_rows)
    const runtimeRows = toNumber(health?.runtime_rows)
    const completionRows = toNumber(health?.completion_rows)
    const mappedFeatureKeys = Array.from(new Set(listAiModelMap().map((item) => item.featureKey))).sort()
    const seenFeatureKeys = new Set(seenFeatureRows.map((item) => item.feature_key))
    const missingMappedFeatureKeys = mappedFeatureKeys.filter((key) => !seenFeatureKeys.has(key))
    const unmappedSeenFeatureKeys = seenFeatureRows
      .map((item) => item.feature_key)
      .filter((key) => !mappedFeatureKeys.includes(key))
      .sort()
    const seenMappedFeatureCount = mappedFeatureKeys.length - missingMappedFeatureKeys.length

    return {
      available: true,
      reason: null,
      health: {
        tableReady: true,
        totalRows: toNumber(health?.total_rows),
        oldestRowAt: health?.oldest_row_at ?? null,
        newestRowAt: health?.newest_row_at ?? null,
        requestRows,
        runtimeRows,
        completionRows,
        distinctFeatures: toNumber(health?.distinct_features),
        distinctModels: toNumber(health?.distinct_models),
        hasRequestTelemetry: requestRows > 0,
        hasRuntimeTelemetry: runtimeRows > 0,
        hasCompletionTelemetry: completionRows > 0,
      },
      coverage: {
        mappedFeatureCount: mappedFeatureKeys.length,
        seenMappedFeatureCount,
        unmappedSeenFeatureCount: unmappedSeenFeatureKeys.length,
        missingMappedFeatureKeys,
        unmappedSeenFeatureKeys,
        coverageRate: mappedFeatureKeys.length > 0 ? seenMappedFeatureCount / mappedFeatureKeys.length : 0,
      },
      summary: {
        totalInvocations,
        successCount: toNumber(row?.success_count),
        errorCount,
        gatewayCount,
        fallbackCount,
        totalTokens: toNumber(row?.total_tokens),
        estimatedCostUsd: toNumber(row?.estimated_cost_usd),
        avgLatencyMs: Math.round(toNumber(row?.avg_latency_ms)),
        firstSeenAt: row?.first_seen_at ?? null,
        lastSeenAt: row?.last_seen_at ?? null,
        fallbackRate: totalInvocations > 0 ? fallbackCount / totalInvocations : 0,
        errorRate: totalInvocations > 0 ? errorCount / totalInvocations : 0,
        gatewayRate: totalInvocations > 0 ? gatewayCount / totalInvocations : 0,
      },
      byFeature: byFeature.map(mapBreakdown),
      byModel: byModel.map(mapBreakdown),
      legacyMessages: mapLegacyMessages(legacyMessageRows[0]),
      recent: recent.map((item) => ({
        id: item.id,
        featureKey: item.feature_key,
        provider: item.provider,
        modelId: item.model_id,
        gatewayUsed: item.gateway_used,
        fallbackUsed: item.fallback_used,
        promptTokens: toNumber(item.prompt_tokens),
        completionTokens: toNumber(item.completion_tokens),
        totalTokens: toNumber(item.total_tokens),
        estimatedCostUsd: toNumber(item.estimated_cost_usd),
        status: item.status,
        errorCode: item.error_code,
        latencyMs: toNumber(item.latency_ms),
        createdAt: item.created_at,
      })),
    }
  } catch (error) {
    if (isMissingLedgerError(error)) {
      return unavailable('Run migration 202_ai_invocations.sql to enable invocation telemetry.')
    }
    console.error('[Admin AI Model Ops Invocations] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load AI invocation telemetry'
    })
  }
})
