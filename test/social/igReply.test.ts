import { describe, it, expect, vi, afterEach } from 'vitest'
import { instagramProvider, buildIgCommentReply } from '~~/server/utils/social-providers/instagram'
import { normalizeIgCommentWebhook } from '~~/server/utils/socialInbox/normalize'

afterEach(() => { vi.restoreAllMocks() })

describe('normalizeIgCommentWebhook (IG comment ingest — different shape than FB feed)', () => {
  it('maps an IG `comments` change, threading on media id with the comment id as message id', () => {
    const ev = normalizeIgCommentWebhook({
      field: 'comments',
      value: { id: 'igc_1', text: 'love it', from: { id: 'u9', username: 'fan' }, media: { id: 'media_3' } },
    })!
    expect(ev.platform).toBe('instagram')
    expect(ev.channelType).toBe('comment')
    expect(ev.platformConversationId).toBe('media_3') // thread on the media
    expect(ev.message.platformMessageId).toBe('igc_1') // reply target for /{id}/replies
    expect(ev.message.authorName).toBe('fan')
    expect(ev.message.content).toBe('love it')
  })

  it('returns null for non-IG-comment changes (FB feed handled by the other normalizer)', () => {
    expect(normalizeIgCommentWebhook({ field: 'feed', value: { item: 'comment' } })).toBeNull()
    expect(normalizeIgCommentWebhook({ field: 'comments', value: {} })).toBeNull()
  })
})

describe('buildIgCommentReply', () => {
  it('targets the IG comment /replies edge with message + token', () => {
    const { url, body } = buildIgCommentReply('cmt_1', 'thanks!', 'TOK')
    expect(url).toMatch(/\/cmt_1\/replies$/)
    expect(body).toEqual({ message: 'thanks!', access_token: 'TOK' })
  })
})

describe('instagramProvider.reply', () => {
  it('is now defined (closes the pre-existing IG "replies not supported" gap)', () => {
    expect(typeof instagramProvider.reply).toBe('function')
  })

  it('comment reply POSTs the /replies edge and returns the new id', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'reply_9' }), { status: 200 }),
    )
    const r = await instagramProvider.reply!({ accountId: 'IG1', accessToken: 'TOK', conversationId: 'cmt_1', content: 'hi', channelType: 'comment' })
    expect(r.status).toBe('success')
    expect(r.platformMessageId).toBe('reply_9')
    expect(String(spy.mock.calls[0]![0])).toMatch(/\/cmt_1\/replies$/)
  })

  it('DM send routes through the linked Page (viaPageId) Messenger Send API', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message_id: 'm_1' }), { status: 200 }),
    )
    const r = await instagramProvider.reply!({
      accountId: 'IGSID_ACCT', accessToken: 'TOK', conversationId: 'IGSID_USER',
      content: 'hey', channelType: 'dm', viaPageId: 'PAGE_1',
    })
    expect(r.status).toBe('success')
    expect(r.platformMessageId).toBe('m_1')
    // sends via the PAGE edge, not the IG account id
    expect(String(spy.mock.calls[0]![0])).toMatch(/\/PAGE_1\/messages$/)
  })

  it('surfaces a Graph error as a failed result (no throw)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'no perm' } }), { status: 403 }),
    )
    const r = await instagramProvider.reply!({ accountId: 'IG1', accessToken: 'TOK', conversationId: 'cmt_1', content: 'hi', channelType: 'comment' })
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/no perm/)
  })
})
