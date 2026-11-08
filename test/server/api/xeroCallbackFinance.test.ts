import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(), tenants: vi.fn(), store: vi.fn(), selected: vi.fn(), auth: vi.fn(), match: vi.fn(), jwt: vi.fn(), finance: vi.fn(), cookie: vi.fn(), redirect: vi.fn(), query: { code: 'code', state: 'state' }, state: 'state', mode: ''
}))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), getRequestURL: () => new URL('https://xeroflow.io/api/xero/callback'), setCookie: mocks.cookie }))
vi.mock('~~/server/utils/xeroClient', () => ({ exchangeXeroCode: mocks.exchange, fetchXeroTenants: mocks.tenants }))
vi.mock('~~/server/utils/tokenStore', () => ({ setOrgToken: mocks.store, setOrgTenant: vi.fn() }))
vi.mock('~~/server/utils/session', () => ({ setSelectedTenant: mocks.selected }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, getUserByEmail: mocks.match, createJwt: mocks.jwt }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: mocks.finance }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', () => mocks.query)
vi.stubGlobal('getCookie', (_event: unknown, key: string) => key === 'xero_oauth_state' ? mocks.state : mocks.mode)
vi.stubGlobal('deleteCookie', vi.fn())
vi.stubGlobal('createError', createError)
vi.stubGlobal('sendRedirect', mocks.redirect)
const handler = (await import('~~/server/api/xero/callback.get')).default
const event = { context: {} } as Parameters<typeof handler>[0]
const user = { id: 'member-id', email: 'staff@example.test', role: 'owner', is_active: true }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query = { code: 'code', state: 'state' }
  mocks.state = 'state'
  mocks.mode = ''
  mocks.exchange.mockResolvedValue({ access_token: 'private-token', id_token: `header.${btoa(JSON.stringify({ email: user.email }))}.signature` })
  mocks.tenants.mockResolvedValue([{ tenantId: 'tenant-id', tenantName: 'Org' }])
  mocks.auth.mockRejectedValue(createError({ statusCode: 401 }))
  mocks.match.mockResolvedValue(user)
  mocks.jwt.mockResolvedValue('session-jwt')
  mocks.finance.mockResolvedValue(undefined)
})
const noFinancialAccess = () => {
  expect(mocks.tenants).not.toHaveBeenCalled()
  expect(mocks.store).not.toHaveBeenCalled()
  expect(mocks.selected).not.toHaveBeenCalled()
}
describe('Xero callback explicit Finance authority', () => {
  it('rejects CSRF before identity exchange or permission checks', async () => {
    mocks.state = 'different'
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.finance).not.toHaveBeenCalled()
    noFinancialAccess()
  })
  it('denies existing-session connection without explicit Finance even for owner identity', async () => {
    mocks.auth.mockResolvedValue(user)
    mocks.finance.mockRejectedValue(createError({ statusCode: 403 }))
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.finance).toHaveBeenCalledWith(event, user.id, true)
    noFinancialAccess()
    expect(mocks.cookie).not.toHaveBeenCalled()
  })
  it('preserves recognized non-Finance or read-only Finance Xero sign-in as identity-only and returns to agency', async () => {
    mocks.finance.mockRejectedValue(createError({ statusCode: 403 }))
    mocks.mode = 'popup'
    await handler(event)
    noFinancialAccess()
    expect(mocks.cookie.mock.calls.map(call => call[1])).toEqual(['auth_token', 'auth_status', 'auth_token_client'])
    expect(mocks.redirect).toHaveBeenCalledWith(event, '/agency', 302)
  })
  it.each([false, true])('fails closed on unavailable grant lookup with existing session=%s', async (session) => {
    if (session) mocks.auth.mockResolvedValue(user)
    mocks.finance.mockRejectedValue(createError({ statusCode: 503 }))
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
    noFinancialAccess()
    expect(mocks.cookie).not.toHaveBeenCalled()
    expect(mocks.jwt).not.toHaveBeenCalled()
  })
  it('denies unknown or inactive identity before shared financial state or app session', async () => {
    mocks.match.mockResolvedValue({ ...user, is_active: false })
    await handler(event)
    noFinancialAccess()
    expect(mocks.finance).not.toHaveBeenCalled()
    expect(mocks.cookie).not.toHaveBeenCalled()
    expect(mocks.redirect).toHaveBeenCalledWith(event, '/auth/xeroflow?error=xero-not-recognised', 302)
  })
  it('keeps Finance popup connection behavior and multi-tenant settings selection', async () => {
    mocks.mode = 'popup'
    mocks.tenants.mockResolvedValue([{ tenantId: 'tenant-a', tenantName: 'A' }, { tenantId: 'tenant-b', tenantName: 'B' }])
    await handler(event)
    expect(mocks.store).toHaveBeenCalledOnce()
    expect(mocks.selected).not.toHaveBeenCalled()
    expect(mocks.redirect).toHaveBeenCalledWith(event, '/xero-popup-close', 302)
    mocks.mode = ''
    await handler(event)
    expect(mocks.redirect).toHaveBeenLastCalledWith(event, '/settings', 302)
  })
  it.each([false, true])('retains explicitly granted Finance connection and session behavior; existing session=%s', async (session) => {
    if (session) mocks.auth.mockResolvedValue(user)
    await handler(event)
    expect(mocks.finance).toHaveBeenCalledWith(event, user.id, true)
    expect(mocks.finance.mock.invocationCallOrder[0]).toBeLessThan(mocks.tenants.mock.invocationCallOrder[0])
    expect(mocks.store).toHaveBeenCalledOnce()
    expect(mocks.selected).toHaveBeenCalledWith(event, 'tenant-id', 'Org')
    expect(mocks.cookie).toHaveBeenCalledTimes(session ? 0 : 3)
    expect(mocks.redirect).toHaveBeenCalledWith(event, session ? '/settings' : '/agency', 302)
  })
})
