import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), queryRows: vi.fn() }))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mocks.requireAuth(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mocks.queryRows(...args)
}))
;(globalThis as any).eventHandler = (handler: unknown) => handler

describe('GET /api/agency/social/google/profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it('returns profile health metadata without credential material', async () => {
    mocks.queryRows.mockResolvedValue([{
      id: 'profile-1',
      label: 'Google Ads manager 111-111-1111',
      status: 'active',
      token_expires_at: '2026-07-19T03:00:00.000Z',
      scopes: ['scope-a'],
      metadata: { managerCustomerIds: ['1111111111'] },
      connected_by: 'user-1',
      connected_by_name: 'Paul',
      last_authorized_at: '2026-07-19T02:00:00.000Z',
      created_at: '2026-07-19T02:00:00.000Z',
      updated_at: '2026-07-19T02:00:00.000Z',
      account_count: '12',
      has_refresh_token: true
    }])

    const handler = (await import('~~/server/api/agency/social/google/profiles.get')).default
    const result = await handler({} as never)

    expect(result).toEqual([expect.objectContaining({
      id: 'profile-1',
      accountCount: 12,
      hasRefreshToken: true,
      connectedByName: 'Paul'
    })])
    expect(JSON.stringify(result)).not.toMatch(/encrypted|\biv\b|"accessToken"|"refreshToken"/)
  })
})
