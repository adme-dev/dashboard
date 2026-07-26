import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockTransaction = vi.fn()
const mockTxQuery = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

import { recomputeClientPersonaMemberships, recomputePersonaMemberships } from '../../../../server/utils/persona/tierRecompute'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

function tierDefinitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    persona_key: 'hot',
    version: 1,
    label: 'Hot',
    description: 'Near-conversion intent.',
    positive_signals: ['form_start', 'add_to_wishlist'],
    negative_signals: [],
    min_confidence: 0.01,
    allowed_channels: ['google', 'meta'],
    targeting_allowed: true,
    reporting_allowed: true,
    tier_rank: 1,
    ...overrides
  }
}

function exclusionDefinitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    persona_key: 'negative_signal_exclusion',
    version: 1,
    label: 'Negative Signal Exclusion',
    description: 'Visitors who showed competitor-shopping or early-exit intent.',
    positive_signals: ['competitive_referrer', 'exit_intent'],
    negative_signals: [],
    min_confidence: 0.01,
    allowed_channels: ['google', 'meta'],
    targeting_allowed: true,
    reporting_allowed: true,
    tier_rank: null,
    ...overrides
  }
}

const TIER_DEFINITIONS = [
  tierDefinitionRow(),
  tierDefinitionRow({ persona_key: 'warm', label: 'Warm', positive_signals: ['vehicle_comparison', 'return_to_vehicle'], tier_rank: 2 }),
  tierDefinitionRow({ persona_key: 'cold', label: 'Cold', positive_signals: ['vehicle_view', 'vehicle_list_view'], tier_rank: 3 })
]

const EXCLUSION_DEFINITIONS = [exclusionDefinitionRow()]

function mockDefinitionsQuery(options: { tiers?: unknown[], exclusions?: unknown[] } = {}) {
  const tiers = options.tiers ?? TIER_DEFINITIONS
  const exclusions = options.exclusions ?? EXCLUSION_DEFINITIONS
  return async (sql: string) => {
    if (/is_exclusion = TRUE/.test(sql)) return exclusions
    if (/tier_rank IS NOT NULL/.test(sql)) return tiers
    return []
  }
}

beforeEach(() => {
  mockQueryRows.mockReset()
  mockTransaction.mockReset()
  mockTxQuery.mockReset()
  mockTransaction.mockImplementation(async (callback: (db: { query: typeof mockTxQuery }) => unknown) =>
    callback({ query: mockTxQuery }))
})

describe('recomputeClientPersonaMemberships', () => {
  it('assigns each profile its highest-qualifying tier and exclusion status, replacing prior memberships in one transaction', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return mockDefinitionsQuery()(sql)
      if (/FROM crm_customer_signals/.test(sql)) {
        return [
          { profile_id: 'profile-hot', signal_keys: ['vehicle_view', 'form_start'] },
          { profile_id: 'profile-warm', signal_keys: ['vehicle_comparison'] },
          { profile_id: 'profile-excluded', signal_keys: ['competitive_referrer'] },
          { profile_id: 'profile-none', signal_keys: ['search'] }
        ]
      }
      return []
    })

    const result = await recomputeClientPersonaMemberships(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 2, excluded: 1 })
    expect(mockTxQuery).toHaveBeenCalledTimes(4)
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_persona_tier_memberships'),
      [CLIENT_ID, JSON.stringify([
        { profile_id: 'profile-hot', tier_key: 'hot', matched_signals: ['form_start'] },
        { profile_id: 'profile-warm', tier_key: 'warm', matched_signals: ['vehicle_comparison'] }
      ])]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_exclusion_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_persona_exclusion_memberships'),
      [CLIENT_ID, JSON.stringify([
        { profile_id: 'profile-excluded', matched_signals: ['competitive_referrer'] }
      ])]
    )

    const signalCall = mockQueryRows.mock.calls.find(call => /FROM crm_customer_signals/.test(call[0] as string))
    expect(signalCall?.[0]).toContain("INTERVAL '30 days'")
    expect(signalCall?.[0]).toContain('profile_id IS NOT NULL')
  })

  it('does not attempt a bulk insert for either table when no profile qualifies', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return mockDefinitionsQuery()(sql)
      if (/FROM crm_customer_signals/.test(sql)) {
        return [{ profile_id: 'profile-none', signal_keys: ['search'] }]
      }
      return []
    })

    const result = await recomputeClientPersonaMemberships(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 0, excluded: 0 })
    expect(mockTxQuery).toHaveBeenCalledTimes(2)
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_exclusion_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
  })

  it('still computes exclusion membership for a client with no active tier definitions', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return mockDefinitionsQuery({ tiers: [] })(sql)
      if (/FROM crm_customer_signals/.test(sql)) {
        return [{ profile_id: 'profile-excluded', signal_keys: ['exit_intent'] }]
      }
      return []
    })

    const result = await recomputeClientPersonaMemberships(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 0, excluded: 1 })
  })

  it('skips a client with no active tier or exclusion definitions without opening a transaction', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return []
      return []
    })

    const result = await recomputeClientPersonaMemberships(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 0, excluded: 0 })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

describe('recomputePersonaMemberships', () => {
  it('recomputes memberships independently for every persona-identity-enabled client', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM client_feature_entitlements/.test(sql)) {
        return [{ client_id: 'client-a' }, { client_id: 'client-b' }]
      }
      if (/FROM crm_persona_definitions/.test(sql)) return mockDefinitionsQuery({ exclusions: [] })(sql)
      if (/FROM crm_customer_signals/.test(sql)) return []
      return []
    })

    const results = await recomputePersonaMemberships()

    expect(results).toEqual([
      { clientId: 'client-a', tiered: 0, excluded: 0 },
      { clientId: 'client-b', tiered: 0, excluded: 0 }
    ])
  })

  it('records a per-client error and continues to the next client when one client fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockQueryRows.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/FROM client_feature_entitlements/.test(sql)) {
        return [{ client_id: 'client-a' }, { client_id: 'client-b' }]
      }
      if (/FROM crm_persona_definitions/.test(sql)) {
        if (params?.[0] === 'client-a') throw new Error('db unavailable')
        return mockDefinitionsQuery({ exclusions: [] })(sql)
      }
      if (/FROM crm_customer_signals/.test(sql)) return []
      return []
    })

    const results = await recomputePersonaMemberships()

    expect(results).toEqual([
      { clientId: 'client-a', tiered: 0, excluded: 0, error: 'db unavailable' },
      { clientId: 'client-b', tiered: 0, excluded: 0 }
    ])
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('client-a'))
    consoleErrorSpy.mockRestore()
  })
})
