import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'

const mocks = vi.hoisted(() => ({
  reply: vi.fn(),
  recordOutbound: vi.fn(),
  resolveSocialAccountAccessToken: vi.fn()
}))

vi.mock('~~/server/utils/social-providers/registry', () => ({
  getProviderOrThrow: () => ({ reply: (...args: unknown[]) => mocks.reply(...args) })
}))
vi.mock('~~/server/utils/socialInbox/store', () => ({
  recordOutbound: (...args: unknown[]) => mocks.recordOutbound(...args)
}))
vi.mock('~~/server/utils/socialInbox/tokenRefresh', () => ({
  resolveSocialAccountAccessToken: (...args: unknown[]) => mocks.resolveSocialAccountAccessToken(...args)
}))

function db(conv: Record<string, unknown>, parent: string | null = null) {
  return {
    queryOne: vi.fn(async (sql: string) => {
      if (sql.includes('FROM social_conversations')) return conv
      if (sql.includes('JOIN social_messages p')) return parent ? { platform_message_id: parent } : null
      return { platform_message_id: 'urn:li:comment:(urn:li:activity:1,42)' }
    }),
    execute: vi.fn(async () => 1)
  }
}

const linkedinConv = {
  id: 'conv1',
  client_id: 'C1',
  social_account_id: 'li1',
  platform: 'linkedin',
  channel_type: 'comment',
  platform_conversation_id: 'urn:li:share:1',
  platform_account_id: '79988552',
  access_token: 'stale',
  refresh_token: 'RT',
  token_expires_at: '2020-01-01T00:00:00.000Z'
}

describe('dispatchReply LinkedIn token refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reply.mockResolvedValue({ platformMessageId: 'urn:li:comment:(urn:li:activity:1,99)', status: 'success' })
  })

  it('refreshes the LinkedIn token before replying to the latest inbound comment', async () => {
    mocks.resolveSocialAccountAccessToken.mockResolvedValueOnce('fresh')
    const database = db(linkedinConv)

    const result = await dispatchReply(database, 'conv1', { content: 'Thanks', sentByUserId: 'U1' })

    expect(database.queryOne.mock.calls[0]![0]).toContain('a.refresh_token, a.token_expires_at')
    expect(mocks.resolveSocialAccountAccessToken).toHaveBeenCalledWith({
      db: database,
      account: { id: 'li1', platform: 'linkedin', access_token: 'stale', refresh_token: 'RT', token_expires_at: '2020-01-01T00:00:00.000Z' }
    })
    expect(mocks.reply).toHaveBeenCalledWith(expect.objectContaining({
      accountId: '79988552',
      accessToken: 'fresh',
      conversationId: 'urn:li:comment:(urn:li:activity:1,42)'
    }))
    expect(result).toMatchObject({ ok: true })
  })

  it('passes the parent thread when the latest inbound comment is a nested reply', async () => {
    mocks.resolveSocialAccountAccessToken.mockResolvedValueOnce('fresh')
    const database = db(linkedinConv, 'urn:li:comment:(urn:li:activity:1,7)')

    await dispatchReply(database, 'conv1', { content: 'Thanks', sentByUserId: 'U1' })

    expect(database.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('JOIN social_messages p ON p.id = m.parent_message_id'),
      ['conv1', 'urn:li:comment:(urn:li:activity:1,42)']
    )
    expect(mocks.reply).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'urn:li:comment:(urn:li:activity:1,42)',
      threadParentId: 'urn:li:comment:(urn:li:activity:1,7)'
    }))
  })

  it('returns the refresh error without sending', async () => {
    mocks.resolveSocialAccountAccessToken.mockRejectedValueOnce(new Error('LinkedIn token refresh failed: invalid_grant'))
    const result = await dispatchReply(db(linkedinConv), 'conv1', { content: 'Thanks', sentByUserId: 'U1' })
    expect(result).toEqual({ ok: false, error: 'LinkedIn token refresh failed: invalid_grant' })
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('leaves other platforms on their stored token', async () => {
    await dispatchReply(db({ ...linkedinConv, platform: 'facebook' }), 'conv1', { content: 'Hi', sentByUserId: 'U1' })
    expect(mocks.resolveSocialAccountAccessToken).not.toHaveBeenCalled()
    expect(mocks.reply).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'stale' }))
  })
})

describe('dispatchReply reviewed-send hooks', () => {
  const facebookConv = { ...linkedinConv, platform: 'facebook', refresh_token: null }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reply.mockResolvedValue({ platformMessageId: 'fb_1', status: 'success' })
  })

  it('refuses before any provider call when the resolved target differs from the reviewed one', async () => {
    const onDispatchStart = vi.fn()
    const result = await dispatchReply(db(facebookConv), 'conv1', { content: 'Hi', sentByUserId: 'U1', expectedTarget: 'older_comment', onDispatchStart })
    expect(result).toEqual({ ok: false, error: 'reply_target_changed' })
    expect(onDispatchStart).not.toHaveBeenCalled()
    expect(mocks.reply).not.toHaveBeenCalled()
    expect(mocks.recordOutbound).not.toHaveBeenCalled()
  })

  it('signals dispatch start immediately before the provider call and marks provider outcomes as dispatched', async () => {
    const order: string[] = []
    mocks.reply.mockImplementationOnce(async () => {
      order.push('provider')
      return { platformMessageId: '', status: 'failed', error: 'http 500' }
    })
    const failed = await dispatchReply(db(facebookConv), 'conv1', {
      content: 'Hi', sentByUserId: 'U1', expectedTarget: 'urn:li:comment:(urn:li:activity:1,42)', onDispatchStart: () => order.push('start')
    })
    expect(order).toEqual(['start', 'provider'])
    expect(failed).toEqual({ ok: false, error: 'http 500', dispatched: true })
    expect(mocks.recordOutbound).not.toHaveBeenCalled()
    const sent = await dispatchReply(db(facebookConv), 'conv1', { content: 'Hi', sentByUserId: 'U1', expectedTarget: 'urn:li:comment:(urn:li:activity:1,42)' })
    expect(sent).toMatchObject({ ok: true, platformMessageId: 'fb_1', dispatched: true })
    expect(mocks.recordOutbound).toHaveBeenCalledTimes(1)
  })
})
