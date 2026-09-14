import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryOneFresh: vi.fn(),
  kvGet: vi.fn(),
  kvPut: vi.fn(),
  resolveUserPermissions: vi.fn(),
  deleteCookie: vi.fn()
}))

vi.mock('../../../server/utils/db', () => ({
  queryOne: mocks.queryOne,
  queryOneFresh: mocks.queryOneFresh,
  queryRows: vi.fn(),
  execute: vi.fn()
}))
vi.mock('../../../server/utils/kv', () => ({ kvGet: mocks.kvGet, kvPut: mocks.kvPut }))
vi.mock('../../../server/utils/roleResolver', () => ({ resolveUserPermissions: mocks.resolveUserPermissions }))
vi.mock('../../../server/utils/auth', async importOriginal => ({
  ...await importOriginal<typeof import('../../../server/utils/auth')>(),
  acceptGodModeInternalExecution: vi.fn(async () => null)
}))

type Request = {
  path: string
  headers: Record<string, string>
  cookies: Record<string, string>
  context: { user?: { id: string, role: string, permissionGroups?: string[] }, auth?: unknown }
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRequestURL', (event: Request) => new URL(event.path, 'https://app.xeroflow.test'))
vi.stubGlobal('getHeader', (event: Request, name: string) => event.headers[name])
vi.stubGlobal('getCookie', (event: Request, name: string) => event.cookies[name])
vi.stubGlobal('deleteCookie', mocks.deleteCookie)

const { createJwt } = await import('../../../server/utils/auth')
const { default: middleware } = await import('../../../server/middleware/auth')
const activeUser = { id: 'synthetic-user', email: 'synthetic@example.test', name: 'Synthetic', role: 'member', is_active: true }

function request(token: string, cookie = false): Request {
  return {
    path: '/api/agency/clients',
    headers: cookie ? {} : { authorization: `Bearer ${token}` },
    cookies: cookie ? { auth_token: token } : {},
    context: {}
  }
}

describe('staff session validation across cached identity and revocation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.kvGet.mockResolvedValue({ ...activeUser, permissionGroups: ['ADMIN'] })
    mocks.queryOne.mockResolvedValue(activeUser) // Deliberately stale cached database view.
    mocks.queryOneFresh.mockResolvedValue(activeUser)
    mocks.resolveUserPermissions.mockResolvedValue({ groups: ['CLIENTS'], isReadOnly: false })
  })

  it.each([false, true])('denies a deactivated user on the next request despite warm identity caches (cookie=%s)', async (cookie) => {
    const token = await createJwt({ userId: activeUser.id })
    await middleware(request(token, cookie) as never)
    mocks.queryOneFresh.mockResolvedValue(null) // Fresh active-user SQL no longer matches.
    const denied = request(token, cookie)

    await expect(middleware(denied as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(denied.context.user).toBeUndefined()
    expect(mocks.queryOneFresh).toHaveBeenCalledTimes(2)
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.deleteCookie.mock.calls.map(call => call[1])).toEqual(['auth_token', 'auth_token_client', 'auth_status'])
  })

  it('rejects a revoked signed session using the fresh cutoff instead of a stale active row', async () => {
    const token = await createJwt({ userId: activeUser.id })
    mocks.queryOneFresh.mockResolvedValue({ ...activeUser, sessions_invalidated_at: new Date(Date.now() + 1000).toISOString() })
    await expect(middleware(request(token) as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.resolveUserPermissions).not.toHaveBeenCalled()
    expect(mocks.queryOne).not.toHaveBeenCalled()
  })

  it('rejects an invalid signature sharing a cached valid token prefix before querying identity', async () => {
    const valid = await createJwt({ userId: activeUser.id })
    const invalid = `${valid.split('.')[0]}.invalidSignature`
    expect(invalid.slice(0, 16)).toBe(valid.slice(0, 16))
    await expect(middleware(request(invalid) as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.queryOneFresh).not.toHaveBeenCalled()
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.resolveUserPermissions).not.toHaveBeenCalled()
  })

  it('uses current identity and ordinary permissions without reading or writing session KV', async () => {
    const token = await createJwt({ userId: activeUser.id })
    mocks.queryOneFresh.mockResolvedValue({ ...activeUser, role: 'viewer' })
    const event = request(token)
    await middleware(event as never)
    expect(event.context.user).toMatchObject({ role: 'viewer', permissionGroups: ['CLIENTS'] })
    expect(mocks.resolveUserPermissions).toHaveBeenCalledWith(event, activeUser.id, 'viewer', undefined)
    expect(mocks.kvGet).not.toHaveBeenCalled()
    expect(mocks.kvPut).not.toHaveBeenCalled()
  })

  it('returns 503 on a fresh database failure without accepting stale cache or clearing cookies', async () => {
    const token = await createJwt({ userId: activeUser.id })
    mocks.queryOneFresh.mockRejectedValue(new Error('synthetic connection unavailable'))
    const event = request(token)
    await expect(middleware(event as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(event.context.user).toBeUndefined()
    expect(mocks.deleteCookie).not.toHaveBeenCalled()
  })
})
