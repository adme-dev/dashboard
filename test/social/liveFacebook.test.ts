import { beforeEach, describe, expect, it, vi } from 'vitest'
const request = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/social-providers/http', () => ({ fetchWithTimeout: request }))
import { assertLiveRevisionAllowed, facebookLiveRequest, resolveLiveFacebookTarget } from '../../server/utils/socialPublishing/liveFacebook'
const account = { id: 'account', client_id: 'client', platform: 'facebook', platform_account_id: '123', access_token: 'secret-test-token', is_active: true, account_name: 'Page' }
const post = () => ({ id: 'post', client_id: 'client', status: 'published', account_ids: ['account'], platform_results: { facebook: { accountId: 'account', status: 'success', platform: 'facebook', platformAccountId: '123', platformPostId: '123_456' } } })
beforeEach(() => request.mockReset())
describe('verified Facebook feed targets', () => {
  it('uses the stored Page/account receipt', () => expect(resolveLiveFacebookTarget(post(), account)).toBe('123_456'))
  it.each(['456', '999_456', '123_456/../me', 'https://evil.test'])('rejects unsupported or foreign target %s', id => {
    const p = post(); p.platform_results.facebook.platformPostId = id
    expect(() => resolveLiveFacebookTarget(p, account)).toThrow('verified Facebook feed')
  })
  it.each([{ client_id: 'other' }, { is_active: false }, { platform: 'instagram' }, { access_token: '' }])('rejects wrong or disconnected account %j', patch => expect(() => resolveLiveFacebookTarget(post(), { ...account, ...patch })).toThrow())
  it('rejects failed receipts', () => {
    const p = post(); p.platform_results.facebook.status = 'failed'
    expect(() => resolveLiveFacebookTarget(p, account)).toThrow()
  })
  it('preserves legacy news customer gate', () => expect(() => assertLiveRevisionAllowed({ ...post(), metadata: { source: 'mcp_news' } })).toThrow('customer approval'))
})
describe('Facebook provider contract', () => {
  it('reads verified Page caption without placing token in URL', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ id: '123_456', from: { id: '123' }, message: 'Caption' })))
    expect(await facebookLiveRequest(account, '123_456', 'GET')).toEqual({ message: 'Caption' })
    expect(request.mock.calls[0][0]).not.toContain(account.access_token)
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: 'manual', timeoutMs: 20000, headers: { Authorization: 'Bearer secret-test-token' } })
  })
  it('rejects mismatched Page identity', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ id: '123_456', from: { id: '999' } })))
    await expect(facebookLiveRequest(account, '123_456', 'GET')).rejects.toThrow('unverified')
  })
  it('only sends caption text on update', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ success: true })))
    await facebookLiveRequest(account, '123_456', 'POST', 'New caption')
    expect(request.mock.calls[0][1].body).toBe(JSON.stringify({ message: 'New caption' }))
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('requires explicit removal success', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ success: false })))
    await expect(facebookLiveRequest(account, '123_456', 'DELETE')).rejects.toThrow('did not confirm')
  })
  it.each([302, 400, 429, 500])('rejects HTTP %s without retry or redirect', async status => {
    request.mockResolvedValue(new Response('provider details', { status }))
    await expect(facebookLiveRequest(account, '123_456', 'POST', 'Caption')).rejects.toThrow('could not confirm')
    expect(request).toHaveBeenCalledTimes(1)
  })
})
