import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ dbCalls: 0, deny: false, scoped: true }))
vi.mock('~~/server/utils/db', () => {
  const touch = async () => {
    h.dbCalls++
    throw new Error('database must not be reached')
  }
  return { queryRowsFresh: touch, queryOneFresh: touch, queryOne: touch, execute: touch, transaction: touch, transactionWithoutRetry: touch }
})
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({
  requireMarketingDepartment: vi.fn(async (ctx: Record<string, unknown>, write: boolean) => {
    if (h.deny) throw Object.assign(new Error('revoked'), { statusCode: 403 })
    return { ...ctx, write }
  })
}))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({
  resolveMarketingReadScope: vi.fn(async () => ({})),
  requireScopedClient: vi.fn(async () => { if (!h.scoped) throw Object.assign(new Error('nf'), { statusCode: 404 }) })
}))

const { runDepartmentEmailOperation } = await import('~~/server/utils/ai/marketing/departmentEmailOperations')
const { runDepartmentInboxOperation } = await import('~~/server/utils/ai/marketing/departmentInboxOperations')
const authority = await import('~~/server/utils/ai/marketing/departmentAuthority')

const CLIENT = '11111111-1111-4111-8111-111111111111'
const UUID = '22222222-2222-4222-8222-222222222222'
const KEY = `mcp:${'1'.repeat(64)}`
const DIGEST = 'f'.repeat(64)
const HASH = 'a'.repeat(64)
const ctx = { userId: UUID, userRole: 'staff', event: {} } as never
const execute = { clientId: CLIENT, proposalId: UUID, expectedFreezeRevision: HASH, acknowledgement: 'SEND_APPROVED_CLIENT_EMAIL' }
const reply = { clientId: CLIENT, queueItemId: UUID, conversationId: UUID, socialAccountId: UUID, replyTargetId: 't1', expectedContentHash: HASH, acknowledgement: 'SEND_INDEPENDENTLY_REVIEWED_SOCIAL_REPLY' }
const providerCalls = { runSend: vi.fn(), sendTest: vi.fn(), dispatch: vi.fn() }

describe('department email/inbox operation boundaries (no database, no provider)', () => {
  beforeEach(() => {
    Object.assign(h, { dbCalls: 0, deny: false, scoped: true })
    vi.clearAllMocks()
  })

  it('fails closed on revoked authority before any database or provider access', async () => {
    h.deny = true
    expect(await runDepartmentEmailOperation('marketing_execute_email_campaign_send', execute, ctx, KEY, DIGEST, providerCalls as never)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await runDepartmentEmailOperation('marketing_list_email_campaigns', { clientId: CLIENT }, ctx)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await runDepartmentInboxOperation('marketing_send_inbox_reply', reply, ctx, KEY, DIGEST, providerCalls as never)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await runDepartmentInboxOperation('marketing_get_inbox_conversation', { clientId: CLIENT, conversationId: UUID }, ctx)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(h.dbCalls).toBe(0)
    expect(providerCalls.runSend).not.toHaveBeenCalled()
    expect(providerCalls.dispatch).not.toHaveBeenCalled()
  })

  it('requests write consent for mutations and read-only authority for reads', async () => {
    h.scoped = false
    await runDepartmentEmailOperation('marketing_execute_email_campaign_send', execute, ctx, KEY, DIGEST)
    await runDepartmentEmailOperation('marketing_list_email_audiences', { clientId: CLIENT }, ctx)
    await runDepartmentInboxOperation('marketing_send_inbox_reply', reply, ctx, KEY, DIGEST)
    await runDepartmentInboxOperation('marketing_list_inbox_reply_queue', { clientId: CLIENT }, ctx)
    expect(vi.mocked(authority.requireMarketingDepartment).mock.calls.map(call => call[1])).toEqual([true, false, true, false])
  })

  it('refuses out-of-scope clients and unverified execution identities before database access', async () => {
    h.scoped = false
    expect(await runDepartmentEmailOperation('marketing_get_email_campaign', { clientId: CLIENT, campaignId: UUID }, ctx)).toMatchObject({ ok: false, code: 'not_found' })
    expect(await runDepartmentInboxOperation('marketing_list_inbox_conversations', { clientId: CLIENT }, ctx)).toMatchObject({ ok: false, code: 'not_found' })
    h.scoped = true
    expect(await runDepartmentEmailOperation('marketing_execute_email_campaign_send', execute, ctx, 'mcp:short', DIGEST)).toMatchObject({ ok: false, code: 'coordinator_required' })
    expect(await runDepartmentEmailOperation('marketing_send_email_campaign_test', { clientId: CLIENT, campaignId: UUID, expectedRevision: HASH, acknowledgement: 'SEND_TEST_EMAIL_TO_MY_VERIFIED_ADDRESS' }, ctx))
      .toMatchObject({ ok: false, code: 'coordinator_required' })
    expect(await runDepartmentInboxOperation('marketing_send_inbox_reply', reply, ctx, KEY, 'nope')).toMatchObject({ ok: false, code: 'coordinator_required' })
    expect(h.dbCalls).toBe(0)
  })

  it('rejects unknown keys, missing acknowledgements and recipient/content overrides', async () => {
    const emailCases: Array<[string, Record<string, unknown>]> = [
      ['marketing_execute_email_campaign_send', { ...execute, acknowledgement: 'SEND' }],
      ['marketing_execute_email_campaign_send', { ...execute, recipients: ['a@b.co'] }],
      ['marketing_create_email_campaign_draft', { clientId: CLIENT, name: 'N', bodySource: { a: 1 }, templateId: UUID, acknowledgement: 'CREATE_CLIENT_EMAIL_DRAFT' }],
      ['marketing_update_email_campaign_draft', { clientId: CLIENT, campaignId: UUID, expectedRevision: HASH, patch: {}, acknowledgement: 'UPDATE_CLIENT_EMAIL_DRAFT' }],
      ['marketing_update_email_campaign_draft', { clientId: CLIENT, campaignId: UUID, expectedRevision: HASH, patch: { clientId: UUID }, acknowledgement: 'UPDATE_CLIENT_EMAIL_DRAFT' }],
      ['marketing_cancel_email_campaign', { clientId: CLIENT, campaignId: UUID, expectedStatus: 'sent', acknowledgement: 'CANCEL_CLIENT_EMAIL_CAMPAIGN' }]
    ]
    for (const [name, args] of emailCases) {
      expect(await runDepartmentEmailOperation(name, args, ctx, KEY, DIGEST), name).toMatchObject({ ok: false, code: 'bad_args' })
    }
    const inboxCases: Array<[string, Record<string, unknown>]> = [
      ['marketing_send_inbox_reply', { ...reply, content: 'different' }],
      ['marketing_draft_inbox_reply', { clientId: CLIENT, conversationId: UUID, content: 'hi', acknowledgement: 'DRAFT_CLIENT_SOCIAL_REPLY' }],
      ['marketing_add_inbox_note', { clientId: CLIENT, conversationId: UUID, content: '', acknowledgement: 'ADD_INTERNAL_INBOX_NOTE' }],
      ['marketing_triage_inbox_conversation', { clientId: CLIENT, conversationId: UUID, expected: { status: 'open', assignedTo: null }, patch: { assignedTo: 'not-a-uuid' }, acknowledgement: 'TRIAGE_CLIENT_CONVERSATION' }]
    ]
    for (const [name, args] of inboxCases) {
      expect(await runDepartmentInboxOperation(name, args, ctx, KEY, DIGEST), name).toMatchObject({ ok: false, code: 'bad_args' })
    }
    expect(h.dbCalls).toBe(0)
  })
})
