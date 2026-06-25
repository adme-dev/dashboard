import { describe, expect, it, vi } from 'vitest'
import {
  ORCHESTRATOR_READ_TOOLS,
  buildInternalToolRequest,
  callReadOnlyTool,
  getReadOnlyTool,
  normalizeApiBaseUrl,
} from '../../workers/ai-orchestrator-agent/src/contracts'
import worker from '../../workers/ai-orchestrator-agent/src/index'

describe('ai-orchestrator-agent read-only contracts', () => {
  it('keeps every exposed orchestrator tool read-only', () => {
    expect(ORCHESTRATOR_READ_TOOLS.length).toBeGreaterThan(3)
    expect(ORCHESTRATOR_READ_TOOLS.every((tool) => tool.mode === 'read')).toBe(true)
    expect(ORCHESTRATOR_READ_TOOLS.map((tool) => tool.name)).toEqual([
      'model_ops_model_map',
      'model_ops_invocations',
      'model_ops_graphify_status',
      'model_ops_agent_runs',
      'social_spend_sync_status',
    ])
  })

  it('rejects unknown or write-like tool names', () => {
    expect(getReadOnlyTool('model_ops_model_map')).toMatchObject({
      name: 'model_ops_model_map',
      mode: 'read',
    })
    expect(() => getReadOnlyTool('confirm_budget_change')).toThrow('not an allowed read-only orchestrator tool')
    expect(() => getReadOnlyTool('__proto__')).toThrow('not an allowed read-only orchestrator tool')
  })

  it('normalizes API base URLs before building internal requests', () => {
    expect(normalizeApiBaseUrl('https://app.xeroflow.io///')).toBe('https://app.xeroflow.io')

    const request = buildInternalToolRequest({
      apiUrl: 'https://app.xeroflow.io/',
      internalApiKey: 'secret',
      toolName: 'model_ops_invocations',
      input: { windowDays: 30 },
    })

    expect(request.url).toBe('https://app.xeroflow.io/api/internal/ai-orchestrator/read-tool')
    expect(request.init).toEqual({
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'model_ops_invocations',
        input: { windowDays: 30 },
      }),
    })
    expect(request.init.body).not.toContain('secret')
  })

  it('trims the internal bearer token before building app read-tool requests', () => {
    const request = buildInternalToolRequest({
      apiUrl: 'https://app.xeroflow.io/',
      internalApiKey: '  secret  ',
      toolName: 'model_ops_model_map',
      input: {},
    })

    expect(request.init.headers).toMatchObject({
      Authorization: 'Bearer secret',
    })
  })

  it('rejects blank internal bearer tokens before building app read-tool requests', () => {
    expect(() => buildInternalToolRequest({
      apiUrl: 'https://app.xeroflow.io/',
      internalApiKey: '   ',
      toolName: 'model_ops_model_map',
      input: {},
    })).toThrow('INTERNAL_API_KEY is not configured')
  })

  it('calls the app-controlled read-tool endpoint and returns JSON results', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      tool: 'model_ops_model_map',
      data: { rows: 3 },
    }), { status: 200 }))

    const result = await callReadOnlyTool({
      API_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret',
    }, 'model_ops_model_map', {}, fetcher as any)

    expect(fetcher).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/ai-orchestrator/read-tool',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual({
      ok: true,
      tool: 'model_ops_model_map',
      data: { rows: 3 },
    })
  })

  it('surfaces non-OK app endpoint responses as errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('denied', { status: 403 }))

    await expect(callReadOnlyTool({
      API_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret',
    }, 'model_ops_graphify_status', {}, fetcher as any)).rejects.toThrow(
      'model_ops_graphify_status failed (403): denied',
    )
  })

  it('does not fetch the app read-tool endpoint when INTERNAL_API_KEY is blank', async () => {
    const fetcher = vi.fn()

    await expect(callReadOnlyTool({
      API_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: '   ',
    }, 'model_ops_model_map', {}, fetcher as any)).rejects.toThrow('INTERNAL_API_KEY is not configured')

    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('ai-orchestrator-agent fetch routes', () => {
  const env = {
    API_URL: 'https://app.xeroflow.io',
    INTERNAL_API_KEY: 'secret',
  }

  it('returns the read-only tool catalog from /health', async () => {
    const response = await worker.fetch(new Request('https://worker.test/health'), env)
    const body = await response.json() as any

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      worker: 'ai-orchestrator-agent',
      mode: 'read-only-foundation',
    })
    expect(body.tools.map((tool: any) => tool.name)).toEqual(ORCHESTRATOR_READ_TOOLS.map((tool) => tool.name))
    expect(body.tools.every((tool: any) => tool.mode === 'read')).toBe(true)
  })

  it('proxies /tools/call to the internal app read-tool endpoint', async () => {
    const originalFetch = globalThis.fetch
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      tool: 'model_ops_model_map',
      data: { summary: { totalRows: 3 } },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)

    try {
      const response = await worker.fetch(new Request('https://worker.test/tools/call', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret' },
        body: JSON.stringify({ tool: 'model_ops_model_map', input: {} }),
      }), env)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(fetcher).toHaveBeenCalledWith(
        'https://app.xeroflow.io/api/internal/ai-orchestrator/read-tool',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
          method: 'POST',
        }),
      )
      expect(body).toEqual({
        ok: true,
        tool: 'model_ops_model_map',
        result: {
          ok: true,
          tool: 'model_ops_model_map',
          data: { summary: { totalRows: 3 } },
        },
      })
    } finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('rejects /tools/call without bearer auth before proxying to the app', async () => {
    const originalFetch = globalThis.fetch
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    try {
      const response = await worker.fetch(new Request('https://worker.test/tools/call', {
        method: 'POST',
        body: JSON.stringify({ tool: 'model_ops_model_map', input: {} }),
      }), env)
      const body = await response.json() as any

      expect(response.status).toBe(401)
      expect(body).toEqual({ ok: false, error: 'Unauthorized' })
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('rejects /tools/call with the wrong bearer token', async () => {
    const originalFetch = globalThis.fetch
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    try {
      const response = await worker.fetch(new Request('https://worker.test/tools/call', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong' },
        body: JSON.stringify({ tool: 'model_ops_model_map', input: {} }),
      }), env)
      const body = await response.json() as any

      expect(response.status).toBe(401)
      expect(body).toEqual({ ok: false, error: 'Unauthorized' })
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('rejects /tools/call when the Worker secret is blank before proxying to the app', async () => {
    const originalFetch = globalThis.fetch
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    try {
      const response = await worker.fetch(new Request('https://worker.test/tools/call', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret' },
        body: JSON.stringify({ tool: 'model_ops_model_map', input: {} }),
      }), {
        API_URL: 'https://app.xeroflow.io',
        INTERNAL_API_KEY: '   ',
      })
      const body = await response.json() as any

      expect(response.status).toBe(401)
      expect(body).toEqual({ ok: false, error: 'Unauthorized' })
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('accepts a trimmed bearer token when the Worker secret has surrounding whitespace', async () => {
    const originalFetch = globalThis.fetch
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      tool: 'model_ops_model_map',
      data: { summary: { totalRows: 3 } },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)

    try {
      const response = await worker.fetch(new Request('https://worker.test/tools/call', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret' },
        body: JSON.stringify({ tool: 'model_ops_model_map', input: {} }),
      }), {
        API_URL: 'https://app.xeroflow.io',
        INTERNAL_API_KEY: '  secret  ',
      })

      expect(response.status).toBe(200)
      expect(fetcher).toHaveBeenCalledWith(
        'https://app.xeroflow.io/api/internal/ai-orchestrator/read-tool',
        expect.objectContaining({ method: 'POST' }),
      )
    } finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('returns a 400 JSON error for rejected tool calls', async () => {
    const response = await worker.fetch(new Request('https://worker.test/tools/call', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ tool: 'confirm_budget_change', input: {} }),
    }), env)
    const body = await response.json() as any

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain('not an allowed read-only orchestrator tool')
  })

  it('returns 404 for unknown routes', async () => {
    const response = await worker.fetch(new Request('https://worker.test/write'), env)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })
})
