import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerClientUser } from '../../../server/utils/clientAuth'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-07-31T08:00:00.000Z')

async function loadFeatureModule() {
  return import('../../../server/utils/searchAuthority/feature').catch(() => null)
}

async function loadAccessModule() {
  return import('../../../server/utils/searchAuthority/access').catch(() => null)
}

describe('Search Authority feature entitlement', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false]
  ])('strictly evaluates the runtime rollout value %s', async (value, expected) => {
    const feature = await loadFeatureModule()
    expect(feature).not.toBeNull()
    vi.stubGlobal('useRuntimeConfig', () => ({ searchAuthorityEnabled: value }))

    expect(feature!.isSearchAuthorityRolloutEnabled()).toBe(expected)
  })

  it('fails closed without the global rollout flag', async () => {
    const feature = await loadFeatureModule()
    expect(feature).not.toBeNull()

    const queryEntitlement = vi.fn()
    const enabled = await feature!.isSearchAuthorityEnabled(CLIENT_ID, {
      searchAuthorityEnabled: false,
      queryEntitlement
    })

    expect(enabled).toBe(false)
    expect(queryEntitlement).not.toHaveBeenCalled()
  })

  it.each([
    ['trial', '2026-07-01T00:00:00.000Z', null, true],
    ['active', '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', true],
    ['active', '2026-08-01T00:00:00.000Z', null, false],
    ['active', '2026-07-01T00:00:00.000Z', '2026-07-31T08:00:00.000Z', false],
    ['suspended', '2026-07-01T00:00:00.000Z', null, false],
    ['cancelled', '2026-07-01T00:00:00.000Z', null, false]
  ])(
    'evaluates %s entitlements against their activation window',
    async (status, startsAt, expiresAt, expected) => {
      const feature = await loadFeatureModule()
      expect(feature).not.toBeNull()

      const enabled = await feature!.isSearchAuthorityEnabled(CLIENT_ID, {
        searchAuthorityEnabled: true,
        now: () => NOW,
        queryEntitlement: async () => ({
          status,
          starts_at: startsAt,
          expires_at: expiresAt
        })
      })

      expect(enabled).toBe(expected)
    }
  )

  it('returns only active clients with currently valid entitlements', async () => {
    const feature = await loadFeatureModule()
    expect(feature).not.toBeNull()

    const clientIds = await feature!.listSearchAuthorityClientIds({
      searchAuthorityEnabled: true,
      now: () => NOW,
      queryEntitlements: async () => [
        {
          client_id: CLIENT_ID,
          status: 'active',
          starts_at: '2026-07-01T00:00:00.000Z',
          expires_at: null
        },
        {
          client_id: '33333333-3333-4333-8333-333333333333',
          status: 'suspended',
          starts_at: '2026-07-01T00:00:00.000Z',
          expires_at: null
        },
        {
          client_id: '44444444-4444-4444-8444-444444444444',
          status: 'trial',
          starts_at: '2026-07-01T00:00:00.000Z',
          expires_at: '2026-07-30T00:00:00.000Z'
        }
      ]
    })

    expect(clientIds).toEqual([CLIENT_ID])
  })
})

describe('Search Authority access gates', () => {
  it('rejects malformed agency client ids before access or entitlement lookup', async () => {
    const access = await loadAccessModule()
    expect(access).not.toBeNull()

    const requireClientAccess = vi.fn()
    const isEnabled = vi.fn()

    await expect(
      access!.requireAgencySearchAuthorityAccess({} as never, 'not-a-uuid', {
        requireClientAccess,
        isEnabled
      })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(requireClientAccess).not.toHaveBeenCalled()
    expect(isEnabled).not.toHaveBeenCalled()
  })

  it('preserves assignment denial for scoped agency users', async () => {
    const access = await loadAccessModule()
    expect(access).not.toBeNull()

    const denial = Object.assign(new Error('No access to this client'), { statusCode: 403 })

    await expect(
      access!.requireAgencySearchAuthorityAccess({} as never, CLIENT_ID, {
        requireClientAccess: async () => {
          throw denial
        },
        isEnabled: async () => true
      })
    ).rejects.toBe(denial)
  })

  it('returns an authorized agency user only when the client entitlement is active', async () => {
    const access = await loadAccessModule()
    expect(access).not.toBeNull()

    const manager = {
      id: USER_ID,
      email: 'owner@example.com',
      name: 'Owner',
      role: 'owner',
      is_active: true
    }
    const allowed = await access!.requireAgencySearchAuthorityAccess(
      {} as never,
      CLIENT_ID,
      {
        requireClientAccess: async () => manager,
        isEnabled: async () => true
      }
    )

    expect(allowed).toBe(manager)

    await expect(
      access!.requireAgencySearchAuthorityAccess({} as never, CLIENT_ID, {
        requireClientAccess: async () => manager,
        isEnabled: async () => false
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('can authorize readiness setup before an entitlement exists', async () => {
    const access = await loadAccessModule()
    expect(access).not.toBeNull()

    const manager = {
      id: USER_ID,
      email: 'owner@example.com',
      name: 'Owner',
      role: 'owner',
      is_active: true
    }
    const isEnabled = vi.fn(async () => false)
    const isGloballyEnabled = vi.fn(() => true)
    const allowed = await access!.requireAgencySearchAuthorityAccess(
      {} as never,
      CLIENT_ID,
      {
        requireEntitlement: false,
        requireClientAccess: async () => manager,
        isGloballyEnabled,
        isEnabled
      }
    )

    expect(allowed).toBe(manager)
    expect(isGloballyEnabled).toHaveBeenCalledOnce()
    expect(isEnabled).not.toHaveBeenCalled()
  })

  it('keeps readiness setup behind the global rollout switch', async () => {
    const access = await loadAccessModule()
    expect(access).not.toBeNull()

    await expect(
      access!.requireAgencySearchAuthorityAccess({} as never, CLIENT_ID, {
        requireEntitlement: false,
        requireClientAccess: async () => ({
          id: USER_ID,
          role: 'owner'
        } as never),
        isGloballyEnabled: () => false
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('derives portal ownership from the authenticated client and requires analytics access', async () => {
    const access = await loadAccessModule()
    expect(access).not.toBeNull()

    const portalUser = {
      id: USER_ID,
      clientId: CLIENT_ID,
      permissions: { canViewAnalytics: true }
    } as unknown as ServerClientUser
    const allowed = await access!.requirePortalSearchAuthorityAccess({} as never, {
      requirePortalAuth: async () => portalUser,
      isEnabled: async clientId => clientId === CLIENT_ID
    })

    expect(allowed).toBe(portalUser)

    await expect(
      access!.requirePortalSearchAuthorityAccess({} as never, {
        requirePortalAuth: async () => ({
          ...portalUser,
          permissions: {
            ...portalUser.permissions,
            canViewAnalytics: false
          }
        }),
        isEnabled: async () => true
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('hides the portal feature when the authenticated client is not entitled', async () => {
    const access = await loadAccessModule()
    expect(access).not.toBeNull()

    await expect(
      access!.requirePortalSearchAuthorityAccess({} as never, {
        requirePortalAuth: async () => ({
          id: USER_ID,
          clientId: CLIENT_ID,
          permissions: { canViewAnalytics: true }
        } as unknown as ServerClientUser),
        isEnabled: async () => false
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
