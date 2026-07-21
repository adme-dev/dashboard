// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { Suspense, computed, createApp, createSSRApp, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

Object.assign(globalThis, {
  computed,
  definePageMeta: vi.fn(),
  ref,
})

const modelMapResponse = {
  rows: [],
  summary: {
    totalRows: 12,
    providers: ['openai', 'groq'],
    highRiskCount: 1,
    warningCount: 2,
    overrideCount: 0,
    editableCount: 11,
    blockedDuplicateCount: 1,
    runtimeRoutedCount: 8,
    runtimePartialCount: 1,
    runtimeWorkerSideCount: 2,
    runtimeDirectCount: 1,
    runtimeControllableCount: 9,
  },
  config: {
    gateway: {
      configured: true,
      host: 'gateway.ai.cloudflare.com',
      authTokenConfigured: true,
    },
    providers: [
      {
        key: 'openai',
        label: 'OpenAI',
        configured: true,
        requiredFor: 'High-precision recommendations',
      },
    ],
    loop: {
      toolsEnabled: true,
      model: 'gpt-5.2',
      fallbackModel: 'gpt-5-mini',
      budgetUsd: 25,
      advisorBackend: 'cloudflare-ai-gateway',
    },
    orchestrator: {
      internalApiKeyConfigured: true,
      workerConfigured: true,
      workerHost: 'ai-orchestrator-agent.example.workers.dev',
      manualCheckReady: true,
      readToolCount: 5,
    },
    platformAgents: {
      internalApiKeyConfigured: true,
      workerConfigured: true,
      workerHost: 'platform-agents.example.workers.dev',
      bridgeReady: true,
      enabledFlagCount: 5,
      totalFlagCount: 5,
      flags: [
        { key: 'SPEND_CONTROLLER_AGENT_ENABLED', label: 'spend controller agent', enabled: true },
        { key: 'SPEND_CONTROLLER_AGENT_PROPOSALS_ENABLED', label: 'spend controller agent proposals', enabled: true },
        { key: 'PUBLISHING_PLANNER_AGENT_ENABLED', label: 'publishing planner agent', enabled: true },
        { key: 'FINANCIAL_WATCH_AGENT_ENABLED', label: 'financial watch agent', enabled: true },
        { key: 'TRAFFIC_CONTROLLER_AGENT_ENABLED', label: 'traffic controller agent', enabled: true },
      ],
      modes: [
        { agent: 'Spend Controller', mode: 'Read-only + proposal drafts' },
        { agent: 'Publishing Planner', mode: 'Read-only + draft suggestions' },
        { agent: 'Financial Watch', mode: 'Read-only' },
        { agent: 'Traffic Controller', mode: 'Read-only' },
      ],
    },
  },
  assignments: {
    available: true,
    reason: null,
    catalog: [
      {
        provider: 'groq',
        modelId: 'llama-3.3-70b-versatile',
        status: 'production',
        pricing: null,
        warnings: [],
      },
      {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        status: 'production',
        pricing: null,
        warnings: [],
      },
    ],
  },
}

const invocationResponse = {
  available: true,
  reason: null,
  health: {
    tableReady: true,
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
    mappedFeatureCount: 12,
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
  legacyMessages: {
    available: true,
    turns: 0,
    estimatedCostUsd: 0,
    totalTokens: 0,
    firstSeenAt: null,
    lastSeenAt: null,
  },
  recent: [],
}

const graphifyResponse = {
  available: true,
  r2Configured: true,
  staleAfterDays: 7,
  summary: {
    totalRepos: 0,
    configuredRepos: 0,
    readyRepos: 0,
    staleRepos: 0,
    issueRepos: 0,
    totalNodes: 0,
    totalEdges: 0,
    statusCounts: {
      ready: 0,
      stale: 0,
      missing_path: 0,
      missing_artifact: 0,
      r2_unconfigured: 0,
      error: 0,
    },
  },
  repos: [],
}

const agentRunsResponse = {
  available: true,
  reason: null,
  summary: {
    totalRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    runningRuns: 0,
    orchestratorReadToolRuns: 0,
    orchestratorReadToolFailures: 0,
    platformAgentRuns: 1,
    platformAgentFailures: 0,
    thinkTurnRuns: 1,
    thinkTurnFailures: 0,
    thinkToolFailures: 2,
    thinkRecoveryExhausted: 1,
    platformAgentProposedActions: 2,
    platformAgentBlockedActions: 1,
    platformAgentAcceptedProposals: 1,
    platformAgentRejectedProposals: 1,
    platformAgentEditedProposals: 1,
    platformAgentIgnoredProposals: 0,
    totalReports: 0,
    totalFindings: 0,
    totalNotifications: 0,
    avgDurationMs: 0,
    lastRunAt: null,
    failureRate: 0,
  },
  recent: [{
    id: 'run-spend-1',
    runType: 'platform_agent_spend_controller',
    status: 'completed',
    statusBucket: 'completed',
    startedAt: '2026-06-25T01:00:00.000Z',
    completedAt: '2026-06-25T01:00:01.000Z',
    durationMs: 1000,
    checksPerformed: 1,
    findingsCount: 2,
    notificationsSent: 0,
    reportCount: 0,
    unreadReportCount: 0,
    errorCount: 0,
    source: 'platform_agent',
    agentType: 'spend_controller',
    featureKey: 'agent_spend_controller',
    proposedActionCount: 2,
    blockedActionCount: 1,
    transport: 'cloudflare_think',
    correlationId: 'correlation-123',
    workerRequestId: 'worker-request-123',
    modelId: '@cf/moonshotai/kimi-k2.7-code',
    finishReason: 'stop',
    toolFailureCount: 2,
    failureStage: 'recovery',
    recoveryExhausted: true,
    proposalDecisionCounts: {
      accepted: 1,
      rejected: 1,
      edited: 1,
      ignored: 0,
    },
    summary: {},
    createdAt: '2026-06-25T01:00:01.000Z',
  }],
}

const responses: Record<string, unknown> = {
  '/api/admin/ai/model-ops/model-map': modelMapResponse,
  '/api/admin/ai/model-ops/invocations': invocationResponse,
  '/api/admin/ai/model-ops/graphify': graphifyResponse,
  '/api/admin/ai/model-ops/agent-runs': agentRunsResponse,
}

const stubs = {
  UDashboardPanel: {
    name: 'UDashboardPanel',
    template: '<main v-bind="$attrs"><slot name="body" /><slot /></main>',
  },
  UAlert: {
    name: 'UAlert',
    props: ['title', 'description'],
    template: '<section data-alert><strong>{{ title }}</strong><p>{{ description }}</p><slot /></section>',
  },
  UBadge: {
    name: 'UBadge',
    props: ['color', 'variant'],
    template: '<span data-badge><slot /></span>',
  },
  UButton: {
    name: 'UButton',
    props: ['disabled', 'icon', 'color', 'variant', 'loading'],
    template: '<button v-bind="$attrs" type="button" :disabled="disabled"><slot /></button>',
  },
  UCard: {
    name: 'UCard',
    props: ['ui'],
    template: '<article v-bind="$attrs"><header><slot name="header" /></header><slot /></article>',
  },
  UIcon: {
    name: 'UIcon',
    props: ['name'],
    template: '<i :data-icon="name" />',
  },
  USelect: {
    name: 'USelect',
    props: ['modelValue', 'items', 'disabled'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
  },
  UTextarea: {
    name: 'UTextarea',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

async function flushAsyncUi() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

async function render(options: { modelMap?: typeof modelMapResponse } = {}) {
  ;(globalThis as any).$fetch = vi.fn(async (url: string) => (
    url === '/api/admin/ai/model-ops/model-map'
      ? options.modelMap ?? responses[url]
      : responses[url]
  ))
  vi.resetModules()
  const ModelOpsPage = (await import('~~/app/pages/admin/ai/model-ops.vue')).default

  const app = createSSRApp({ render: () => h(ModelOpsPage) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  return renderToString(app)
}

async function mountPage(options: {
  fetchMock?: ReturnType<typeof vi.fn>
  fetchResult?: unknown
  modelMap?: typeof modelMapResponse
} = {}) {
  const host = document.createElement('div')
  const refreshMocks: Record<string, ReturnType<typeof vi.fn>> = {}
  const loadedUrls = new Set<string>()
  const fetchMock = options.fetchMock ?? vi.fn(async () => options.fetchResult ?? {
    ok: true,
    mode: 'manual_read_only_check',
    summary: {
      totalTools: 5,
      successfulTools: 4,
      failedTools: 1,
      readOnly: true,
    },
    results: [],
  })

  ;(globalThis as any).$fetch = vi.fn(async (url: string, requestOptions?: { method?: string }) => {
    if (!requestOptions?.method && url in responses) {
      const refresh = refreshMocks[url] ?? vi.fn()
      refreshMocks[url] = refresh
      if (loadedUrls.has(url)) refresh()
      else loadedUrls.add(url)
      return url === '/api/admin/ai/model-ops/model-map'
        ? options.modelMap ?? responses[url]
        : responses[url]
    }
    return fetchMock(url, requestOptions)
  })
  vi.resetModules()
  const ModelOpsPage = (await import('~~/app/pages/admin/ai/model-ops.vue')).default

  const app = createApp({
    render: () => h(Suspense, null, {
      default: () => h(ModelOpsPage),
      fallback: () => h('div', 'Loading'),
    }),
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  document.body.appendChild(host)
  app.mount(host)
  await flushAsyncUi()

  return { app, fetchMock, host, refreshMocks }
}

describe('Admin AI Model Ops page', () => {
  it('renders orchestrator readiness and the manual read-check action', async () => {
    const html = await render()

    expect(html).toContain('data-testid="orchestrator-readiness-card"')
    expect(html).toContain('data-testid="run-orchestrator-read-check"')
    expect(html).toContain('Manual check')
    expect(html).toContain('Ready')
    expect(html).toContain('Worker URL')
    expect(html).toContain('Configured')
    expect(html).toContain('Read tools')
    expect(html).toContain('5')
    expect(html).toContain('ai-orchestrator-agent.example.workers.dev')
  })

  it('renders platform agent bridge readiness and latest run state', async () => {
    const html = await render()

    expect(html).toContain('data-testid="platform-agent-readiness-card"')
    expect(html).toContain('Platform Agents')
    expect(html).toContain('data-testid="run-platform-agents-check"')
    expect(html).toContain('5 / 5')
    expect(html).toContain('platform-agents.example.workers.dev')
    expect(html).toContain('Spend Controller')
    expect(html).toContain('Read-only + proposal drafts')
    expect(html).toContain('run-spend-1')
  })

  it('renders operator-visible Think failures, recovery exhaustion, and correlation', async () => {
    const html = await render()

    expect(html).toContain('Think turns')
    expect(html).toContain('Tool failures')
    expect(html).toContain('Recovery exhausted')
    expect(html).toContain('correlation-123')
    expect(html).toContain('@cf/moonshotai/kimi-k2.7-code')
  })

  it('renders the model assignment brief and editable assignment controls', async () => {
    const modelMap = clone(modelMapResponse)
    modelMap.summary.overrideCount = 1
    modelMap.rows = [{
      featureKey: 'social_spend_ai_analysis',
      label: 'Social spend review panel analysis',
      surface: '/agency/social/spend',
      owner: 'Growth',
      provider: 'groq',
      modelId: 'llama-3.3-70b-versatile',
      fallback: null,
      modality: 'text',
      riskTier: 'high',
      sourceFile: 'server/api/agency/social/spend/[id]/ai-analysis.post.ts',
      status: 'production',
      pricing: null,
      warnings: [],
      defaultProvider: 'groq',
      defaultModelId: 'llama-3.1-8b-instant',
      defaultFallback: null,
      assignedProvider: 'groq',
      assignedModelId: 'llama-3.3-70b-versatile',
      assignedFallback: null,
      assignmentSource: 'override',
      assignmentEditable: true,
      assignmentNotes: 'Use stronger reasoning for brief.',
      assignmentUpdatedBy: 'user-1',
      assignmentUpdatedAt: '2026-06-25T01:00:00.000Z',
      runtimeRoutingStatus: 'runtime_routed',
      runtimeRoutingLabel: 'Runtime routed',
      runtimeControlEnabled: true,
      runtimeSupportedProviders: ['groq'],
      runtimeNotes: null,
    }]

    const html = await render({ modelMap })

    expect(html).toContain('Model assignment brief')
    expect(html).toContain('Runtime controlled')
    expect(html).toContain('Runtime routed')
    expect(html).toContain('Overrides')
    expect(html).toContain('Routing')
    expect(html).toContain('Health')
    expect(html).toContain('Override')
    expect(html).toContain('Default: llama-3.1-8b-instant')
    expect(html).toContain('Use stronger reasoning for brief.')
    expect(html).not.toContain('<th class="pb-2 pr-4">Provider</th>')
    expect(html).not.toContain('<th class="pb-2 pr-4">Pricing</th>')
  })

  it('disables the manual read-check action when the internal secret is missing', async () => {
    const modelMap = clone(modelMapResponse)
    modelMap.config.orchestrator.internalApiKeyConfigured = false
    modelMap.config.orchestrator.manualCheckReady = false

    const html = await render({ modelMap })

    expect(html).toContain('data-testid="run-orchestrator-read-check"')
    expect(html).toContain('disabled')
    expect(html).toContain('Missing secret')
    expect(html).toContain('Set INTERNAL_API_KEY to enable manual read checks.')
  })

  it('shows the manual read-check result after the action completes', async () => {
    const { app, fetchMock, host } = await mountPage()

    try {
      const button = host.querySelector('[data-testid="run-orchestrator-read-check"]') as HTMLButtonElement | null
      expect(button).toBeTruthy()

      button?.click()
      await flushAsyncUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/model-ops/orchestrator-check', { method: 'POST' })
      expect(host.textContent).toContain('Read-only orchestrator check complete')
    expect(host.textContent).toContain('4/5 tools succeeded')
  } finally {
    app.unmount()
    host.remove()
  }
  })

  it('shows the Platform Agents bridge check result after the action completes', async () => {
    const fetchResult = {
      ok: true,
      mode: 'platform_agents_read_only_bridge_check',
      summary: {
        readOnly: true,
        internalApiKeyConfigured: true,
        workerReachable: true,
        workerHealthy: true,
        expectedBridges: 4,
        reportedBridges: 4,
        missingBridgeCount: 0,
        reportedAgents: 4,
      },
      worker: {
        status: 200,
        host: 'platform-agents.example.workers.dev',
        name: 'platform-agents',
        runtime: 'cloudflare-think',
      },
      bridges: [],
    }
    const { app, fetchMock, host, refreshMocks } = await mountPage({ fetchResult })

    try {
      const button = host.querySelector('[data-testid="run-platform-agents-check"]') as HTMLButtonElement | null
      expect(button).toBeTruthy()

      button?.click()
      await flushAsyncUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/model-ops/platform-agents-check', { method: 'POST' })
      expect(host.textContent).toContain('Platform Agents bridge check complete')
      expect(host.textContent).toContain('4/4 bridges reported')
      expect(refreshMocks['/api/admin/ai/model-ops/agent-runs']).toHaveBeenCalledTimes(1)
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('keeps the Platform Agents bridge check enabled when only the internal key is missing', async () => {
    const modelMap = clone(modelMapResponse)
    modelMap.config.platformAgents.internalApiKeyConfigured = false
    modelMap.config.platformAgents.bridgeReady = false
    const { app, fetchMock, host } = await mountPage({ modelMap, fetchResult: {
      ok: false,
      mode: 'platform_agents_read_only_bridge_check',
      summary: {
        readOnly: true,
        internalApiKeyConfigured: false,
        workerReachable: true,
        workerHealthy: true,
        expectedBridges: 4,
        reportedBridges: 4,
        missingBridgeCount: 0,
        reportedAgents: 4,
      },
      worker: {
        status: 200,
        host: 'platform-agents.example.workers.dev',
        name: 'platform-agents',
        runtime: 'cloudflare-think',
      },
      bridges: [],
    } })

    try {
      const button = host.querySelector('[data-testid="run-platform-agents-check"]') as HTMLButtonElement | null
      expect(button).toBeTruthy()
      expect(button?.disabled).toBe(false)

      button?.click()
      await flushAsyncUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/model-ops/platform-agents-check', { method: 'POST' })
      expect(host.textContent).toContain('internal key is missing')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('disables the Platform Agents bridge check when the Worker URL is missing', async () => {
    const modelMap = clone(modelMapResponse)
    modelMap.config.platformAgents.workerConfigured = false
    modelMap.config.platformAgents.bridgeReady = false
    const fetchMock = vi.fn()
    const { app, host } = await mountPage({ fetchMock, modelMap })

    try {
      const button = host.querySelector('[data-testid="run-platform-agents-check"]') as HTMLButtonElement | null
      expect(button).toBeTruthy()
      expect(button?.disabled).toBe(true)

      button?.click()
      await flushAsyncUi()

      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('saves an edited assignment and updates the page response', async () => {
    const modelMap = clone(modelMapResponse)
    modelMap.rows = [{
      featureKey: 'social_spend_ai_analysis',
      label: 'Social spend review panel analysis',
      surface: '/agency/social/spend',
      owner: 'Growth',
      provider: 'groq',
      modelId: 'llama-3.1-8b-instant',
      fallback: null,
      modality: 'text',
      riskTier: 'high',
      sourceFile: 'server/api/agency/social/spend/[id]/ai-analysis.post.ts',
      status: 'production',
      pricing: null,
      warnings: [],
      defaultProvider: 'groq',
      defaultModelId: 'llama-3.1-8b-instant',
      defaultFallback: null,
      assignedProvider: 'groq',
      assignedModelId: 'llama-3.1-8b-instant',
      assignedFallback: null,
      assignmentSource: 'default',
      assignmentEditable: true,
      assignmentNotes: null,
      assignmentUpdatedBy: null,
      assignmentUpdatedAt: null,
      runtimeRoutingStatus: 'runtime_routed',
      runtimeRoutingLabel: 'Runtime routed',
      runtimeControlEnabled: true,
      runtimeSupportedProviders: ['groq'],
      runtimeNotes: null,
    }]
    const updated = clone(modelMap)
    updated.summary.overrideCount = 1
    updated.rows[0].assignmentSource = 'override'
    updated.rows[0].provider = 'groq'
    updated.rows[0].modelId = 'llama-3.3-70b-versatile'
    updated.rows[0].assignedProvider = 'groq'
    updated.rows[0].assignedModelId = 'llama-3.3-70b-versatile'
    const fetchMock = vi.fn().mockResolvedValueOnce({
      rows: updated.rows,
      summary: updated.summary,
      assignments: updated.assignments,
    })
    const { app, host } = await mountPage({ fetchMock, modelMap })

    try {
      const modelSelect = host.querySelector('[aria-label="Assigned model"]') as HTMLSelectElement | null
      expect(modelSelect).toBeTruthy()
      modelSelect!.value = 'llama-3.3-70b-versatile'
      modelSelect!.dispatchEvent(new Event('change'))
      await flushAsyncUi()

      const buttons = Array.from(host.querySelectorAll('button'))
      const saveButton = buttons.find(button => button.textContent?.includes('Save'))
      expect(saveButton?.disabled).toBe(false)

      saveButton?.click()
      await flushAsyncUi()

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ai/model-ops/assignments/social_spend_ai_analysis',
        {
          method: 'PATCH',
          body: {
            provider: 'groq',
            modelId: 'llama-3.3-70b-versatile',
            fallbackModelId: null,
            notes: null,
          },
        }
      )
      expect(host.textContent).toContain('Updated Social spend review panel analysis.')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('opens the Cloudflare catalog picker and applies a recommended model to the assignment draft', async () => {
    const modelMap = clone(modelMapResponse)
    modelMap.rows = [{
      featureKey: 'banner_copy_suggest',
      label: 'Banner Studio copy suggestion',
      surface: '/agency/banner-studio',
      owner: 'Creative',
      provider: 'workers_ai',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      fallback: 'llama-3.1-8b-instant',
      modality: 'text',
      riskTier: 'medium',
      sourceFile: 'server/api/agency/banner-studio/ai/copy-suggest.post.ts',
      status: 'production',
      pricing: null,
      warnings: [],
      defaultProvider: 'workers_ai',
      defaultModelId: '@cf/meta/llama-3.1-8b-instruct',
      defaultFallback: 'llama-3.1-8b-instant',
      assignedProvider: 'workers_ai',
      assignedModelId: '@cf/meta/llama-3.1-8b-instruct',
      assignedFallback: 'llama-3.1-8b-instant',
      assignmentSource: 'default',
      assignmentEditable: true,
      assignmentNotes: null,
      assignmentUpdatedBy: null,
      assignmentUpdatedAt: null,
      runtimeRoutingStatus: 'runtime_routed',
      runtimeRoutingLabel: 'Runtime routed',
      runtimeControlEnabled: true,
      runtimeSupportedProviders: ['workers_ai', 'groq'],
      runtimeNotes: null,
    }]
    const updated = clone(modelMap)
    updated.summary.overrideCount = 1
    updated.rows[0].assignmentSource = 'override'
    updated.rows[0].modelId = '@cf/meta/llama-3.1-8b-instruct-fast'
    updated.rows[0].assignedModelId = '@cf/meta/llama-3.1-8b-instruct-fast'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        available: true,
        configured: true,
        credentialSource: {
          accountId: 'CLOUDFLARE_ACCOUNT_ID',
          token: 'CLOUDFLARE_API_TOKEN',
        },
        source: 'cloudflare_api',
        reason: null,
        fetchedAt: '2026-06-26T00:00:00.000Z',
        feature: {
          featureKey: 'banner_copy_suggest',
          label: 'Banner Studio copy suggestion',
          modality: 'text',
          riskTier: 'medium',
          runtimeSupportedProviders: ['workers_ai', 'groq'],
        },
        summary: {
          totalModels: 1,
          filteredModels: 1,
          assignableModels: 1,
          recommendedModels: 1,
          providers: ['workers_ai'],
          tasks: ['text_generation'],
          capabilities: ['function_calling'],
        },
        models: [{
          id: '@cf/meta/llama-3.1-8b-instruct-fast',
          label: 'Llama 3.1 8B Instruct Fast',
          modelId: '@cf/meta/llama-3.1-8b-instruct-fast',
          provider: 'workers_ai',
          providerLabel: 'Cloudflare',
          task: 'text_generation',
          taskLabel: 'Text generation',
          modality: 'text',
          author: 'Meta',
          capabilities: ['function_calling'],
          source: 'cloudflare_hosted',
          status: 'production',
          description: null,
          assignable: true,
          recommendation: {
            level: 'recommended',
            score: 84,
            reasons: ['Runtime provider is supported for this feature.'],
            blockers: [],
          },
        }],
      })
      .mockResolvedValueOnce({
        rows: updated.rows,
        summary: updated.summary,
        assignments: updated.assignments,
      })
    const { app, host } = await mountPage({ fetchMock, modelMap })

    try {
      const browseButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Browse catalog'))
      expect(browseButton).toBeTruthy()

      browseButton?.click()
      await flushAsyncUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/model-ops/cloudflare-models', {
        query: {
          featureKey: 'banner_copy_suggest',
          search: undefined,
          provider: undefined,
          task: undefined,
          capability: undefined,
        },
      })
      expect(host.textContent).toContain('Cloudflare model catalog')
      expect(host.textContent).toContain('Llama 3.1 8B Instruct Fast')

      const useButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Use model'))
      useButton?.click()
      await flushAsyncUi()

      const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Save'))
      expect(saveButton?.disabled).toBe(false)
      saveButton?.click()
      await flushAsyncUi()

      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/admin/ai/model-ops/assignments/banner_copy_suggest',
        {
          method: 'PATCH',
          body: {
            provider: 'workers_ai',
            modelId: '@cf/meta/llama-3.1-8b-instruct-fast',
            fallbackModelId: 'llama-3.1-8b-instant',
            notes: null,
          },
        }
      )
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('runs Model Ops Copilot and applies a proposed assignment draft without saving it', async () => {
    const modelMap = clone(modelMapResponse)
    modelMap.rows = [{
      featureKey: 'banner_copy_suggest',
      label: 'Banner Studio copy suggestion',
      surface: '/agency/banner-studio',
      owner: 'Creative',
      provider: 'workers_ai',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      fallback: 'llama-3.1-8b-instant',
      modality: 'text',
      riskTier: 'medium',
      sourceFile: 'server/api/agency/banner-studio/ai/copy-suggest.post.ts',
      status: 'production',
      pricing: null,
      warnings: [],
      defaultProvider: 'workers_ai',
      defaultModelId: '@cf/meta/llama-3.1-8b-instruct',
      defaultFallback: 'llama-3.1-8b-instant',
      assignedProvider: 'workers_ai',
      assignedModelId: '@cf/meta/llama-3.1-8b-instruct',
      assignedFallback: 'llama-3.1-8b-instant',
      assignmentSource: 'default',
      assignmentEditable: true,
      assignmentNotes: null,
      assignmentUpdatedBy: null,
      assignmentUpdatedAt: null,
      runtimeRoutingStatus: 'runtime_routed',
      runtimeRoutingLabel: 'Runtime routed',
      runtimeControlEnabled: true,
      runtimeSupportedProviders: ['workers_ai', 'groq'],
      runtimeNotes: null,
    }]
    const fetchMock = vi.fn().mockResolvedValueOnce({
      mode: 'read_only',
      answer: 'For Banner Studio copy suggestion, draft the faster Cloudflare-hosted model.',
      findings: [{
        severity: 'info',
        title: 'Feature is runtime routed',
        detail: 'The dashboard assignment resolver controls this feature.',
        featureKey: 'banner_copy_suggest',
      }],
      recommendedActions: ['Review the draft and press Save if approved.'],
      proposedAssignment: {
        featureKey: 'banner_copy_suggest',
        provider: 'workers_ai',
        modelId: '@cf/meta/llama-3.1-8b-instruct-fast',
        fallbackModelId: 'llama-3.1-8b-instant',
        notes: 'Model Ops Copilot draft: faster Cloudflare-hosted model.',
        rationale: ['Runtime provider is supported for this feature.'],
      },
      context: {
        runtimeControllableCount: 1,
        overrideCount: 0,
        catalogSource: 'cloudflare_api',
        catalogAvailable: true,
        telemetryAvailable: true,
        fallbackRate: 0,
        errorRate: 0,
        gatewayRate: 1,
      },
    })
    const { app, host } = await mountPage({ fetchMock, modelMap })

    try {
      expect(host.textContent).toContain('Model Ops Copilot')

      const featureSelect = host.querySelector('[aria-label="Copilot feature scope"]') as HTMLSelectElement | null
      expect(featureSelect).toBeTruthy()
      featureSelect!.value = 'banner_copy_suggest'
      featureSelect!.dispatchEvent(new Event('change'))
      await flushAsyncUi()

      const askButton = host.querySelector('[data-testid="ask-model-ops-copilot"]') as HTMLButtonElement | null
      askButton?.click()
      await flushAsyncUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/model-ops/copilot', {
        method: 'POST',
        body: {
          prompt: 'Review Model Ops and recommend the next safest model assignment change.',
          featureKey: 'banner_copy_suggest',
        },
      })
      expect(host.textContent).toContain('For Banner Studio copy suggestion')
      expect(host.textContent).toContain('Requires Save')

      const applyButton = host.querySelector('[data-testid="apply-copilot-assignment"]') as HTMLButtonElement | null
      applyButton?.click()
      await flushAsyncUi()

      const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Save'))
      expect(saveButton?.disabled).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(host.textContent).toContain('Review it in the model map, then press Save')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('filters the compact model map by search text', async () => {
    const modelMap = clone(modelMapResponse)
    modelMap.rows = [
      {
        featureKey: 'banner_copy_suggest',
        label: 'Banner Studio copy suggestion',
        surface: '/agency/banner-studio',
        owner: 'Creative',
        provider: 'workers_ai',
        modelId: '@cf/meta/llama-3.1-8b-instruct',
        fallback: null,
        modality: 'text',
        riskTier: 'medium',
        sourceFile: 'server/api/agency/banner-studio/ai/copy-suggest.post.ts',
        status: 'production',
        pricing: null,
        warnings: [],
        defaultProvider: 'workers_ai',
        defaultModelId: '@cf/meta/llama-3.1-8b-instruct',
        defaultFallback: null,
        assignedProvider: 'workers_ai',
        assignedModelId: '@cf/meta/llama-3.1-8b-instruct',
        assignedFallback: null,
        assignmentSource: 'default',
        assignmentEditable: true,
        assignmentNotes: null,
        assignmentUpdatedBy: null,
        assignmentUpdatedAt: null,
        runtimeRoutingStatus: 'runtime_routed',
        runtimeRoutingLabel: 'Runtime routed',
        runtimeControlEnabled: true,
        runtimeSupportedProviders: ['workers_ai', 'groq'],
        runtimeNotes: null,
      },
      {
        featureKey: 'financial_advisor',
        label: 'Finance advisor',
        surface: '/agency/finance',
        owner: 'Finance',
        provider: 'groq',
        modelId: 'llama-3.3-70b-versatile',
        fallback: null,
        modality: 'text',
        riskTier: 'high',
        sourceFile: 'server/api/ai/financial-advisor.get.ts',
        status: 'production',
        pricing: null,
        warnings: [],
        defaultProvider: 'groq',
        defaultModelId: 'llama-3.3-70b-versatile',
        defaultFallback: null,
        assignedProvider: 'groq',
        assignedModelId: 'llama-3.3-70b-versatile',
        assignedFallback: null,
        assignmentSource: 'default',
        assignmentEditable: true,
        assignmentNotes: null,
        assignmentUpdatedBy: null,
        assignmentUpdatedAt: null,
        runtimeRoutingStatus: 'runtime_routed',
        runtimeRoutingLabel: 'Runtime routed',
        runtimeControlEnabled: true,
        runtimeSupportedProviders: ['groq', 'anthropic'],
        runtimeNotes: null,
      },
    ]
    const { app, host } = await mountPage({ modelMap })

    try {
      expect(host.textContent).toContain('2 of 2 rows')
      expect(host.textContent).toContain('Banner Studio copy suggestion')
      expect(host.textContent).toContain('Finance advisor')

      const search = host.querySelector('[aria-label="Search model map"]') as HTMLInputElement | null
      expect(search).toBeTruthy()
      search!.value = 'finance'
      search!.dispatchEvent(new Event('input'))
      await flushAsyncUi()

      expect(host.textContent).toContain('1 of 2 rows')
      const table = host.querySelector('[data-testid="model-map-table"]')
      expect(table?.textContent).toContain('Finance advisor')
      expect(table?.textContent).not.toContain('Banner Studio copy suggestion')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('refreshes Agent Runs telemetry after a successful manual read check', async () => {
    const { app, host, refreshMocks } = await mountPage()

    try {
      const button = host.querySelector('[data-testid="run-orchestrator-read-check"]') as HTMLButtonElement | null
      expect(button).toBeTruthy()

      button?.click()
      await flushAsyncUi()

      expect(refreshMocks['/api/admin/ai/model-ops/agent-runs']).toHaveBeenCalledTimes(1)
      expect(refreshMocks['/api/admin/ai/model-ops/model-map']).not.toHaveBeenCalled()
      expect(refreshMocks['/api/admin/ai/model-ops/invocations']).not.toHaveBeenCalled()
      expect(refreshMocks['/api/admin/ai/model-ops/graphify']).not.toHaveBeenCalled()
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('does not refresh Agent Runs telemetry after a failed manual read check', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce({
      data: { statusMessage: 'Manual check temporarily unavailable' },
    })
    const { app, host, refreshMocks } = await mountPage({ fetchMock })

    try {
      const button = host.querySelector('[data-testid="run-orchestrator-read-check"]') as HTMLButtonElement | null
      expect(button).toBeTruthy()

      button?.click()
      await flushAsyncUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/model-ops/orchestrator-check', { method: 'POST' })
      expect(host.textContent).toContain('Manual check temporarily unavailable')
      expect(refreshMocks['/api/admin/ai/model-ops/agent-runs']).not.toHaveBeenCalled()
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('does not post or refresh telemetry when the manual read check is not ready', async () => {
    const modelMap = clone(modelMapResponse)
    modelMap.config.orchestrator.internalApiKeyConfigured = false
    modelMap.config.orchestrator.manualCheckReady = false
    const fetchMock = vi.fn()
    const { app, host, refreshMocks } = await mountPage({ fetchMock, modelMap })

    try {
      const button = host.querySelector('[data-testid="run-orchestrator-read-check"]') as HTMLButtonElement | null
      expect(button).toBeTruthy()
      expect(button?.disabled).toBe(true)

      button?.click()
      await flushAsyncUi()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(refreshMocks['/api/admin/ai/model-ops/agent-runs']).not.toHaveBeenCalled()
      expect(host.textContent).toContain('Set INTERNAL_API_KEY to enable manual read checks.')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('shows a read-check error without keeping a stale success result', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        mode: 'manual_read_only_check',
        summary: {
          totalTools: 5,
          successfulTools: 5,
          failedTools: 0,
          readOnly: true,
        },
        results: [],
      })
      .mockRejectedValueOnce({
        data: { statusMessage: 'Manual check temporarily unavailable' },
      })
    const { app, host } = await mountPage({ fetchMock })

    try {
      const button = host.querySelector('[data-testid="run-orchestrator-read-check"]') as HTMLButtonElement | null
      expect(button).toBeTruthy()

      button?.click()
      await flushAsyncUi()
      expect(host.textContent).toContain('Read-only orchestrator check complete')
      expect(host.textContent).toContain('5/5 tools succeeded')

      button?.click()
      await flushAsyncUi()

      expect(host.textContent).toContain("Couldn't run orchestrator check")
      expect(host.textContent).toContain('Manual check temporarily unavailable')
      expect(host.textContent).not.toContain('Read-only orchestrator check complete')
      expect(host.textContent).not.toContain('5/5 tools succeeded')
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
