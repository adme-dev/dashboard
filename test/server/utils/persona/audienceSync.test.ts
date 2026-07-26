import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  execute: vi.fn(),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

import { countTierMembers, loadEligibleMembers } from '../../../../server/utils/persona/audienceSync'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

function context(overrides: Record<string, unknown> = {}) {
  return {
    id: 'export-1',
    client_id: CLIENT_ID,
    request_id: 'request-1',
    provider: 'meta' as const,
    operation: 'sync' as const,
    status: 'pending',
    provider_request_ids: [],
    request_name: 'Test export',
    request_status: 'approved',
    filters: {},
    minimum_size: 1000,
    connection_id: 'connection-1',
    provider_audience_id: null,
    enabled: true,
    emergency_stop: false,
    terms_accepted_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

beforeEach(() => {
  mockQueryRows.mockReset()
  mockQueryRows.mockResolvedValue([])
  mockQueryOne.mockReset()
})

describe('loadEligibleMembers', () => {
  it('builds the candidate query without a tier join when no tier filter is supplied', async () => {
    await loadEligibleMembers(context())

    const [sql, params] = mockQueryRows.mock.calls[0]!
    expect(sql).not.toContain('crm_persona_tier_memberships')
    expect(params).toEqual([CLIENT_ID, 'meta'])
  })

  it('renders the candidate query byte-for-byte identical to the pre-tier-filter query when no tier filter is supplied', async () => {
    await loadEligibleMembers(context())

    const [sql] = mockQueryRows.mock.calls[0]!
    expect(sql).toContain('FROM crm_customer_signals signal\n        WHERE')
  })

  it('joins the tier-membership table and filters by tier_key when a tier filter is supplied', async () => {
    await loadEligibleMembers(context({ filters: { tierKey: 'hot' } }))

    const [sql, params] = mockQueryRows.mock.calls[0]!
    expect(sql).toContain('JOIN crm_persona_tier_memberships tier')
    expect(sql).toContain('tier.tier_key = $2')
    expect(params).toEqual([CLIENT_ID, 'hot', 'meta'])
  })

  it('still applies attribution filters alongside a tier filter', async () => {
    await loadEligibleMembers(context({ filters: { tierKey: 'warm', platform: 'google' } }))

    const [sql, params] = mockQueryRows.mock.calls[0]!
    expect(sql).toContain('crm_persona_tier_memberships')
    expect(params).toEqual([CLIENT_ID, 'google', 'warm', 'meta'])
  })
})

describe('countTierMembers', () => {
  it('counts distinct profiles matching the tier and any attribution filters', async () => {
    mockQueryOne.mockResolvedValue({ count: '42' })

    const result = await countTierMembers(CLIENT_ID, 'hot', { platform: 'meta' })

    expect(result).toBe(42)
    const [sql, params] = mockQueryOne.mock.calls[0]!
    expect(sql).toContain('crm_persona_tier_memberships')
    expect(sql).toContain('COUNT(DISTINCT signal.profile_id)')
    expect(params).toEqual([CLIENT_ID, 'meta', 'hot'])
  })

  it('returns 0 when no row is found', async () => {
    mockQueryOne.mockResolvedValue(undefined)

    const result = await countTierMembers(CLIENT_ID, 'cold', {})

    expect(result).toBe(0)
  })
})
