import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getHeader: (event: any, name: string) => string | undefined
  readBody: (event: any) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getHeader = (event, name) => event.headers?.[name.toLowerCase()]
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockQueryRows = vi.hoisted(() => vi.fn())
const mockExecute = vi.hoisted(() => vi.fn())

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

const { default: readToolHandler } = await import(
  '../../../../server/api/internal/ai-orchestrator/read-tool.post'
)
const { default: manualCheckHandler } = await import(
  '../../../../server/api/internal/ai-orchestrator/manual-check.post'
)

describe('internal AI orchestrator read-tool endpoint', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...oldEnv, INTERNAL_API_KEY: 'secret' }
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockExecute.mockResolvedValue(undefined)
  })

  it('rejects missing bearer auth', async () => {
    await expect(readToolHandler({
      headers: {},
      body: { tool: 'model_ops_model_map' },
    })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('returns model map data for the read-only model map tool', async () => {
    const result = await readToolHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tool: 'model_ops_model_map', input: {} },
    })

    expect(result).toMatchObject({
      ok: true,
      tool: 'model_ops_model_map',
    })
    expect(Array.isArray(result.data.rows)).toBe(true)
    expect(result.data.rows.some((row: any) => row.featureKey === 'social_spend_ai_analysis')).toBe(true)
    expect(result.data.summary.totalRows).toBe(result.data.rows.length)
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('accepts a trimmed bearer token when INTERNAL_API_KEY has surrounding whitespace', async () => {
    process.env.INTERNAL_API_KEY = '  secret  '

    const result = await readToolHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tool: 'model_ops_model_map', input: {} },
    })

    expect(result).toMatchObject({
      ok: true,
      tool: 'model_ops_model_map',
    })
  })

  it('returns compact invocation telemetry for the invocations tool', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      total_invocations: '12',
      error_count: '2',
      gateway_count: '9',
      fallback_count: '1',
      estimated_cost_usd: '0.045',
      total_tokens: '4567',
      last_seen_at: '2026-06-25T01:00:00.000Z',
    }])

    const result = await readToolHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tool: 'model_ops_invocations', input: {} },
    })

    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('FROM ai_invocations')
    expect(result).toEqual({
      ok: true,
      tool: 'model_ops_invocations',
      data: {
        available: true,
        readOnly: true,
        totalInvocations: 12,
        errorCount: 2,
        gatewayCount: 9,
        fallbackCount: 1,
        estimatedCostUsd: 0.045,
        totalTokens: 4567,
        lastSeenAt: '2026-06-25T01:00:00.000Z',
      },
    })
    expect(mockExecute.mock.calls[0]?.[0]).toContain('INSERT INTO ai_agent_runs')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      'completed',
      expect.any(Number),
      JSON.stringify([]),
      expect.stringContaining('model_ops_invocations'),
    ]))
  })

  it('does not fail read-tool responses when run logging fails', async () => {
    mockExecute.mockRejectedValueOnce(new Error('table unavailable'))
    mockQueryRows.mockResolvedValueOnce([{
      total_invocations: '1',
      error_count: '0',
      gateway_count: '1',
      fallback_count: '0',
      estimated_cost_usd: '0.001',
      total_tokens: '100',
      last_seen_at: '2026-06-25T01:00:00.000Z',
    }])

    const result = await readToolHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tool: 'model_ops_invocations', input: {} },
    })

    expect(result).toMatchObject({
      ok: true,
      tool: 'model_ops_invocations',
      data: { available: true, totalInvocations: 1 },
    })
  })

  it('returns compact Graphify status for the Graphify tool', async () => {
    mockQueryRows.mockResolvedValueOnce([
      { graphify_path: 'graph/app', graphify_last_synced_at: new Date().toISOString() },
      { graphify_path: null, graphify_last_synced_at: null },
    ])

    const result = await readToolHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tool: 'model_ops_graphify_status', input: {} },
    })

    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('FROM project_repos')
    expect(result).toMatchObject({
      ok: true,
      tool: 'model_ops_graphify_status',
      data: {
        available: true,
        readOnly: true,
        totalRepos: 2,
        configuredRepos: 1,
        missingPathRepos: 1,
      },
    })
    expect(result.data.staleRepos).toBe(0)
  })

  it('fails soft when Graphify repository metadata is unavailable', async () => {
    mockQueryRows.mockRejectedValueOnce(Object.assign(new Error('relation "project_repos" does not exist'), { code: '42P01' }))

    const result = await readToolHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tool: 'model_ops_graphify_status', input: {} },
    })

    expect(result).toEqual({
      ok: true,
      tool: 'model_ops_graphify_status',
      data: {
        available: false,
        reason: 'project_repos table unavailable',
        readOnly: true,
      },
    })
  })

  it('returns compact agent run status for the agent-runs tool', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      total_runs: '4',
      completed_runs: '2',
      failed_runs: '1',
      running_runs: '1',
      last_run_at: '2026-06-25T01:00:00.000Z',
    }])

    const result = await readToolHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tool: 'model_ops_agent_runs', input: {} },
    })

    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('FROM ai_agent_runs')
    expect(result).toEqual({
      ok: true,
      tool: 'model_ops_agent_runs',
      data: {
        available: true,
        readOnly: true,
        totalRuns: 4,
        completedRuns: 2,
        failedRuns: 1,
        runningRuns: 1,
        lastRunAt: '2026-06-25T01:00:00.000Z',
        failureRate: 0.25,
      },
    })
  })

  it('returns compact spend sync status for the social spend tool', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        platform: 'meta',
        status: 'running',
        period: '2026-06',
        synced_count: '0',
        total_spend: '0',
        total_accounts: '113',
        processed_accounts: '43',
        failure_count: '17',
        started_at: '2026-06-25T00:47:09.569Z',
        finished_at: null,
      },
      {
        platform: 'google',
        status: 'running',
        period: '2026-06',
        synced_count: '0',
        total_spend: '0',
        total_accounts: '102',
        processed_accounts: '37',
        failure_count: '37',
        started_at: '2026-06-25T00:47:09.568Z',
        finished_at: null,
      },
    ])

    const result = await readToolHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tool: 'social_spend_sync_status', input: { period: '2026-06' } },
    })

    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('FROM spend_sync_jobs')
    expect(result).toMatchObject({
      ok: true,
      tool: 'social_spend_sync_status',
      data: {
        available: true,
        readOnly: true,
        runningJobs: 2,
        failedJobs: 0,
        latestJobs: [
          expect.objectContaining({ platform: 'meta', processedAccounts: 43, failureCount: 17 }),
          expect.objectContaining({ platform: 'google', processedAccounts: 37, failureCount: 37 }),
        ],
      },
    })
  })

  it('rejects unknown tools before dispatch', async () => {
    await expect(readToolHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tool: 'confirm_budget_change', input: {} },
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Unsupported read-only orchestrator tool',
    })
  })
})

describe('internal AI orchestrator manual-check endpoint', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...oldEnv, INTERNAL_API_KEY: 'secret' }
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockExecute.mockResolvedValue(undefined)
  })

  it('rejects missing bearer auth', async () => {
    await expect(manualCheckHandler({
      headers: {},
      body: {},
    })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  })

  it('runs the current read-only tool bundle and summarizes results', async () => {
    mockQueryRows
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        total_invocations: '12',
        error_count: '2',
        gateway_count: '9',
        fallback_count: '1',
        estimated_cost_usd: '0.045',
        total_tokens: '4567',
        last_seen_at: '2026-06-25T01:00:00.000Z',
      }])
      .mockResolvedValueOnce([
        { graphify_path: 'graph/app', graphify_last_synced_at: new Date().toISOString() },
      ])
      .mockResolvedValueOnce([{
        total_runs: '4',
        completed_runs: '2',
        failed_runs: '1',
        running_runs: '1',
        last_run_at: '2026-06-25T01:00:00.000Z',
      }])
      .mockResolvedValueOnce([])

    const result = await manualCheckHandler({
      headers: { authorization: 'Bearer secret' },
      body: {},
    })

    expect(result.ok).toBe(true)
    expect(result.mode).toBe('manual_read_only_check')
    expect(result.summary).toMatchObject({
      totalTools: 5,
      successfulTools: 5,
      failedTools: 0,
      readOnly: true,
    })
    expect(result.results.map((row: any) => row.tool)).toEqual([
      'model_ops_model_map',
      'model_ops_invocations',
      'model_ops_graphify_status',
      'model_ops_agent_runs',
      'social_spend_sync_status',
    ])
    expect(result.results.every((row: any) => row.ok === true)).toBe(true)
    expect(mockExecute).toHaveBeenCalledTimes(5)
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('accepts a trimmed bearer token when INTERNAL_API_KEY has surrounding whitespace', async () => {
    process.env.INTERNAL_API_KEY = '  secret  '

    const result = await manualCheckHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tools: ['model_ops_model_map'] },
    })

    expect(result).toMatchObject({
      ok: true,
      mode: 'manual_read_only_check',
      summary: {
        totalTools: 1,
        successfulTools: 1,
        failedTools: 0,
        readOnly: true,
      },
    })
  })

  it('allows a safe subset and reports unsupported requested tools as failures', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      total_invocations: '1',
      error_count: '0',
      gateway_count: '1',
      fallback_count: '0',
      estimated_cost_usd: '0.001',
      total_tokens: '100',
      last_seen_at: '2026-06-25T01:00:00.000Z',
    }])

    const result = await manualCheckHandler({
      headers: { authorization: 'Bearer secret' },
      body: { tools: ['model_ops_invocations', 'confirm_budget_change'] },
    })

    expect(result.summary).toMatchObject({
      totalTools: 2,
      successfulTools: 1,
      failedTools: 1,
      readOnly: true,
    })
    expect(result.results).toEqual([
      expect.objectContaining({ tool: 'model_ops_invocations', ok: true }),
      expect.objectContaining({ tool: 'confirm_budget_change', ok: false }),
    ])
    expect(result.results[1].error).toContain('Unsupported read-only orchestrator tool')
  })
})
