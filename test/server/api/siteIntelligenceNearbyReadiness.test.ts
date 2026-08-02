import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  context: { cloudflare?: { env?: Record<string, unknown> } }
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

function event(overrides: Record<string, unknown> = {}): TestEvent {
  return {
    context: {
      cloudflare: {
        env: {
          SITE_INTELLIGENCE_ENABLED: 'true',
          SITE_INTELLIGENCE_AI_ENABLED: 'false',
          SITE_INTELLIGENCE_BUCKET: { put() {}, get() {}, delete() {} },
          JOBS_QUEUE: { send() {} },
          NEARBY_MARKET_DISCOVERY_ENABLED: 'false',
          NUXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY: '',
          NUXT_PUBLIC_GOOGLE_MAPS_MAP_ID: '',
          GOOGLE_PLACES_SERVER_API_KEY: '',
          ...overrides
        }
      }
    }
  }
}

describe('nearby market readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    mockCheckWorkflowReadiness.mockResolvedValue({
      ok: true,
      // `ready` keys off browserRenderingApiAuthenticated, not ...Configured —
      // renamed on main in #361 after this branch was cut. Mirrors the mock in
      // siteIntelligenceReadiness.test.ts.
      worker: { capabilities: { browserRenderingApiConfigured: true, browserRenderingApiAuthenticated: true } }
    })
  })

  it('reports an independent disabled nearby-market section without changing crawler readiness', async () => {
    const response = await readiness(event())

    expect(response).toMatchObject({
      ready: true,
      nearbyMarket: {
        enabled: false,
        browserKeyConfigured: false,
        mapIdConfigured: false,
        serverKeyConfigured: false,
        placesReady: false
      }
    })
  })

  it.each([
    ['browser key', { NUXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY: '' }, 'browserKeyConfigured'],
    ['map ID', { NUXT_PUBLIC_GOOGLE_MAPS_MAP_ID: '' }, 'mapIdConfigured'],
    ['server key', { GOOGLE_PLACES_SERVER_API_KEY: '' }, 'serverKeyConfigured']
  ])('keeps Places unready when the %s is missing', async (_label, missing, missingCheck) => {
    const response = await readiness(event({
      NEARBY_MARKET_DISCOVERY_ENABLED: 'true',
      NUXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY: 'browser-secret',
      NUXT_PUBLIC_GOOGLE_MAPS_MAP_ID: 'map-secret',
      GOOGLE_PLACES_SERVER_API_KEY: 'server-secret',
      ...missing
    }))

    expect(response.nearbyMarket).toMatchObject({
      enabled: true,
      [missingCheck]: false,
      placesReady: false
    })
  })

  it('reports configured state using booleans and never emits key material', async () => {
    const response = await readiness(event({
      NEARBY_MARKET_DISCOVERY_ENABLED: 'true',
      NUXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY: 'browser-secret',
      NUXT_PUBLIC_GOOGLE_MAPS_MAP_ID: 'map-secret',
      GOOGLE_PLACES_SERVER_API_KEY: 'server-secret'
    }))

    expect(response.nearbyMarket).toEqual({
      enabled: true,
      browserKeyConfigured: true,
      mapIdConfigured: true,
      serverKeyConfigured: true,
      placesReady: true
    })
    expect(JSON.stringify(response)).not.toMatch(/browser-secret|map-secret|server-secret/)
  })
})
