import { describe, expect, it, vi } from 'vitest'
import { createPostgresMeasurementReadRepository } from '../../../../server/utils/measurement/readRepository'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'

describe('Postgres measurement read repository', () => {
  it('paginates tenant-scoped audit metadata without selecting state JSON', async () => {
    const queryOne = vi.fn(async (_sql: string, _params?: unknown[]) => ({ count: '1' }))
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => [{
      id: '33333333-3333-4333-8333-333333333333',
      profile_id: PROFILE_ID,
      entity_type: 'destination',
      entity_id: '44444444-4444-4444-8444-444444444444',
      action: 'created',
      config_version: '2',
      changed_fields: ['destination'],
      actor_type: 'team_member',
      actor_id: '55555555-5555-4555-8555-555555555555',
      reason: 'Configure Meta CRM delivery',
      request_id: null,
      created_at: new Date('2026-07-17T01:00:00.000Z')
    }])
    const repository = createPostgresMeasurementReadRepository({
      queryOne: queryOne as never,
      query: query as never
    })

    const result = await repository.listAudit({
      clientId: CLIENT_ID,
      page: 1,
      pageSize: 25,
      entityType: 'destination'
    })

    expect(result.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 1, totalPages: 1 })
    expect(result.items[0]).toMatchObject({ entityType: 'destination', configVersion: 2 })
    const auditSql = query.mock.calls[0]?.[0] as string
    expect(auditSql).toMatch(/WHERE client_id = \$1/)
    expect(auditSql).not.toMatch(/before_state|after_state|credential_ref/i)
    expect(query.mock.calls[0]?.[1]).toEqual([CLIENT_ID, 'destination', 25, 0])
  })

  it('maps one tenant-scoped readiness evidence row without provider payloads', async () => {
    const queryOne = vi.fn(async () => ({
      client_id: CLIENT_ID,
      profile_id: PROFILE_ID,
      config_version: '4',
      desired_enabled: false,
      profile_enabled: false,
      profile_environment: 'test',
      cache_status: 'fresh',
      outcome_authority: 'client_webhook',
      live_approved: false,
      privacy_approved: true,
      destinations: '2',
      ready_destinations: '1',
      degraded_destinations: '0',
      blocked_destinations: '1',
      capabilities: '4',
      ready_capabilities: '1',
      degraded_capabilities: '0',
      blocked_capabilities: '1',
      active_mappings: '1',
      outcome_endpoints: '1',
      ready_outcome_endpoints: '0',
      last_validated_at: new Date('2026-07-17T02:00:00.000Z'),
      last_success_at: null
    }))
    const repository = createPostgresMeasurementReadRepository({
      queryOne: queryOne as never,
      query: vi.fn() as never
    })

    const result = await repository.getReadinessEvidence(CLIENT_ID)

    expect(result).toMatchObject({
      clientId: CLIENT_ID,
      profileId: PROFILE_ID,
      configVersion: 4,
      liveApproved: false,
      privacyApproved: true,
      profile: { desiredEnabled: false, outcomeAuthority: 'client_webhook' },
      counts: {
        destinations: 2,
        readyDestinations: 1,
        blockedDestinations: 1,
        capabilities: 4,
        blockedCapabilities: 1,
        activeMappings: 1,
        outcomeEndpoints: 1,
        readyOutcomeEndpoints: 0
      },
      lastValidatedAt: '2026-07-17T02:00:00.000Z'
    })
    const readinessSql = queryOne.mock.calls[0]?.[0] as string
    expect(readinessSql).toMatch(/WHERE p\.client_id = \$1/)
    expect(readinessSql).toContain('p.desired_enabled')
    expect(readinessSql).toMatch(/FROM measurement_activation_approvals/)
    expect(readinessSql).toMatch(/a\.config_version = p\.config_version/)
    expect(queryOne).toHaveBeenCalledWith(expect.any(String), [CLIENT_ID])
    expect(JSON.stringify(result)).not.toMatch(/providerRequest|redactedError|payload/i)
  })
})
