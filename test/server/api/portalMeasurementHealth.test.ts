import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
}
testGlobal.defineEventHandler = handler => handler

const mockRequireClientAuth = vi.fn()
const mockProfileGet = vi.fn()
const mockReadinessGet = vi.fn()
const mockDestinationList = vi.fn()
const mockQueryOne = vi.fn()
const mockProfileRuntime = vi.fn(() => ({ get: mockProfileGet }))
const mockReadRuntime = vi.fn(() => ({ getReadiness: mockReadinessGet }))
const mockDestinationRuntime = vi.fn(() => ({ list: mockDestinationList }))

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/measurement/runtime', () => ({
  createMeasurementProfileRuntime: (...args: unknown[]) => mockProfileRuntime(...args),
  createMeasurementReadRuntime: (...args: unknown[]) => mockReadRuntime(...args),
  createMeasurementDestinationRuntime: (...args: unknown[]) => mockDestinationRuntime(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

describe('portal measurement health endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: 'portal-user-1',
      clientId: CLIENT_ID,
      clientName: 'Client Co'
    })
    mockProfileGet.mockResolvedValue({
      id: 'profile-secret-id',
      clientId: CLIENT_ID,
      enabled: false,
      environment: 'test',
      collectionTier: 'backend_only',
      consentMode: 'consent_gated',
      outcomeAuthority: 'zero_native',
      nativeLifecycleMode: 'crm_preferred',
      portalOutcomeMode: 'disabled',
      cacheErrorClass: 'internal-cache-failure',
      configVersion: 4
    })
    mockReadinessGet.mockResolvedValue({
      clientId: CLIENT_ID,
      profileId: 'profile-secret-id',
      configVersion: 4,
      status: 'onboarding',
      liveEligible: false,
      counts: {
        destinations: 2,
        readyDestinations: 1,
        capabilities: 3,
        readyCapabilities: 1,
        activeMappings: 1
      },
      blockers: [
        { code: 'destination_not_ready', message: 'One or more conversion destinations lack current ready evidence' },
        { code: 'live_approval_missing', message: 'Live approval has not been recorded' }
      ],
      lastValidatedAt: '2026-07-17T02:00:00.000Z',
      lastSuccessAt: '2026-07-17T01:30:00.000Z'
    })
    mockDestinationList.mockResolvedValue({
      items: [
        {
          id: 'destination-secret-id',
          platform: 'meta',
          externalDestinationId: '573284833843027',
          credentialConfigured: true,
          enabled: false,
          environment: 'test',
          healthStatus: 'ready',
          providerRequestId: 'provider-request-secret',
          redactedError: 'internal diagnostic text',
          lastSuccessAt: '2026-07-17T01:30:00.000Z',
          capabilities: [
            { mode: 'meta_pixel', status: 'detected', managementOrigin: 'gtm', evidenceAt: '2026-07-17T02:00:00.000Z' },
            { mode: 'meta_crm_capi', status: 'ready', managementOrigin: 'zero', evidenceAt: '2026-07-17T02:00:00.000Z' }
          ],
          mappings: [{ canonicalEventName: 'lead_qualified', providerEventName: 'QualifiedLead', isActive: true }]
        },
        {
          id: 'google-secret-id',
          platform: 'google_data_manager',
          externalDestinationId: 'customers/123/conversionActions/456',
          credentialConfigured: true,
          enabled: false,
          environment: 'test',
          healthStatus: 'configured',
          providerRequestId: null,
          redactedError: null,
          lastSuccessAt: null,
          capabilities: [
            { mode: 'google_data_manager', status: 'configured', managementOrigin: 'external', evidenceAt: null }
          ],
          mappings: []
        },
        {
          id: 'tiktok-secret-id',
          platform: 'tiktok',
          externalDestinationId: 'tiktok-pixel-secret-id',
          credentialConfigured: true,
          enabled: false,
          environment: 'test',
          healthStatus: 'ready',
          providerRequestId: 'tiktok-provider-request-secret',
          redactedError: null,
          lastSuccessAt: '2026-09-04T01:30:00.000Z',
          capabilities: [
            { mode: 'tiktok_pixel', status: 'detected', managementOrigin: 'gtm', evidenceAt: '2026-09-04T01:00:00.000Z' },
            { mode: 'tiktok_events_api', status: 'ready', managementOrigin: 'zero', evidenceAt: '2026-09-04T01:30:00.000Z' }
          ],
          mappings: [{ canonicalEventName: 'web_conversion', providerEventName: 'SubmitForm', isActive: true }]
        }
      ]
    })
    mockQueryOne.mockResolvedValue({
      accepted_count: '5',
      delivered_count: '4',
      rejected_count: '1',
      recent_rejected_count: '1',
      pending_count: '0',
      last_accepted_at: '2026-07-17T01:15:00.000Z',
      last_delivered_at: '2026-07-17T01:20:00.000Z',
      last_rejected_at: '2026-07-17T01:25:00.000Z',
      outcome_accepted_count: '8',
      outcome_rejected_count: '2',
      last_outcome_sync_at: '2026-07-17T01:10:00.000Z',
      last_endpoint_received_at: null,
      visit_count: '120',
      confirmed_lead_count: '9',
      last_collection_at: '2026-09-04T01:25:00.000Z',
      last_delivery_at: '2026-09-04T01:30:00.000Z'
    })
  })

  it('uses the authenticated client scope and returns only the redacted client contract', async () => {
    const handler = (await import('~~/server/api/portal/measurement.get')).default
    const result = await handler({ query: { clientId: 'attacker-client' }, context: {} } as never)

    expect(mockProfileGet).toHaveBeenCalledWith(CLIENT_ID)
    expect(mockReadinessGet).toHaveBeenCalledWith(CLIENT_ID)
    expect(mockDestinationList).toHaveBeenCalledWith({ clientId: CLIENT_ID, page: 1, pageSize: 100 })
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual([CLIENT_ID])
    expect(result).toMatchObject({
      status: 'degraded',
      deliveryState: 'dormant',
      authority: {
        source: 'Zero CRM',
        lastSyncAt: '2026-07-17T01:10:00.000Z',
        acceptedOutcomeCount: 8,
        rejectedOutcomeCount: 2
      },
      signals: {
        browser: { status: 'detected', owners: ['gtm'] },
        server: { status: 'configured', owners: ['external', 'zero'] },
        crm: { status: 'ready', owners: ['zero'] }
      },
      eventIdentity: [
        {
          canonicalEventName: 'lead_qualified',
          mode: 'server_only',
          label: 'Server-only lifecycle event'
        },
        {
          canonicalEventName: 'web_conversion',
          mode: 'browser_server_dedup',
          label: 'Shared browser/server event ID'
        }
      ],
      delivery: {
        acceptedCount: 5,
        deliveredCount: 4,
        rejectedCount: 1
      },
      funnel: {
        visits: 120,
        confirmedLeads: 9
      },
      freshness: {
        lastCollectionAt: '2026-09-04T01:25:00.000Z',
        lastDeliveryAt: '2026-09-04T01:30:00.000Z'
      }
    })

    const output = JSON.stringify(result)
    expect(Object.keys(result)).toEqual([
      'status',
      'statusMessage',
      'deliveryState',
      'authority',
      'signals',
      'eventIdentity',
      'destinations',
      'delivery',
      'funnel',
      'freshness',
      'lastValidatedAt',
      'nextSteps'
    ])
    expect(Object.keys(result.authority)).toEqual([
      'source',
      'lastSyncAt',
      'acceptedOutcomeCount',
      'rejectedOutcomeCount'
    ])
    expect(Object.keys(result.destinations[0])).toEqual([
      'platform',
      'label',
      'status',
      'deliveryState',
      'lastSuccessAt'
    ])
    expect(output).not.toContain('attacker-client')
    expect(output).not.toContain('profile-secret-id')
    expect(output).not.toContain('destination-secret-id')
    expect(output).not.toContain('573284833843027')
    expect(output).not.toContain('customers/123')
    expect(output).not.toContain('tiktok-pixel-secret-id')
    expect(output).not.toContain('credentialConfigured')
    expect(output).not.toContain('provider-request-secret')
    expect(output).not.toContain('tiktok-provider-request-secret')
    expect(output).not.toContain('internal diagnostic text')
    expect(output).not.toContain('internal-cache-failure')
    expect(output).not.toMatch(/accessToken|credentialRef|ttclid|ttp|fbc|fbp|gclid/i)
  })

  it('does not construct measurement runtimes when portal authentication fails', async () => {
    mockRequireClientAuth.mockRejectedValue(Object.assign(new Error('Not authenticated'), { statusCode: 401 }))
    const handler = (await import('~~/server/api/portal/measurement.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockProfileRuntime).not.toHaveBeenCalled()
    expect(mockReadRuntime).not.toHaveBeenCalled()
    expect(mockDestinationRuntime).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('uses current evidence instead of permanently degrading on historical failures', async () => {
    const { buildPortalMeasurementHealth } = await import('~~/server/utils/measurement/portalHealth')
    const base = {
      profile: {
        enabled: true,
        environment: 'live' as const,
        collectionTier: 'backend_only' as const,
        consentMode: 'consent_gated' as const,
        outcomeAuthority: 'zero_native' as const
      },
      readiness: {
        status: 'ready' as const,
        liveEligible: true,
        blockers: [],
        lastValidatedAt: '2026-07-17T02:00:00.000Z'
      },
      destinations: [{
        platform: 'meta' as const,
        enabled: true,
        environment: 'live' as const,
        healthStatus: 'ready' as const,
        lastSuccessAt: '2026-07-17T01:30:00.000Z',
        capabilities: [
          { mode: 'meta_pixel', status: 'detected' as const, managementOrigin: 'gtm' as const, evidenceAt: '2026-07-17T01:00:00.000Z' },
          { mode: 'google_tag_enhanced_conversions', status: 'configured' as const, managementOrigin: 'external' as const, evidenceAt: '2026-07-17T01:30:00.000Z' }
        ],
        mappings: [{ isActive: true }]
      }]
    }

    const healthy = buildPortalMeasurementHealth({
      ...base,
      aggregate: { rejected_count: '12', recent_rejected_count: '0' }
    })
    expect(healthy.status).toBe('healthy')
    expect(healthy.delivery.rejectedCount).toBe(12)
    expect(healthy.signals.browser.status).toBe('detected')

    expect(buildPortalMeasurementHealth({
      ...base,
      aggregate: { rejected_count: '12', recent_rejected_count: '1' }
    }).status).toBe('degraded')

    expect(buildPortalMeasurementHealth({
      ...base,
      readiness: { ...base.readiness, status: 'paused' as const },
      aggregate: { recent_rejected_count: '0' }
    }).status).toBe('paused')

    expect(buildPortalMeasurementHealth({
      ...base,
      readiness: { ...base.readiness, liveEligible: false },
      aggregate: { recent_rejected_count: '0' }
    }).status).not.toBe('healthy')
  })

  it('uses bounded grouped aggregates scoped to the current authority', async () => {
    const handler = (await import('~~/server/api/portal/measurement.get')).default
    await handler({ context: {} } as never)

    const sql = String(mockQueryOne.mock.calls[0]?.[0])
    expect(sql).toContain('WITH delivery AS')
    expect(sql).toContain('FROM tracking_events')
    expect(sql).toContain('FROM conversion_events')
    expect(sql).toContain('updated_at >= NOW() - INTERVAL \'24 hours\'')
    expect(sql).toContain('authority_mode = (')
    expect(sql).toContain('status IN (\'test\', \'live\', \'paused\')')
  })
})
