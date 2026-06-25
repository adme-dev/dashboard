import { getAiModelMapSummary, listAiModelMap } from '~~/server/utils/ai/modelRegistry'
import { execute, queryRows } from '~~/server/utils/db'

type OrchestratorReadToolName =
  | 'model_ops_model_map'
  | 'model_ops_invocations'
  | 'model_ops_graphify_status'
  | 'model_ops_agent_runs'
  | 'social_spend_sync_status'

const READ_ONLY_TOOLS = new Set<OrchestratorReadToolName>([
  'model_ops_model_map',
  'model_ops_invocations',
  'model_ops_graphify_status',
  'model_ops_agent_runs',
  'social_spend_sync_status',
])

const toNumber = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function assertReadOnlyTool(tool: unknown): OrchestratorReadToolName {
  if (typeof tool !== 'string' || !READ_ONLY_TOOLS.has(tool as OrchestratorReadToolName)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported read-only orchestrator tool' })
  }
  return tool as OrchestratorReadToolName
}

function unavailable(reason: string) {
  return {
    available: false,
    reason,
    readOnly: true,
  }
}

function isMissingTableError(error: unknown): boolean {
  const err = error as { code?: unknown, message?: unknown }
  return err?.code === '42P01' || String(err?.message || '').includes('does not exist')
}

async function recordOrchestratorReadRun(input: {
  tool: OrchestratorReadToolName
  startedAt: number
  status: 'completed' | 'failed'
  error?: unknown
}) {
  try {
    const durationMs = Date.now() - input.startedAt
    const errors = input.error
      ? [{ error: input.error instanceof Error ? input.error.message : String(input.error) }]
      : []
    await execute(`
      INSERT INTO ai_agent_runs (
        run_type,
        status,
        started_at,
        completed_at,
        duration_ms,
        checks_performed,
        findings_count,
        notifications_sent,
        errors,
        summary
      )
      VALUES (
        'ai_orchestrator_read_tool',
        $1,
        NOW() - ($2::int * INTERVAL '1 millisecond'),
        NOW(),
        $2,
        1,
        0,
        0,
        $3::jsonb,
        $4::jsonb
      )
    `, [
      input.status,
      durationMs,
      JSON.stringify(errors),
      JSON.stringify({
        tool: input.tool,
        readOnly: true,
        source: 'internal_ai_orchestrator_read_tool',
      }),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[AI Orchestrator Read Tool] Run logging unavailable:', message)
  }
}

async function loadInvocationSummary() {
  try {
    const rows = await queryRows<{
      total_invocations: string | number | null
      error_count: string | number | null
      gateway_count: string | number | null
      fallback_count: string | number | null
      estimated_cost_usd: string | number | null
      total_tokens: string | number | null
      last_seen_at: string | null
    }>(`
      SELECT
        COUNT(*) AS total_invocations,
        COUNT(*) FILTER (WHERE status <> 'success') AS error_count,
        COUNT(*) FILTER (WHERE gateway_used) AS gateway_count,
        COUNT(*) FILTER (WHERE fallback_used) AS fallback_count,
        COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        MAX(created_at) AS last_seen_at
      FROM ai_invocations
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `)
    const row = rows[0]
    return {
      available: true,
      readOnly: true,
      totalInvocations: toNumber(row?.total_invocations),
      errorCount: toNumber(row?.error_count),
      gatewayCount: toNumber(row?.gateway_count),
      fallbackCount: toNumber(row?.fallback_count),
      estimatedCostUsd: toNumber(row?.estimated_cost_usd),
      totalTokens: toNumber(row?.total_tokens),
      lastSeenAt: row?.last_seen_at ?? null,
    }
  } catch (error) {
    if (isMissingTableError(error)) return unavailable('ai_invocations table unavailable')
    throw error
  }
}

async function loadGraphifyStatus() {
  try {
    const rows = await queryRows<{
      graphify_path: string | null
      graphify_last_synced_at: string | null
    }>(`
      SELECT graphify_path, graphify_last_synced_at
      FROM project_repos
    `)
    const staleAfterMs = 14 * 24 * 60 * 60 * 1000
    const staleRepos = rows.filter((row) => {
      if (!row.graphify_path) return false
      if (!row.graphify_last_synced_at) return true
      const timestamp = new Date(row.graphify_last_synced_at).getTime()
      return !Number.isFinite(timestamp) || Date.now() - timestamp > staleAfterMs
    }).length

    return {
      available: true,
      readOnly: true,
      totalRepos: rows.length,
      configuredRepos: rows.filter((row) => Boolean(row.graphify_path)).length,
      missingPathRepos: rows.filter((row) => !row.graphify_path).length,
      staleRepos,
    }
  } catch (error) {
    if (isMissingTableError(error)) return unavailable('project_repos table unavailable')
    throw error
  }
}

async function loadAgentRunsStatus() {
  try {
    const rows = await queryRows<{
      total_runs: string | number | null
      completed_runs: string | number | null
      failed_runs: string | number | null
      running_runs: string | number | null
      last_run_at: string | null
    }>(`
      SELECT
        COUNT(*) AS total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_runs,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_runs,
        COUNT(*) FILTER (WHERE status = 'running') AS running_runs,
        MAX(started_at) AS last_run_at
      FROM ai_agent_runs
      WHERE started_at >= NOW() - INTERVAL '30 days'
    `)
    const row = rows[0]
    const totalRuns = toNumber(row?.total_runs)
    const failedRuns = toNumber(row?.failed_runs)
    return {
      available: true,
      readOnly: true,
      totalRuns,
      completedRuns: toNumber(row?.completed_runs),
      failedRuns,
      runningRuns: toNumber(row?.running_runs),
      lastRunAt: row?.last_run_at ?? null,
      failureRate: totalRuns > 0 ? failedRuns / totalRuns : 0,
    }
  } catch (error) {
    if (isMissingTableError(error)) return unavailable('ai_agent_runs table unavailable')
    throw error
  }
}

function defaultSpendPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

async function loadSocialSpendSyncStatus(input: Record<string, unknown> = {}) {
  try {
    const period = typeof input.period === 'string' && /^\d{4}-\d{2}$/.test(input.period)
      ? input.period
      : defaultSpendPeriod()
    const rows = await queryRows<{
      platform: string
      status: string
      period: string
      synced_count: string | number | null
      total_spend: string | number | null
      total_accounts: string | number | null
      processed_accounts: string | number | null
      failure_count: string | number | null
      started_at: string
      finished_at: string | null
    }>(`
      SELECT DISTINCT ON (platform)
        platform,
        status,
        period,
        synced_count,
        total_spend,
        total_accounts,
        processed_accounts,
        COALESCE(jsonb_array_length(failures), 0) AS failure_count,
        started_at,
        finished_at
      FROM spend_sync_jobs
      WHERE period = $1
      ORDER BY platform, started_at DESC
    `, [period])

    return {
      available: true,
      readOnly: true,
      period,
      runningJobs: rows.filter((row) => row.status === 'running').length,
      failedJobs: rows.filter((row) => row.status === 'failed').length,
      latestJobs: rows.map((row) => ({
        platform: row.platform,
        status: row.status,
        syncedCount: toNumber(row.synced_count),
        totalSpend: toNumber(row.total_spend),
        totalAccounts: toNumber(row.total_accounts),
        processedAccounts: toNumber(row.processed_accounts),
        failureCount: toNumber(row.failure_count),
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      })),
    }
  } catch (error) {
    if (isMissingTableError(error)) return unavailable('spend_sync_jobs table unavailable')
    throw error
  }
}

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const expectedKey = process.env.INTERNAL_API_KEY?.trim()

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event) as { tool?: unknown, input?: Record<string, unknown> }
  const tool = assertReadOnlyTool(body.tool)
  const startedAt = Date.now()

  try {
    if (tool === 'model_ops_model_map') {
      const rows = listAiModelMap()
      const response = {
        ok: true,
        tool,
        data: {
          rows,
          summary: getAiModelMapSummary(rows),
        },
      }
      await recordOrchestratorReadRun({ tool, startedAt, status: 'completed' })
      return response
    }

    if (tool === 'model_ops_invocations') {
      const response = { ok: true, tool, data: await loadInvocationSummary() }
      await recordOrchestratorReadRun({ tool, startedAt, status: 'completed' })
      return response
    }

    if (tool === 'model_ops_graphify_status') {
      const response = { ok: true, tool, data: await loadGraphifyStatus() }
      await recordOrchestratorReadRun({ tool, startedAt, status: 'completed' })
      return response
    }

    if (tool === 'model_ops_agent_runs') {
      const response = { ok: true, tool, data: await loadAgentRunsStatus() }
      await recordOrchestratorReadRun({ tool, startedAt, status: 'completed' })
      return response
    }

    if (tool === 'social_spend_sync_status') {
      const response = { ok: true, tool, data: await loadSocialSpendSyncStatus(body.input) }
      await recordOrchestratorReadRun({ tool, startedAt, status: 'completed' })
      return response
    }
  } catch (error) {
    await recordOrchestratorReadRun({ tool, startedAt, status: 'failed', error })
    throw error
  }

  return {
    ok: true,
    tool,
    data: unavailable('adapter unavailable'),
  }
})
