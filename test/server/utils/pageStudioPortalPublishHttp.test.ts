import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { preparePortalPageStudioPublishPrincipal } from '~~/server/utils/pageStudio/publishHttp'

const mocks = vi.hoisted(() => ({ query: vi.fn(), resolve: vi.fn(), bind: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: (work: (db: unknown) => unknown) => work({ query: mocks.query }) }))
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({
  resolvePageStudioLoginSession: (...args: unknown[]) => mocks.resolve(...args),
  bindPageStudioLoginSession: (...args: unknown[]) => mocks.bind(...args)
}))

describe('Portal publisher retains its original login binding', () => {
  const userId = '10000000-0000-4000-8000-000000000001'
  const access = { tenantId: 'tenant-one', user: { id: userId } }
  const event = {} as H3Event
  const retained = { issued_at: new Date('2026-10-14T00:00:00Z'), expires_at: new Date('2026-10-16T00:00:00Z') }
  const current = { role: 'client', userId, tokenHash: 'a'.repeat(64), issuedAt: new Date('2026-10-15T00:00:00Z'), expiresAt: retained.expires_at }
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolve.mockResolvedValue(current)
    mocks.bind.mockResolvedValue(undefined)
    mocks.query.mockResolvedValue({ rows: [retained] })
  })

  it('uses the persisted issuance time when the same portal login has already opened Studio', async () => {
    const principal = await preparePortalPageStudioPublishPrincipal(event, access)
    expect(principal).toEqual({ actorId: userId, tenantId: access.tenantId,
      login: { ...current, issuedAt: retained.issued_at, expiresAt: retained.expires_at } })
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), event, 'client', userId)
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), ['client', current.tokenHash, userId])
  })

  it('stops before readback if logout has tombstoned the login', async () => {
    mocks.bind.mockRejectedValue(new Error('Login revoked'))
    await expect(preparePortalPageStudioPublishPrincipal(event, access)).rejects.toThrow('Login revoked')
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('denies a binding that cannot be read back as current', async () => {
    mocks.query.mockResolvedValue({ rows: [] })
    await expect(preparePortalPageStudioPublishPrincipal(event, access)).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
  })
})
