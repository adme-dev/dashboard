import { beforeEach, describe, expect, it, vi } from 'vitest'

const revoke = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({ revokePageStudioLoginSession: revoke }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
const clearCookie = vi.fn()
vi.stubGlobal('deleteCookie', clearCookie)
const { default: portal } = await import('../../../../server/api/portal/auth/logout.post')
const { default: agencyPortal } = await import('../../../../server/api/agency/client-portal/auth/logout.post')
const { default: agency } = await import('../../../../server/api/auth/logout.post')

describe.each([
  ['portal', portal, 'client', 1], ['agency portal', agencyPortal, 'client', 1], ['agency', agency, 'agency', 3]
] as const)('%s logout', (_name, handler, role, cookieCount) => {
  beforeEach(() => {
    vi.clearAllMocks()
    revoke.mockResolvedValue(undefined)
  })
  it('revokes originating login before clearing cookies', async () => {
    const event = {} as never
    revoke.mockImplementation(async () => {
      expect(clearCookie).not.toHaveBeenCalled()
    })
    await expect(handler(event)).resolves.toMatchObject({ success: true })
    expect(revoke).toHaveBeenCalledWith(event, role)
    expect(clearCookie).toHaveBeenCalledTimes(cookieCount)
    for (const args of clearCookie.mock.calls) expect(args[2]).toEqual({ path: '/' })
  })
  it('preserves credentials for retry when revocation fails', async () => {
    const unavailable = Object.assign(new Error('retry logout'), { statusCode: 503 })
    revoke.mockRejectedValue(unavailable)
    await expect(handler({} as never)).rejects.toBe(unavailable)
    expect(clearCookie).not.toHaveBeenCalled()
  })
})
