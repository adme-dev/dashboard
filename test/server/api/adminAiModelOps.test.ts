import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(fn: T) => T
  defineEventHandler: <T>(fn: T) => T
  getHeader: (event: any, name: string) => string | undefined
  readBody: (event: any) => Promise<unknown>
}

testGlobal.eventHandler = fn => fn
testGlobal.defineEventHandler = fn => fn
testGlobal.getHeader = (event, name) => event.headers?.[name.toLowerCase()]
testGlobal.readBody = async event => event.body ?? {}
;(globalThis as any).createError = (input: any) => input

const mockRequireRole = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockLoadGraph = vi.fn()
const mockLoadReport = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/graphify', async () => {
  const actual = await vi.importActual<any>('~~/server/utils/graphify')
  return {
    ...actual,
    loadGraph: (...args: unknown[]) => mockLoadGraph(...args),
    loadReport: (...args: unknown[]) => mockLoadReport(...args),
  }
})

const { default: modelMapHandler } = await import(
  '../../../../server/api/admin/ai/model-ops/model-map.get'
)
const { default: invocationsHandler } = await import(
  '../../../../server/api/admin/ai/model-ops/invocations.get'
)
const { default: graphifyHandler } = await import(
  '../../../../server/api/admin/ai/model-ops/graphify.get'
)
const { default: agentRunsHandler } = await import(
  '../../../../server/api/admin/ai/model-ops/agent-runs.get'
)
const { default: orchestratorCheckHandler } = await import(
  '../../../../server/api/admin/ai/model-ops/orchestrator-check.post'
)
const { default: assignmentPatchHandler } = await import(
  '../../../../server/api/admin/ai/model-ops/assignments/[featureKey].patch'
)
const { default: assignmentDeleteHandler } = await import(
  '../../../../server/api/admin/ai/model-ops/assignments/[featureKey].delete'
)

describe('GET /api/admin/ai/model-ops/model-map', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...oldEnv }
    mockRequireRole.mockReset()
    mockQueryRows.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockQueryRows.mockResolvedValue([])
  })

  it('requires admin access and returns the static model map', async () => {
    process.env.AI_GATEWAY_URL = 'https://gateway.ai.cloudflare.com/v1/account/default'
    process.env.GROQ_API = 'groq-secret'
    process.env.AI_LOOP_MODEL = 'groq/openai/gpt-oss-120b'
    process.env.AI_LOOP_FALLBACK_MODEL = 'groq/openai/gpt-oss-20b'
    process.env.AI_LOOP_BUDGET_USD = '0.50'
    process.env.INTERNAL_API_KEY = 'internal-secret'
    process.env.AI_ORCHESTRATOR_WORKER_URL = 'https://ai-orchestrator-agent.example.workers.dev'

    const result = await modelMapHandler({})

    expect(mockRequireRole).toHaveBeenCalledWith({}, ['admin', 'owner'])
    expect(Array.isArray(result.rows)).toBe(true)
    expect(result.rows.some((row: any) => row.featureKey === 'agency_ai_tool_loop')).toBe(true)
    expect(result.summary.totalRows).toBe(result.rows.length)
    expect(result.summary.overrideCount).toBe(0)
    expect(result.assignments).toMatchObject({
      available: true,
      reason: null,
    })
    expect(result.assignments.catalog.length).toBeGreaterThan(0)
    expect(result.config.gateway).toMatchObject({
      configured: true,
      host: 'gateway.ai.cloudflare.com',
      authTokenConfigured: false,
    })
    expect(result.config.providers.find((provider: any) => provider.key === 'groq')).toMatchObject({
      configured: true,
    })
    expect(result.config.loop).toMatchObject({
      toolsEnabled: false,
      model: 'groq/openai/gpt-oss-120b',
      fallbackModel: 'groq/openai/gpt-oss-20b',
      budgetUsd: 0.5,
      advisorBackend: 'groq',
    })
    expect(result.config.orchestrator).toMatchObject({
      internalApiKeyConfigured: true,
      workerConfigured: true,
      workerHost: 'ai-orchestrator-agent.example.workers.dev',
      manualCheckReady: true,
      readToolCount: 5,
    })
  })

  it('treats a whitespace-only INTERNAL_API_KEY as not ready for manual orchestrator checks', async () => {
    process.env.INTERNAL_API_KEY = '   '

    const result = await modelMapHandler({})

    expect(result.config.orchestrator).toMatchObject({
      internalApiKeyConfigured: false,
      manualCheckReady: false,
    })
  })

  it('merges admin assignment overrides into the model map', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      feature_key: 'social_spend_ai_analysis',
      provider: 'anthropic',
      model_id: 'claude-sonnet-4-6',
      fallback_model_id: 'llama-3.3-70b-versatile',
      notes: 'Use stronger reasoning for pacing review brief.',
      updated_by: 'b4a0a130-48da-444b-8fdc-d91db8923318',
      updated_at: '2026-06-25T01:00:00.000Z',
      created_at: '2026-06-25T00:00:00.000Z',
    }])

    const result = await modelMapHandler({})
    const row = result.rows.find((item: any) => item.featureKey === 'social_spend_ai_analysis')

    expect(row).toMatchObject({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      fallback: 'llama-3.3-70b-versatile',
      defaultProvider: 'groq',
      assignmentSource: 'override',
      assignmentNotes: 'Use stronger reasoning for pacing review brief.',
    })
    expect(result.summary.overrideCount).toBe(1)
  })
})

describe('PATCH /api/admin/ai/model-ops/assignments/:featureKey', () => {
  beforeEach(() => {
    mockRequireRole.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'b4a0a130-48da-444b-8fdc-d91db8923318', role: 'admin' })
    mockQueryRows.mockResolvedValue([])
    mockExecute.mockResolvedValue(1)
  })

  it('validates and saves an editable model assignment override', async () => {
    const result = await assignmentPatchHandler({
      context: { params: { featureKey: 'social_spend_ai_analysis' } },
      body: {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        fallbackModelId: 'llama-3.3-70b-versatile',
        notes: 'Use stronger reasoning for pacing review brief.',
      },
    } as any)

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['admin', 'owner'])
    expect(mockExecute.mock.calls[0]?.[0]).toContain('INSERT INTO ai_model_assignments')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual([
      'social_spend_ai_analysis',
      'anthropic',
      'claude-sonnet-4-6',
      'llama-3.3-70b-versatile',
      'Use stronger reasoning for pacing review brief.',
      'b4a0a130-48da-444b-8fdc-d91db8923318',
    ])
    expect(mockExecute.mock.calls[1]?.[0]).toContain('INSERT INTO ai_model_assignment_audit')
    expect(result.rows.length).toBeGreaterThan(0)
  })

  it('rejects duplicate feature keys until they are split into unique rows', async () => {
    await expect(assignmentPatchHandler({
      context: { params: { featureKey: 'video_generation_job' } },
      body: { provider: 'groq', modelId: 'llama-3.3-70b-versatile' },
    } as any)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('rejects unknown models', async () => {
    await expect(assignmentPatchHandler({
      context: { params: { featureKey: 'social_spend_ai_analysis' } },
      body: { provider: 'groq', modelId: 'made-up-model' },
    } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Unsupported model ID.',
    })
  })
})

describe('DELETE /api/admin/ai/model-ops/assignments/:featureKey', () => {
  beforeEach(() => {
    mockRequireRole.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'b4a0a130-48da-444b-8fdc-d91db8923318', role: 'owner' })
    mockQueryRows.mockResolvedValue([])
    mockExecute.mockResolvedValue(1)
  })

  it('resets an assignment override and records audit', async () => {
    await assignmentDeleteHandler({
      context: { params: { featureKey: 'social_spend_ai_analysis' } },
    } as any)

    expect(mockExecute.mock.calls[0]?.[0]).toContain('DELETE FROM ai_model_assignments')
    expect(mockExecute.mock.calls[1]?.[0]).toContain("VALUES ($1, 'reset'")
  })
})

describe('GET /api/admin/ai/model-ops/invocations', () => {
  beforeEach(() => {
    mockRequireRole.mockReset()
    mockQueryRows.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'user-1', role: 'admin' })
  })

  it('requires admin access and returns usage summaries', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{
        total_rows: '8',
        oldest_row_at: '2026-06-24T00:00:00.000Z',
        newest_row_at: '2026-06-25T01:00:00.000Z',
        request_rows: '3',
        runtime_rows: '2',
        completion_rows: '1',
        distinct_features: '5',
        distinct_models: '4',
      }])
      .mockResolvedValueOnce([
        { feature_key: 'social_spend_ai_analysis', invocations: '2', last_seen_at: '2026-06-25T01:00:00.000Z' },
        { feature_key: 'video_generation_worker_runtime', invocations: '1', last_seen_at: '2026-06-25T01:00:00.000Z' },
        { feature_key: 'unknown_future_feature', invocations: '1', last_seen_at: '2026-06-25T01:00:00.000Z' },
      ])
      .mockResolvedValueOnce([{
        total_invocations: '4',
        success_count: '3',
        error_count: '1',
        gateway_count: '2',
        fallback_count: '1',
        total_tokens: '1200',
        estimated_cost_usd: '0.0123',
        avg_latency_ms: '650.4',
        first_seen_at: '2026-06-25T00:00:00.000Z',
        last_seen_at: '2026-06-25T01:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        key: 'social_spend_ai_analysis',
        invocations: '2',
        estimated_cost_usd: '0.01',
        total_tokens: '900',
        fallback_count: '1',
        error_count: '0',
      }])
      .mockResolvedValueOnce([{
        key: 'openai/gpt-oss-120b',
        invocations: '2',
        estimated_cost_usd: '0.01',
        total_tokens: '900',
        fallback_count: '1',
        error_count: '0',
      }])
      .mockResolvedValueOnce([{
        id: 'inv-1',
        feature_key: 'social_spend_ai_analysis',
        provider: 'groq',
        model_id: 'openai/gpt-oss-120b',
        gateway_used: true,
        fallback_used: false,
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        estimated_cost_usd: '0.000045',
        status: 'success',
        error_code: null,
        latency_ms: 430,
        created_at: '2026-06-25T01:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        turns: '6',
        estimated_cost_usd: '0.0345',
        total_tokens: '3450',
        first_seen_at: '2026-06-24T00:00:00.000Z',
        last_seen_at: '2026-06-25T01:00:00.000Z',
      }])

    const result = await invocationsHandler({})

    expect(mockRequireRole).toHaveBeenCalledWith({}, ['admin', 'owner'])
    expect(mockQueryRows.mock.calls[6]?.[0]).toContain('FROM ai_messages')
    expect(mockQueryRows.mock.calls[6]?.[0]).not.toContain('content')
    expect(result.available).toBe(true)
    expect(result.health).toMatchObject({
      tableReady: true,
      totalRows: 8,
      requestRows: 3,
      runtimeRows: 2,
      completionRows: 1,
      distinctFeatures: 5,
      distinctModels: 4,
      hasRequestTelemetry: true,
      hasRuntimeTelemetry: true,
      hasCompletionTelemetry: true,
    })
    expect(result.coverage.mappedFeatureCount).toBeGreaterThan(2)
    expect(result.coverage.seenMappedFeatureCount).toBe(2)
    expect(result.coverage.unmappedSeenFeatureCount).toBe(1)
    expect(result.coverage.missingMappedFeatureKeys).toContain('agency_ai_tool_loop')
    expect(result.coverage.unmappedSeenFeatureKeys).toEqual(['unknown_future_feature'])
    expect(result.summary.totalInvocations).toBe(4)
    expect(result.summary.fallbackRate).toBe(0.25)
    expect(result.summary.errorRate).toBe(0.25)
    expect(result.summary.gatewayRate).toBe(0.5)
    expect(result.byFeature[0].key).toBe('social_spend_ai_analysis')
    expect(result.byModel[0].key).toBe('openai/gpt-oss-120b')
    expect(result.recent[0].featureKey).toBe('social_spend_ai_analysis')
    expect(result.legacyMessages).toMatchObject({
      available: true,
      turns: 6,
      estimatedCostUsd: 0.0345,
      totalTokens: 3450,
      firstSeenAt: '2026-06-24T00:00:00.000Z',
      lastSeenAt: '2026-06-25T01:00:00.000Z',
    })
  })

  it('returns an unavailable empty payload when the ledger table is missing', async () => {
    const missingTable = new Error('relation "ai_invocations" does not exist') as Error & { code: string }
    missingTable.code = '42P01'
    mockQueryRows.mockRejectedValueOnce(missingTable)

    const result = await invocationsHandler({})

    expect(result.available).toBe(false)
    expect(result.health.tableReady).toBe(false)
    expect(result.coverage.seenMappedFeatureCount).toBe(0)
    expect(result.summary.totalInvocations).toBe(0)
    expect(result.recent).toEqual([])
  })
})

describe('GET /api/admin/ai/model-ops/graphify', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...oldEnv }
    mockRequireRole.mockReset()
    mockQueryRows.mockReset()
    mockLoadGraph.mockReset()
    mockLoadReport.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'user-1', role: 'admin' })
  })

  it('requires admin access and returns Graphify artifact status', async () => {
    process.env.R2_ACCOUNT_ID = 'account'
    process.env.R2_ACCESS_KEY_ID = 'key'
    process.env.R2_SECRET_ACCESS_KEY = 'secret'
    process.env.R2_BUCKET_NAME = 'agency-files'
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'repo-1',
        repo_url: 'https://github.com/acme/app',
        provider: 'github',
        default_branch: 'main',
        graphify_path: 'graphify/app',
        graphify_last_synced_at: new Date().toISOString(),
        updated_at: '2026-06-25T00:00:00.000Z',
        department_id: 'board-1',
        department_name: 'Engineering',
        department_slug: 'engineering',
      },
    ])
    mockLoadGraph.mockResolvedValueOnce({
      nodes: [{ id: 'n1', label: 'App' }, { id: 'n2', label: 'Server' }],
      links: [{ source: 'n1', target: 'n2', relation: 'imports' }],
      graph: { hyperedges: [{ id: 'h1' }] },
    })
    mockLoadReport.mockResolvedValueOnce('# Report')

    const result = await graphifyHandler({})

    expect(mockRequireRole).toHaveBeenCalledWith({}, ['admin', 'owner'])
    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('FROM project_repos pr')
    expect(mockLoadGraph).toHaveBeenCalledWith('graphify/app')
    expect(mockLoadReport).toHaveBeenCalledWith('graphify/app')
    expect(result.r2Configured).toBe(true)
    expect(result.summary).toMatchObject({
      totalRepos: 1,
      configuredRepos: 1,
      readyRepos: 1,
      issueRepos: 0,
      totalNodes: 2,
      totalEdges: 1,
    })
    expect(result.repos[0]).toMatchObject({
      repoUrl: 'https://github.com/acme/app',
      graphifyPath: 'graphify/app',
      status: 'ready',
      nodeCount: 2,
      edgeCount: 1,
      hyperedgeCount: 1,
      reportChars: 8,
      board: {
        name: 'Engineering',
        slug: 'engineering',
      },
    })
  })

  it('fails soft when R2 is not configured', async () => {
    delete process.env.R2_ACCOUNT_ID
    delete process.env.R2_ACCESS_KEY_ID
    delete process.env.R2_SECRET_ACCESS_KEY
    delete process.env.R2_BUCKET_NAME
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'repo-1',
        repo_url: 'https://github.com/acme/app',
        provider: 'github',
        default_branch: 'main',
        graphify_path: 'graphify/app',
        graphify_last_synced_at: null,
        updated_at: '2026-06-25T00:00:00.000Z',
        department_id: 'board-1',
        department_name: 'Engineering',
        department_slug: 'engineering',
      },
      {
        id: 'repo-2',
        repo_url: 'https://github.com/acme/empty',
        provider: 'github',
        default_branch: 'main',
        graphify_path: null,
        graphify_last_synced_at: null,
        updated_at: '2026-06-25T00:00:00.000Z',
        department_id: 'board-2',
        department_name: 'Ops',
        department_slug: 'ops',
      },
    ])

    const result = await graphifyHandler({})

    expect(mockLoadGraph).not.toHaveBeenCalled()
    expect(mockLoadReport).not.toHaveBeenCalled()
    expect(result.r2Configured).toBe(false)
    expect(result.summary).toMatchObject({
      totalRepos: 2,
      configuredRepos: 1,
      readyRepos: 0,
      issueRepos: 2,
    })
    expect(result.summary.statusCounts).toMatchObject({
      r2_unconfigured: 1,
      missing_path: 1,
    })
    expect(result.repos.map((repo: any) => repo.status)).toEqual(['r2_unconfigured', 'missing_path'])
  })

  it('limits concurrent Graphify artifact inspections', async () => {
    process.env.R2_ACCOUNT_ID = 'account'
    process.env.R2_ACCESS_KEY_ID = 'key'
    process.env.R2_SECRET_ACCESS_KEY = 'secret'
    process.env.R2_BUCKET_NAME = 'agency-files'
    mockQueryRows.mockResolvedValueOnce(Array.from({ length: 7 }, (_, index) => ({
      id: `repo-${index + 1}`,
      repo_url: `https://github.com/acme/app-${index + 1}`,
      provider: 'github',
      default_branch: 'main',
      graphify_path: `graphify/app-${index + 1}`,
      graphify_last_synced_at: new Date().toISOString(),
      updated_at: '2026-06-25T00:00:00.000Z',
      department_id: 'board-1',
      department_name: 'Engineering',
      department_slug: 'engineering',
    })))

    let activeLoads = 0
    let maxActiveLoads = 0
    mockLoadGraph.mockImplementation(async () => {
      activeLoads += 1
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads)
      await new Promise(resolve => setTimeout(resolve, 1))
      activeLoads -= 1
      return { nodes: [], links: [], graph: { hyperedges: [] } }
    })
    mockLoadReport.mockResolvedValue('')

    const result = await graphifyHandler({})

    expect(result.summary.totalRepos).toBe(7)
    expect(mockLoadGraph).toHaveBeenCalledTimes(7)
    expect(maxActiveLoads).toBeLessThanOrEqual(4)
  })

  it('returns an unavailable empty payload when repository metadata is missing', async () => {
    const missingTable = new Error('relation "project_repos" does not exist') as Error & { code: string }
    missingTable.code = '42P01'
    mockQueryRows.mockRejectedValueOnce(missingTable)

    const result = await graphifyHandler({})

    expect(result.available).toBe(false)
    expect(result.reason).toContain('Project repository metadata is missing')
    expect(result.summary.totalRepos).toBe(0)
    expect(result.repos).toEqual([])
    expect(mockLoadGraph).not.toHaveBeenCalled()
    expect(mockLoadReport).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/ai/model-ops/agent-runs', () => {
  beforeEach(() => {
    mockRequireRole.mockReset()
    mockQueryRows.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'user-1', role: 'admin' })
  })

  it('requires admin access and returns agent run summaries without report content', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{
        total_runs: '4',
        completed_runs: '2',
        failed_runs: '1',
        running_runs: '1',
        orchestrator_read_tool_runs: '3',
        orchestrator_read_tool_failures: '1',
        total_reports: '7',
        total_findings: '18',
        total_notifications: '6',
        avg_duration_ms: '1234.4',
        last_run_at: '2026-06-25T01:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        id: 'run-1',
        run_type: 'daily_digest',
        status: 'completed',
        started_at: '2026-06-25T00:59:00.000Z',
        completed_at: '2026-06-25T01:00:00.000Z',
        duration_ms: '60000',
        checks_performed: '8',
        findings_count: '12',
        notifications_sent: '3',
        errors: [],
        summary: { reportCount: 3, teamMembersProcessed: 5 },
        report_count: '3',
        unread_report_count: '2',
        created_at: '2026-06-25T01:00:00.000Z',
      }])

    const result = await agentRunsHandler({})

    expect(mockRequireRole).toHaveBeenCalledWith({}, ['admin', 'owner'])
    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('FROM ai_agent_runs r')
    expect(mockQueryRows.mock.calls[1]?.[0]).toContain('LEFT JOIN ai_agent_reports rep')
    expect(result.available).toBe(true)
    expect(result.summary).toMatchObject({
      totalRuns: 4,
        completedRuns: 2,
        failedRuns: 1,
        runningRuns: 1,
        orchestratorReadToolRuns: 3,
        orchestratorReadToolFailures: 1,
        totalReports: 7,
        totalFindings: 18,
        totalNotifications: 6,
      avgDurationMs: 1234,
      failureRate: 0.25,
    })
    expect(result.recent[0]).toMatchObject({
      id: 'run-1',
      runType: 'daily_digest',
      status: 'completed',
      statusBucket: 'completed',
      durationMs: 60000,
      checksPerformed: 8,
      findingsCount: 12,
      notificationsSent: 3,
      reportCount: 3,
      unreadReportCount: 2,
      errorCount: 0,
    })
    expect(JSON.stringify(result)).not.toContain('content')
  })

  it('returns an unavailable empty payload when the agent run table is missing', async () => {
    const missingTable = new Error('relation "ai_agent_runs" does not exist') as Error & { code: string }
    missingTable.code = '42P01'
    mockQueryRows.mockRejectedValueOnce(missingTable)

    const result = await agentRunsHandler({})

    expect(result.available).toBe(false)
    expect(result.summary.totalRuns).toBe(0)
    expect(result.recent).toEqual([])
  })
})

describe('POST /api/admin/ai/model-ops/orchestrator-check', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...oldEnv, INTERNAL_API_KEY: 'secret' }
    mockRequireRole.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockExecute.mockResolvedValue(undefined)
  })

  it('requires admin access before running the internal manual check', async () => {
    await orchestratorCheckHandler({ body: { tools: ['model_ops_model_map'] } })

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['admin', 'owner'])
  })

  it('returns a configuration error when INTERNAL_API_KEY is missing', async () => {
    delete process.env.INTERNAL_API_KEY

    await expect(orchestratorCheckHandler({ body: { tools: ['model_ops_model_map'] } })).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'INTERNAL_API_KEY is not configured',
    })
  })

  it('returns a configuration error when INTERNAL_API_KEY is blank', async () => {
    process.env.INTERNAL_API_KEY = '   '

    await expect(orchestratorCheckHandler({ body: { tools: ['model_ops_model_map'] } })).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'INTERNAL_API_KEY is not configured',
    })
  })

  it('runs the internal read-only manual check and returns the result without exposing secrets', async () => {
    const result = await orchestratorCheckHandler({
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
    expect(result.results[0]).toMatchObject({
      tool: 'model_ops_model_map',
      ok: true,
    })
    expect(mockExecute.mock.calls[0]?.[0]).toContain('INSERT INTO ai_agent_runs')
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})
