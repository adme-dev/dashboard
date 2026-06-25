// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { Suspense, computed, createApp, createSSRApp, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ModelOpsPage from '~~/app/pages/admin/ai/model-ops.vue'

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
    totalReports: 0,
    totalFindings: 0,
    totalNotifications: 0,
    avgDurationMs: 0,
    lastRunAt: null,
    failureRate: 0,
  },
  recent: [],
}

const responses: Record<string, unknown> = {
  '/api/admin/ai/model-ops/model-map': modelMapResponse,
  '/api/admin/ai/model-ops/invocations': invocationResponse,
  '/api/admin/ai/model-ops/graphify': graphifyResponse,
  '/api/admin/ai/model-ops/agent-runs': agentRunsResponse,
}

const stubs = {
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
  ;(globalThis as any).useFetch = vi.fn(async (url: string) => ({
    data: ref(url === '/api/admin/ai/model-ops/model-map' ? options.modelMap ?? responses[url] : responses[url]),
    pending: ref(false),
    error: ref(null),
    refresh: vi.fn(),
  }))
  ;(globalThis as any).$fetch = vi.fn()

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

  ;(globalThis as any).useFetch = vi.fn(async (url: string) => {
    const refresh = vi.fn()
    refreshMocks[url] = refresh
    return {
      data: ref(url === '/api/admin/ai/model-ops/model-map' ? options.modelMap ?? responses[url] : responses[url]),
      pending: ref(false),
      error: ref(null),
      refresh,
    }
  })
  ;(globalThis as any).$fetch = fetchMock

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
