import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockTransaction = vi.fn()
const mockTxQuery = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

import { recomputeClientTiers, recomputePersonaTiers } from '../../../../server/utils/persona/tierRecompute'

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

const TIER_DEFINITIONS = [
  tierDefinitionRow(),
  tierDefinitionRow({ persona_key: 'warm', label: 'Warm', positive_signals: ['vehicle_comparison', 'return_to_vehicle'], tier_rank: 2 }),
  tierDefinitionRow({ persona_key: 'cold', label: 'Cold', positive_signals: ['vehicle_view', 'vehicle_list_view'], tier_rank: 3 })
]

beforeEach(() => {
  mockQueryRows.mockReset()
  mockTransaction.mockReset()
  mockTxQuery.mockReset()
  mockTransaction.mockImplementation(async (callback: (db: { query: typeof mockTxQuery }) => unknown) =>
    callback({ query: mockTxQuery }))
})

describe('recomputeClientTiers', () => {
  it('assigns each profile its highest-qualifying tier and replaces prior memberships in one transaction', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return TIER_DEFINITIONS
      if (/FROM crm_customer_signals/.test(sql)) {
        return [
          { profile_id: 'profile-hot', signal_keys: ['vehicle_view', 'form_start'] },
          { profile_id: 'profile-warm', signal_keys: ['vehicle_comparison'] },
          { profile_id: 'profile-none', signal_keys: ['search'] }
        ]
      }
      return []
    })

    const result = await recomputeClientTiers(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 2 })
    expect(mockTxQuery).toHaveBeenCalledTimes(2)
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      expect.stringContaining('jsonb_to_recordset'),
      [CLIENT_ID, JSON.stringify([
        { profile_id: 'profile-hot', tier_key: 'hot', matched_signals: ['form_start'] },
        { profile_id: 'profile-warm', tier_key: 'warm', matched_signals: ['vehicle_comparison'] }
      ])]
    )

    const signalCall = mockQueryRows.mock.calls.find(call => /FROM crm_customer_signals/.test(call[0] as string))
    expect(signalCall?.[0]).toContain("INTERVAL '30 days'")
    expect(signalCall?.[0]).toContain('profile_id IS NOT NULL')
  })

  it('does not attempt a bulk insert when no profile qualifies for a tier', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return TIER_DEFINITIONS
      if (/FROM crm_customer_signals/.test(sql)) {
        return [{ profile_id: 'profile-none', signal_keys: ['search'] }]
      }
      return []
    })

    const result = await recomputeClientTiers(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 0 })
    expect(mockTxQuery).toHaveBeenCalledTimes(1)
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
  })

  it('skips a client with no active tier definitions without opening a transaction', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return []
      return []
    })

    const result = await recomputeClientTiers(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 0 })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

describe('recomputePersonaTiers', () => {
  it('recomputes tiers independently for every persona-identity-enabled client', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM client_feature_entitlements/.test(sql)) {
        return [{ client_id: 'client-a' }, { client_id: 'client-b' }]
      }
      if (/FROM crm_persona_definitions/.test(sql)) return TIER_DEFINITIONS
      if (/FROM crm_customer_signals/.test(sql)) return []
      return []
    })

    const results = await recomputePersonaTiers()

    expect(results).toEqual([
      { clientId: 'client-a', tiered: 0 },
      { clientId: 'client-b', tiered: 0 }
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
        return TIER_DEFINITIONS
      }
      if (/FROM crm_customer_signals/.test(sql)) return []
      return []
    })

    const results = await recomputePersonaTiers()

    expect(results).toEqual([
      { clientId: 'client-a', tiered: 0, error: 'db unavailable' },
      { clientId: 'client-b', tiered: 0 }
    ])
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('client-a'))
    consoleErrorSpy.mockRestore()
  })
})
