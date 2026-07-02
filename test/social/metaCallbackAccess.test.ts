import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, string> }
type TestGlobal = typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (e: TestEvent) => Record<string, string>
  getRequestURL: () => { origin: string }
  sendRedirect: ReturnType<typeof vi.fn>
}
const g = globalThis as TestGlobal
const sendRedirectMock = vi.fn(async (_event: unknown, location: string, code?: number) => ({ location, code }))

g.defineEventHandler = fn => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getRequestURL = () => ({ origin: 'https://app.example.test' })
g.sendRedirect = sendRedirectMock

const mockVerifyState = vi.fn()
const mockSignState = vi.fn()
const mockRequireSocialClientAccess = vi.fn()
const mockExchangeMetaCode = vi.fn()
const mockExchangeForLongLivedToken = vi.fn()
const mockListManagedPages = vi.fn()
const mockMapPagesToAccountRows = vi.fn()
const mockSubscribePageWebhook = vi.fn()
const mockUpsertSocialAccount = vi.fn()
const mockMarkWebhookSubscribed = vi.fn()
const mockPutPending = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
  execute: vi.fn()
}))
vi.mock('~~/server/utils/socialOAuth/state', () => ({
  verifyState: (...a: unknown[]) => mockVerifyState(...a),
  signState: (...a: unknown[]) => mockSignState(...a)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a)
}))
vi.mock('~~/server/utils/metaClient', () => ({
  exchangeMetaCode: (...a: unknown[]) => mockExchangeMetaCode(...a),
  exchangeForLongLivedToken: (...a: unknown[]) => mockExchangeForLongLivedToken(...a)
}))
vi.mock('~~/server/utils/socialOAuth/meta', () => ({
  listManagedPages: (...a: unknown[]) => mockListManagedPages(...a),
  mapPagesToAccountRows: (...a: unknown[]) => mockMapPagesToAccountRows(...a),
  subscribePageWebhook: (...a: unknown[]) => mockSubscribePageWebhook(...a)
}))
vi.mock('~~/server/utils/socialOAuth/store', () => ({
  upsertSocialAccount: (...a: unknown[]) => mockUpsertSocialAccount(...a),
  markWebhookSubscribed: (...a: unknown[]) => mockMarkWebhookSubscribed(...a)
}))
vi.mock('~~/server/utils/socialOAuth/pending', () => ({
  putPending: (...a: unknown[]) => mockPutPending(...a)
}))

const { default: callbackH } = await import('../../server/api/agency/social/publishing/accounts/callback/meta.get')

describe('Meta publishing account callback access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SOCIAL_OAUTH_STATE_SECRET = 'secret'
    process.env.META_APP_ID = 'meta-app'
    process.env.META_APP_SECRET = 'meta-secret'
    mockVerifyState.mockReturnValue({ clientId: 'C1', userId: 'U1' })
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
  })

  it('redirects before token exchange when callback client access is no longer valid', async () => {
    mockRequireSocialClientAccess.mockRejectedValueOnce(new Error('No access'))
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(mockExchangeMetaCode).not.toHaveBeenCalled()
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_error=client_access_required&client=C1',
      302
    )
  })
})
