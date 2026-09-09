import { afterEach, describe, expect, it, vi } from 'vitest'
const refresh = vi.hoisted(() => vi.fn(async () => 'fresh-token'))
const reply = vi.hoisted(() => vi.fn(async () => ({status:'success', platformMessageId:'r1:reply'})))
vi.mock('~~/server/utils/socialInbox/tokenRefresh', () => ({resolveSocialAccountAccessToken:refresh}))
vi.mock('~~/server/utils/social-providers/registry', () => ({getProviderOrThrow:() => ({reply})}))
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'
import { googleBusinessProvider } from '~~/server/utils/social-providers/google-business'

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })
describe('review dispatch', () => {
  it('refreshes the account token before posting and requests a live safety check for automation', async () => {
    const db = { queryOne:vi.fn(async () => ({id:'c', client_id:'cl', social_account_id:'a', platform:'google-business', platform_account_id:'acc:loc', platform_conversation_id:'accounts/acc/locations/loc/reviews/r1', channel_type:'review', access_token:'expired', refresh_token:'refresh', token_expires_at:'2020-01-01', is_active:true})), execute:vi.fn(async()=>1) }
    await dispatchReply(db as any, 'c', {content:'Thanks Sam', sentByUserId:'automation', aiGenerated:true, expectedReviewContent:'Original review text'})
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({account:expect.objectContaining({id:'a'})}))
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({accessToken:'fresh-token', onlyIfUnanswered:true, expectedReviewContent:'Original review text'}))
  })
  it('refuses automatic Google sends without the drafting snapshot', async () => {
    const db = { queryOne: vi.fn(async () => ({ platform:'google-business', channel_type:'review', is_active:true })), execute:vi.fn() }
    expect((await dispatchReply(db as any, 'c', {content:'Thanks', sentByUserId:'automation'})).ok).toBe(false)
    expect(reply).not.toHaveBeenCalled()
  })
  it.each([
    {starRating:'FIVE', reviewReply:{comment:'Already answered'}},
    {starRating:'THREE'},
    {starRating:'FIVE', comment:'A scam'},
  ])('never overwrites or auto-answers a now-unsafe Google review: %j', async (review) => {
    const fetch = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(review)))
    const result = await googleBusinessProvider.reply!({accountId:'acc:loc',accessToken:'AT',conversationId:'accounts/acc/locations/loc/reviews/r1',content:'Thanks',onlyIfUnanswered:true})
    expect(result.status).toBe('failed')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[1]?.method).not.toBe('PUT')
  })
})
