import { requireRole } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const EXPECTED_PLATFORM_AGENT_BRIDGES = [
  '/tools/spend-controller/ask',
  '/tools/publishing-planner/ask',
  '/tools/financial-watch/ask',
  '/tools/traffic-controller/ask',
] as const

const DEFAULT_PLATFORM_AGENTS_WORKER_URL = 'https://platform-agents.adme-dev.workers.dev'

type PlatformAgentsBridgeCheckResult = {
  ok: boolean
  mode: 'platform_agents_read_only_bridge_check'
  summary: {
    readOnly: boolean
    workerReachable: boolean
    workerHealthy: boolean
    expectedBridges: number
    reportedBridges: number
    missingBridgeCount: number
    reportedAgents: number
  }
  worker: {
    status: number
    host: string | null
    name: string | null
    runtime: string | null
  }
  bridges: Array<{
    path: string
    reported: boolean
    mode: string | null
  }>
  error?: string
  telemetry?: {
    logged: boolean
    reason: string | null
  }
}

function present(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && !value.toLowerCase().includes('your_')
}

function host(value: string | undefined) {
  if (!value) return null
  try {
    return new URL(value).host
  } catch {
    return 'invalid-url'
  }
}

function durationSince(startedAtMs: number) {
  const duration = Date.now() - startedAtMs
  return Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : 0
}

async function recordBridgeCheckRun(result: PlatformAgentsBridgeCheckResult, startedAtMs: number, userId: string | null) {
  const errors = result.ok ? [] : [{ error: result.error || 'Platform Agents bridge check failed.' }]
  const summary = {
    source: 'platform_agent',
    agentType: 'bridge_check',
    featureKey: 'platform_agents_bridge',
    mode: 'read_only',
    userId,
    route: '/admin/ai/model-ops',
    worker: result.worker,
    bridgeCheck: result.summary,
    bridges: result.bridges,
    proposedActionCount: 0,
    blockedActionCount: 0,
  }

  await execute(`
    INSERT INTO ai_agent_runs (
      run_type,
      status,
      completed_at,
      duration_ms,
      checks_performed,
      findings_count,
      notifications_sent,
      errors,
      summary
    )
    VALUES (
      'platform_agent_bridge_check',
      $1,
      NOW(),
      $2,
      $3,
      $4,
      0,
      $5::jsonb,
      $6::jsonb
    )
  `, [
    result.ok ? 'completed' : 'failed',
    durationSince(startedAtMs),
    result.summary.expectedBridges,
    result.summary.missingBridgeCount + (result.summary.workerHealthy ? 0 : 1),
    JSON.stringify(errors),
    JSON.stringify(summary),
  ])
}

export default eventHandler(async (event) => {
  const actor = await requireRole(event, ['admin', 'owner'])

  const expectedKey = process.env.INTERNAL_API_KEY?.trim()
  if (!expectedKey) {
    throw createError({ statusCode: 503, statusMessage: 'INTERNAL_API_KEY is not configured' })
  }

  const workerUrl = process.env.PLATFORM_AGENTS_WORKER_URL || DEFAULT_PLATFORM_AGENTS_WORKER_URL
  const workerHost = host(workerUrl)
  if (!present(workerUrl) || workerHost === 'invalid-url') {
    throw createError({ statusCode: 503, statusMessage: 'PLATFORM_AGENTS_WORKER_URL is not configured' })
  }

  const healthUrl = `${workerUrl.replace(/\/+$/, '')}/health`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  const startedAtMs = Date.now()
  let result: PlatformAgentsBridgeCheckResult

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({})) as {
      ok?: boolean
      worker?: string
      runtime?: string
      agents?: Array<{ className?: string, route?: string, mode?: string }>
      bridges?: Array<{ path?: string, auth?: string, mode?: string }>
    }
    const reportedBridgePaths = new Set((body.bridges ?? []).map(bridge => bridge.path).filter(Boolean))
    const bridgeResults = EXPECTED_PLATFORM_AGENT_BRIDGES.map(path => ({
      path,
      reported: reportedBridgePaths.has(path),
      mode: body.bridges?.find(bridge => bridge.path === path)?.mode ?? null,
    }))
    const missingBridgeCount = bridgeResults.filter(bridge => !bridge.reported).length

    result = {
      ok: response.ok && body.ok === true && missingBridgeCount === 0,
      mode: 'platform_agents_read_only_bridge_check',
      summary: {
        readOnly: true,
        workerReachable: response.ok,
        workerHealthy: body.ok === true,
        expectedBridges: EXPECTED_PLATFORM_AGENT_BRIDGES.length,
        reportedBridges: bridgeResults.length - missingBridgeCount,
        missingBridgeCount,
        reportedAgents: body.agents?.length ?? 0,
      },
      worker: {
        status: response.status,
        host: workerHost,
        name: body.worker ?? null,
        runtime: body.runtime ?? null,
      },
      bridges: bridgeResults,
    }
  } catch (error: any) {
    result = {
      ok: false,
      mode: 'platform_agents_read_only_bridge_check',
      summary: {
        readOnly: true,
        workerReachable: false,
        workerHealthy: false,
        expectedBridges: EXPECTED_PLATFORM_AGENT_BRIDGES.length,
        reportedBridges: 0,
        missingBridgeCount: EXPECTED_PLATFORM_AGENT_BRIDGES.length,
        reportedAgents: 0,
      },
      worker: {
        status: 0,
        host: workerHost,
        name: null,
        runtime: null,
      },
      bridges: EXPECTED_PLATFORM_AGENT_BRIDGES.map(path => ({ path, reported: false, mode: null })),
      error: error?.name === 'AbortError' ? 'Platform Agents health check timed out.' : 'Platform Agents health check failed.',
    }
  } finally {
    clearTimeout(timeout)
  }

  try {
    await recordBridgeCheckRun(result, startedAtMs, typeof actor?.id === 'string' ? actor.id : null)
    result.telemetry = { logged: true, reason: null }
  } catch (error: any) {
    console.warn('[Model Ops] Platform Agents bridge check telemetry unavailable:', error)
    result.telemetry = {
      logged: false,
      reason: 'AI agent run telemetry is unavailable.',
    }
  }

  return result
})
