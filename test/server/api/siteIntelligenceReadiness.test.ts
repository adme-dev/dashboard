import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  context: {
    cloudflare?: { env?: Record<string, unknown> }
  }
}

const mockRequireRole = vi.fn()
const mockCheckWorkflowReadiness = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/agencyWorkflows/client', () => ({
  checkAgencyWorkflowReadiness: (...args: unknown[]) => mockCheckWorkflowReadiness(...args)
}))

;(globalThis as { defineEventHandler?: <T>(handler: T) => T }).defineEventHandler = handler => handler

const { default: handler } = await import(
  '../../../../server/api/agency/site-intelligence/readiness.get'
)
const readiness = handler as (event: TestEvent) => Promise<Record<string, unknown>>

describe('site intelligence readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    mockCheckWorkflowReadiness.mockResolvedValue({
      ok: true,
      status: 'ready',
      worker: {
        capabilities: {
          browserRenderingApiConfigured: true,
          browserRenderingApiAuthenticated: true
        }
      }
    })
  })

  it('requires admin analytics access and returns only boolean configuration checks', async () => {
    const event: TestEvent = {
      context: {
        cloudflare: {
          env: {
            SITE_INTELLIGENCE_ENABLED: 'true',
            SITE_INTELLIGENCE_AI_ENABLED: 'true',
            SITE_INTELLIGENCE_BUCKET: { put() {}, get() {}, delete() {} },
            JOBS_QUEUE: { send() {} },
            AI: { run() {} },
            SITE_INTELLIGENCE_VECTORIZE: { upsert() {}, query() {}, deleteByIds() {} }
          }
        }
      }
    }

    const response = await readiness(event)

    expect(mockRequireRole).toHaveBeenCalledWith(event, ['owner', 'admin'])
    expect(mockCheckWorkflowReadiness).toHaveBeenCalledWith(event)
    expect(response).toEqual({
      ready: true,
      checks: {
        featureEnabled: true,
        workflowService: true,
        browserRenderingApi: true,
        r2: true,
        queue: true,
        aiEnabled: true,
        workersAi: true,
        vectorize: true
      },
      nearbyMarket: {
        enabled: false,
        browserKeyConfigured: false,
        mapIdConfigured: false,
        serverKeyConfigured: false,
        placesReady: false
      }
    })
    expect(JSON.stringify(response)).not.toMatch(/secret|token|accountId|bucketName|indexName/i)
  })

  it('fails closed when a required binding or the optional enabled AI path is incomplete', async () => {
    const response = await readiness({
      context: {
        cloudflare: {
          env: {
            SITE_INTELLIGENCE_ENABLED: 'true',
            SITE_INTELLIGENCE_AI_ENABLED: 'true',
            SITE_INTELLIGENCE_BUCKET: { put() {}, get() {}, delete() {} },
            JOBS_QUEUE: { send() {} }
          }
        }
      }
    })

    expect(response).toMatchObject({
      ready: false,
      checks: { workersAi: false, vectorize: false }
    })
  })

  it('fails closed when Browser Run credentials exist but Cloudflare rejects them', async () => {
    mockCheckWorkflowReadiness.mockResolvedValue({
      ok: true,
      status: 'ready',
      worker: {
        capabilities: {
          browserRenderingApiConfigured: true,
          browserRenderingApiAuthenticated: false
        }
      }
    })

    const response = await readiness({
      context: {
        cloudflare: {
          env: {
            SITE_INTELLIGENCE_ENABLED: 'true',
            SITE_INTELLIGENCE_AI_ENABLED: 'false',
            SITE_INTELLIGENCE_BUCKET: { put() {}, get() {}, delete() {} },
            JOBS_QUEUE: { send() {} }
          }
        }
      }
    })

    expect(response).toMatchObject({
      ready: false,
      checks: { browserRenderingApi: false }
    })
  })
})
