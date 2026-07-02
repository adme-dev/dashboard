import { describe, it, expect, vi, beforeEach } from 'vitest'

import { publishPost } from '~~/server/utils/socialPublishing'

const { postSpy, executeSpy, refreshSpy } = vi.hoisted(() => ({
  postSpy: vi.fn(async () => ({ platformPostId: 'gbp_1', url: 'https://business.google.com/x', status: 'success' })),
  executeSpy: vi.fn(async () => 1),
  refreshSpy: vi.fn(async () => ({ access_token: 'FRESH', refresh_token: 'FRESH_RT', expires_in: 3600, token_type: 'Bearer' }))
}))

// publishPost dispatches through the provider registry and, for GBP, refreshes tokens
// + persists them. Mock every side-effecting dependency so we only exercise the
// GBP target-resolution logic (resolvePublishTarget) added to socialPublishing.ts.
vi.mock('~~/server/utils/social-providers/registry', () => ({
  getProviderOrThrow: () => ({ identifier: 'google-business', name: 'GBP', post: postSpy })
}))

vi.mock('~~/server/utils/db', () => ({ execute: (...a: unknown[]) => executeSpy(...a) }))

vi.mock('~~/server/utils/socialOAuth/googleBusiness', () => ({
  refreshGoogleBusinessToken: (...a: unknown[]) => refreshSpy(...a)
}))

vi.mock('~~/server/utils/socialOAuth/env', () => ({
  getGoogleBusinessOAuthConfig: () => ({ clientId: 'cid', clientSecret: 'sec', redirectUri: '/cb' })
}))

const FUTURE = new Date(Date.now() + 30 * 24 * 3600_000).toISOString()
const PAST = new Date(Date.now() - 1000).toISOString()
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

function gbpPost(account: Record<string, unknown>) {
  return {
    id: 'P',
    content: 'Hello from the shop',
    media_urls: [],
    link_url: null,
    platforms: ['google-business'],
    platform_overrides: {},
    accounts: [account]
  }
}

beforeEach(() => {
  postSpy.mockClear()
  executeSpy.mockClear()
  refreshSpy.mockClear()
  warnSpy.mockClear()
})

describe('publishPost — Google Business Profile target resolution', () => {
  it('uses metadata account/location ids and passes locationId in options', async () => {
    const res = await publishPost(gbpPost({
      id: 'a1', platform: 'google-business', platform_account_id: 'accFallback:locFallback',
      access_token: 'AT', token_expires_at: FUTURE, account_name: 'Store',
      metadata: { googleBusinessAccountId: 'accMeta', googleBusinessLocationId: 'locMeta' }
    }) as never)

    expect(res.status).toBe('published')
    expect(postSpy).toHaveBeenCalledTimes(1)
    const arg = postSpy.mock.calls[0]![0] as { accountId: string, accessToken: string, options: unknown }
    expect(arg.accountId).toBe('accMeta')
    expect(arg.accessToken).toBe('AT') // not expiring → original token
    expect(arg.options).toEqual({ locationId: 'locMeta' })
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('falls back to the composite platform_account_id when metadata is absent', async () => {
    await publishPost(gbpPost({
      id: 'a1', platform: 'google-business', platform_account_id: 'accX:locX',
      access_token: 'AT', token_expires_at: FUTURE, account_name: 'Store', metadata: {}
    }) as never)
    const arg = postSpy.mock.calls[0]![0] as { accountId: string, options: unknown }
    expect(arg.accountId).toBe('accX')
    expect(arg.options).toEqual({ locationId: 'locX' })
  })

  it('refreshes an expiring token, persists it, and posts with the fresh token', async () => {
    const res = await publishPost(gbpPost({
      id: 'a1', platform: 'google-business', platform_account_id: 'accX:locX',
      access_token: 'OLD', refresh_token: 'RT', token_expires_at: PAST, account_name: 'Store',
      metadata: { googleBusinessAccountId: 'accX', googleBusinessLocationId: 'locX' }
    }) as never)

    expect(res.status).toBe('published')
    expect(refreshSpy).toHaveBeenCalledWith('RT', 'cid', 'sec')
    expect((postSpy.mock.calls[0]![0] as { accessToken: string }).accessToken).toBe('FRESH')

    // the refreshed token is written back to social_accounts for the row that was published
    expect(executeSpy).toHaveBeenCalledTimes(1)
    const [sql, params] = executeSpy.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/UPDATE social_accounts/)
    expect(sql).toMatch(/last_error = NULL/)
    expect(params[0]).toBe('a1') // WHERE id = account row id
    expect(params[1]).toBe('FRESH') // access_token
    expect(params[2]).toBe('FRESH_RT') // refresh_token
  })

  it('fails the platform (no provider call) when account/location cannot be resolved', async () => {
    const res = await publishPost(gbpPost({
      id: 'a1', platform: 'google-business', platform_account_id: 'no-colon',
      access_token: 'AT', token_expires_at: FUTURE, account_name: 'Store', metadata: {}
    }) as never)

    expect(res.status).toBe('failed')
    expect(res.platformResults['google-business']!.status).toBe('failed')
    expect(res.platformResults['google-business']!.error).toMatch(/account\/location/)
    expect(postSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith('social-publish.target_failed', expect.objectContaining({
      postId: 'P',
      platform: 'google-business',
      accountId: 'a1',
      error: 'Google Business Profile account is missing account/location metadata'
    }))
  })
})
