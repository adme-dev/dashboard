import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { GA4_SCOPE, getGa4AuthUrl, getGa4GrantedScopes } from '../../../server/utils/ga4Client'

vi.hoisted(() => {
  vi.stubGlobal('eventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (error: { statusMessage: string }) => Object.assign(new Error(error.statusMessage), error))
})

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  role: vi.fn(), cookie: vi.fn(), redirect: vi.fn((_event, url) => url)
}))
vi.mock('~~/server/utils/auth', () => ({ requireRole: mocks.role }))
vi.mock('h3', () => ({ setCookie: mocks.cookie, sendRedirect: mocks.redirect }))
vi.mock('~~/server/utils/googleOAuthRuntimeConfig', () => ({
  resolveGoogleOAuthRuntimeConfig: () => ({ googleClientId: 'client', googleClientSecret: 'test-config', ga4RedirectUri: '/callback' }),
  buildGoogleOAuthRedirectUri: () => 'https://agency.test/callback', GA4_CALLBACK_PATH: '/callback'
}))
const { default: handler } = await import('../../../server/api/agency/social/ga4/connect.get')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query = {}
  mocks.role.mockResolvedValue({})
  vi.stubGlobal('getQuery', () => mocks.query)
})

describe('GA4 authorization permissions', () => {
  it('keeps ordinary connections read-only', () => {
    expect(new URL(getGa4AuthUrl('client', 'https://agency.test/callback', 'nonce')).searchParams.get('scope')).toBe(GA4_SCOPE)
  })
  it('requests edit permission only for explicit key-event setup', () => {
    const url = new URL(getGa4AuthUrl('client', 'https://agency.test/callback', 'nonce', { manageKeyEvents: true }))
    expect(url.searchParams.get('scope')?.split(' ')).toContain('https://www.googleapis.com/auth/analytics.edit')
  })
  it('provides a staff-authorized direct Google consent redirect', async () => {
    mocks.query = { purpose: 'key_events', redirect: '1' }
    const result = await handler({} as H3Event)
    expect(mocks.role).toHaveBeenCalled()
    expect(mocks.cookie).toHaveBeenCalledWith(expect.anything(), 'ga4_oauth_state', expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'lax' }))
    const url = new URL(result as string)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('scope')).toContain('analytics.edit')
    expect(url.searchParams.get('state')).toBe(mocks.cookie.mock.calls[0][2])
  })
  it('preserves the existing JSON response for reporting connections', async () => {
    const result = await handler({} as H3Event) as { url: string }
    expect(new URL(result.url).searchParams.get('scope')).toBe(GA4_SCOPE)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
  it.each([{ purpose: 'other' }, { purpose: ['key_events', 'reporting'] }, { redirect: 'https://example.com' }])('rejects unsupported OAuth options %j', async (query) => {
    mocks.query = query as Record<string, string>
    await expect(handler({} as H3Event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.cookie).not.toHaveBeenCalled()
  })
  it('does not start OAuth when the staff role check fails', async () => {
    mocks.role.mockRejectedValue(new Error('Forbidden'))
    await expect(handler({} as H3Event)).rejects.toThrow('Forbidden')
    expect(mocks.cookie).not.toHaveBeenCalled()
  })
  it('records actual grants without claiming an edit scope when Google omits it', () => {
    expect(getGa4GrantedScopes(undefined)).toEqual(GA4_SCOPE.split(' '))
    expect(getGa4GrantedScopes('openid email https://www.googleapis.com/auth/analytics.edit email')).toEqual(['openid', 'email', 'https://www.googleapis.com/auth/analytics.edit'])
  })
})
