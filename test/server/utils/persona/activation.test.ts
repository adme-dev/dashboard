import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: vi.fn()
}))

const mockIsPersonaIdentityEnabled = vi.fn()
vi.mock('~~/server/utils/persona/feature', () => ({
  isPersonaIdentityEnabled: (...args: unknown[]) => mockIsPersonaIdentityEnabled(...args)
}))

const mockGetCachedPersonaMetrics = vi.fn()
vi.mock('~~/server/utils/persona/snapshots', () => ({
  getCachedPersonaMetrics: (...args: unknown[]) => mockGetCachedPersonaMetrics(...args)
}))

const mockCountTierMembers = vi.fn()
vi.mock('~~/server/utils/persona/audienceSync', () => ({
  countTierMembers: (...args: unknown[]) => mockCountTierMembers(...args)
}))

import { createPersonaActivationRequest } from '../../../../server/utils/persona/activation'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  mockQueryOne.mockReset()
  mockIsPersonaIdentityEnabled.mockReset()
  mockGetCachedPersonaMetrics.mockReset()
  mockCountTierMembers.mockReset()
})

describe('createPersonaActivationRequest', () => {
  it('uses the tier-member count for a tier-filtered request without calling getCachedPersonaMetrics', async () => {
    mockIsPersonaIdentityEnabled.mockResolvedValue(true)
    mockCountTierMembers.mockResolvedValue(1500)
    mockQueryOne.mockResolvedValueOnce({ id: 'request-1' }).mockResolvedValueOnce({ id: 'audit-1' })

    const result = await createPersonaActivationRequest({
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Hot tier',
      filters: { tierKey: 'hot' },
      expiresAt: '2026-08-01T00:00:00.000Z',
      actorId: ACTOR_ID
    })

    expect(result).toMatchObject({ id: 'request-1', estimatedSize: 1500, status: 'pending_privacy' })
    expect(mockCountTierMembers).toHaveBeenCalledWith(CLIENT_ID, 'hot', { tierKey: 'hot' })
    expect(mockGetCachedPersonaMetrics).not.toHaveBeenCalled()
  })

  it('rejects a tier-filtered request when persona identity is disabled, without querying tier membership', async () => {
    mockIsPersonaIdentityEnabled.mockResolvedValue(false)

    await expect(createPersonaActivationRequest({
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Hot tier',
      filters: { tierKey: 'hot' },
      expiresAt: '2026-08-01T00:00:00.000Z',
      actorId: ACTOR_ID
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(mockCountTierMembers).not.toHaveBeenCalled()
  })

  it('keeps the existing getCachedPersonaMetrics path unchanged for a non-tier-filtered request', async () => {
    mockGetCachedPersonaMetrics.mockResolvedValue({
      enabled: true,
      metrics: { totalPersonas: 5000 }
    })
    mockQueryOne.mockResolvedValueOnce({ id: 'request-2' }).mockResolvedValueOnce({ id: 'audit-2' })

    const result = await createPersonaActivationRequest({
      clientId: CLIENT_ID,
      provider: 'google_ads',
      name: 'All personas',
      filters: { platform: 'google' },
      expiresAt: '2026-08-01T00:00:00.000Z',
      actorId: ACTOR_ID
    })

    expect(result).toMatchObject({ id: 'request-2', estimatedSize: 5000 })
    expect(mockIsPersonaIdentityEnabled).not.toHaveBeenCalled()
    expect(mockCountTierMembers).not.toHaveBeenCalled()
  })
})
