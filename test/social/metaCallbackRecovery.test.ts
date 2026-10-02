import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signState, verifyState } from '~~/server/utils/socialOAuth/state'

const clientId = 'bc8a15a8-f523-4a75-a8f4-a501649bb71d'
const userId = '6a5d2e15-315c-4790-b64e-5e3e17001c8e'
const secret = 'test-state-secret'
const access = vi.fn()
const exchange = vi.fn()
const redirect = vi.fn((_event, location) => location)
Object.assign(globalThis, {
  defineEventHandler: (fn: unknown) => fn,
  getQuery: (event: any) => event.query,
  getRequestURL: () => ({ origin: 'https://app.example.test' }),
  sendRedirect: redirect,
})
vi.mock('~~/server/utils/db', () => ({ queryOne: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: (...args: any[]) => access(...args) }))
vi.mock('~~/server/utils/metaClient', () => ({ exchangeMetaCode: (...args: any[]) => exchange(...args), exchangeForLongLivedToken: vi.fn(async () => ({ access_token: 'test-long' })) }))
vi.mock('~~/server/utils/socialOAuth/meta', () => ({ listManagedPages: vi.fn(async () => []), mapPagesToAccountRows: vi.fn(), subscribePageWebhook: vi.fn() }))
vi.mock('~~/server/utils/socialOAuth/store', () => ({ upsertSocialAccount: vi.fn(), markWebhookSubscribed: vi.fn() }))
vi.mock('~~/server/utils/socialOAuth/pending', () => ({ putPending: vi.fn() }))
vi.mock('~~/server/utils/socialOAuth/diagnostics', () => ({ logOAuthFailure: vi.fn() }))
const { default: callback } = await import('~~/server/api/agency/social/publishing/accounts/callback/meta.get')

function state(age = 600_001, overrides: Record<string, unknown> = {}) {
  return signState({ clientId, userId, platform: 'meta', nonce: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', ts: Date.now() - age, ...overrides }, secret)
}
async function call(token: string, extra: Record<string, string> = {}) {
  return callback({ query: { state: token, code: 'test-code', ...extra } } as never)
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-02T01:00:00Z'))
  process.env.SOCIAL_OAUTH_STATE_SECRET = secret
  access.mockResolvedValue({ id: userId })
  exchange.mockResolvedValue({ access_token: 'test-short' })
})
afterEach(() => vi.useRealTimers())

describe('Meta callback recovery', () => {
  it('preserves the original client for a signed expired state without exchanging a code', async () => {
    const token = state()
    expect(verifyState(token, secret, 600_000)).toBeNull()
    expect(await call(token)).toBe(`/agency/social/publishing/accounts?social_error=expired_state&client=${clientId}`)
    expect(exchange).not.toHaveBeenCalled()
  })
  it.each(['not-a-token', 'wrong-signature', 'extra-segment'])('does not recover client context from %s', async kind => {
    const token = kind === 'not-a-token' ? kind : kind === 'extra-segment' ? `${state()}.extra` : `${state().split('.')[0]}.deadbeef`
    expect(await call(token)).toBe('/agency/social/publishing/accounts?social_error=invalid_state')
    expect(exchange).not.toHaveBeenCalled()
  })
  it.each([{ platform: 'google-business' }, { clientId: 'not-a-client' }, { clientId: [clientId] }, { userId: '' }, { nonce: '' }, { ts: 'yesterday' }])('rejects schema-invalid recovery context %j', async overrides => {
    expect(await call(state(600_001, overrides))).toBe('/agency/social/publishing/accounts?social_error=invalid_state')
    expect(exchange).not.toHaveBeenCalled()
  })
  it('does not preserve an expired client for a different signed-in operator', async () => {
    access.mockResolvedValue({ id: 'another-operator' })
    expect(await call(state())).toBe('/agency/social/publishing/accounts?social_error=invalid_state')
    expect(exchange).not.toHaveBeenCalled()
  })
  it('does not preserve an expired client when current access is denied', async () => {
    access.mockRejectedValue(new Error('No client access'))
    expect(await call(state())).toBe('/agency/social/publishing/accounts?social_error=invalid_state')
    expect(exchange).not.toHaveBeenCalled()
  })
  it('accepts the existing ten-minute boundary for valid state', async () => {
    expect(await call(state(600_000))).toBe(`/agency/social/publishing/accounts?social_error=no_pages&client=${clientId}`)
    expect(exchange).toHaveBeenCalledOnce()
  })
  it('preserves validated client context on provider errors and missing code', async () => {
    expect(await call(state(0), { error: 'access_denied' })).toBe(`/agency/social/publishing/accounts?social_error=access_denied&client=${clientId}`)
    expect(await call(state(0), { code: '' })).toBe(`/agency/social/publishing/accounts?social_error=no_code&client=${clientId}`)
    expect(exchange).not.toHaveBeenCalled()
  })
})
