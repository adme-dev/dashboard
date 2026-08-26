import { describe, it, expect } from 'vitest'
import {
  normalizeMetaMentionWebhook, normalizeMetaMessageWebhook, normalizeMetaCommentWebhook
} from '~~/server/utils/socialInbox/normalize'
import {
  metaScopeSet, metaSubscribedFields, buildMetaAuthUrl, META_MESSAGING_SCOPES,
  META_USER_CONTENT_SCOPES, isSocialDmEnabled, isSocialUserContentEnabled
} from '~~/server/utils/socialOAuth/meta'
import { buildMessengerSend } from '~~/server/utils/social-providers/facebook'

describe('normalizeMetaMentionWebhook', () => {
  it('maps a FB page mention (comment-anchored) to a mention NormalizedEvent', () => {
    const change = {
      field: 'mention',
      value: {
        item: 'comment', comment_id: 'c_99', post_id: 'p_1', sender_id: 'u7', sender_name: 'Dana',
        message: 'hey @brand', permalink_url: 'https://fb/c99', created_time: 1700000000
      }
    }
    const ev = normalizeMetaMentionWebhook('facebook', change)!
    expect(ev.channelType).toBe('mention')
    expect(ev.platformConversationId).toBe('c_99') // comment id preferred over post id
    expect(ev.message.platformMessageId).toBe('c_99')
    expect(ev.message.authorName).toBe('Dana')
    expect(ev.message.content).toBe('hey @brand')
    expect(ev.message.platformTimestamp).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('handles an IG mention keyed on media_id', () => {
    const ev = normalizeMetaMentionWebhook('instagram', { field: 'mentions', value: { media_id: 'm_5' } })!
    expect(ev.channelType).toBe('mention')
    expect(ev.platformConversationId).toBe('m_5')
  })

  it('returns null for non-mention changes or empty values', () => {
    expect(normalizeMetaMentionWebhook('facebook', { field: 'feed', value: {} })).toBeNull()
    expect(normalizeMetaMentionWebhook('facebook', { field: 'mention' })).toBeNull()
    expect(normalizeMetaMentionWebhook('facebook', { field: 'mention', value: {} })).toBeNull()
  })
})

describe('normalizeMetaMessageWebhook', () => {
  it('maps an inbound Messenger DM keyed on the sender PSID', () => {
    const messaging = {
      sender: { id: 'PSID_1' }, recipient: { id: 'PAGE_1' }, timestamp: 1700000000000,
      message: { mid: 'mid_1', text: 'hello there' }
    }
    const ev = normalizeMetaMessageWebhook('facebook', messaging)!
    expect(ev.channelType).toBe('dm')
    expect(ev.platformConversationId).toBe('PSID_1') // thread keyed by participant
    expect(ev.participant.id).toBe('PSID_1')
    expect(ev.message.platformMessageId).toBe('mid_1')
    expect(ev.message.direction).toBe('in')
    expect(ev.message.content).toBe('hello there')
  })

  it('IGNORES echoes (our own outbound reflected back) and receipts', () => {
    expect(normalizeMetaMessageWebhook('facebook', { sender: { id: 'P' }, message: { mid: 'm', text: 'x', is_echo: true } })).toBeNull()
    expect(normalizeMetaMessageWebhook('facebook', { sender: { id: 'P' }, delivery: { mids: ['m'] } })).toBeNull() // no message
  })

  it('maps an attachment-only DM', () => {
    const ev = normalizeMetaMessageWebhook('instagram', {
      sender: { id: 'IGSID' }, message: { mid: 'm2', attachments: [{ type: 'image', payload: { url: 'https://x/img.jpg' } }] }
    })!
    expect(ev.message.messageType).toBe('image')
    expect(ev.message.attachments).toEqual([{ url: 'https://x/img.jpg', type: 'image' }])
  })

  it('returns null when there is no renderable content (bare reaction)', () => {
    expect(normalizeMetaMessageWebhook('facebook', { sender: { id: 'P' }, message: { mid: 'm', reaction: { emoji: '❤️' } } })).toBeNull()
  })
})

describe('comment normalizer still works (regression guard)', () => {
  it('maps a feed comment add', () => {
    const ev = normalizeMetaCommentWebhook('facebook', {
      field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'c1', post_id: 'p1', message: 'hi', from: { id: 'u', name: 'U' } }
    })!
    expect(ev.channelType).toBe('comment')
    expect(ev.platformConversationId).toBe('p1')
  })
})

describe('Meta OAuth scope/field gating (App-Review-gated DM channels)', () => {
  it('base scope set excludes messaging; messaging set adds it only when enabled', () => {
    expect(metaScopeSet(false)).not.toContain('pages_messaging')
    expect(metaScopeSet(false)).toContain('instagram_manage_comments')
    const withMsg = metaScopeSet(true)
    for (const s of META_MESSAGING_SCOPES) expect(withMsg).toContain(s)
  })

  it('gates Page user-content access independently until Meta approves it', () => {
    expect(metaScopeSet(false, false)).not.toContain('pages_read_user_content')
    const withUserContent = metaScopeSet(false, true)
    for (const scope of META_USER_CONTENT_SCOPES) expect(withUserContent).toContain(scope)

    process.env.SOCIAL_USER_CONTENT_ENABLED = 'true'
    expect(isSocialUserContentEnabled()).toBe(true)
    delete process.env.SOCIAL_USER_CONTENT_ENABLED
  })

  it('subscribed fields = feed only by default; feed,mention,messages when enabled', () => {
    expect(metaSubscribedFields(false)).toBe('feed')
    expect(metaSubscribedFields(true)).toBe('feed,mention,messages')
  })

  it('buildMetaAuthUrl omits messaging scopes unless includeMessaging', () => {
    expect(decodeURIComponent(buildMetaAuthUrl('A', 'https://x/cb', 'S', false))).not.toContain('pages_messaging')
    expect(decodeURIComponent(buildMetaAuthUrl('A', 'https://x/cb', 'S', true))).toContain('pages_messaging')
  })

  it('isSocialDmEnabled is false unless the env flag is exactly "true"', () => {
    expect(isSocialDmEnabled()).toBe(false) // unset in tests
  })
})

describe('buildMessengerSend (DM reply request mapper)', () => {
  it('targets the page /messages edge with recipient PSID + RESPONSE type', () => {
    const { url, body } = buildMessengerSend('PAGE_1', 'PSID_1', 'thanks!', 'TOK')
    expect(url).toMatch(/\/PAGE_1\/messages$/)
    expect(body.recipient).toEqual({ id: 'PSID_1' })
    expect(body.message).toEqual({ text: 'thanks!' })
    expect(body.messaging_type).toBe('RESPONSE')
    expect(body.access_token).toBe('TOK')
  })
})
