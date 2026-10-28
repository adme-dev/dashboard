import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const loaded = vi.hoisted(() => ({ email: false, inbox: false, calls: [] as unknown[][] }))
vi.mock('~~/server/utils/ai/marketing/departmentEmailOperations', () => {
  loaded.email = true
  return {
    runDepartmentEmailOperation: vi.fn(async (...args: unknown[]) => {
      loaded.calls.push(args)
      return { ok: true, data: {} }
    })
  }
})
vi.mock('~~/server/utils/ai/marketing/departmentInboxOperations', () => {
  loaded.inbox = true
  return {
    runDepartmentInboxOperation: vi.fn(async (...args: unknown[]) => {
      loaded.calls.push(args)
      return { ok: true, data: {} }
    })
  }
})

const { departmentEmailTools, executeDepartmentEmailTool } = await import('~~/server/utils/ai/mcp/departmentEmailTools')
const { departmentInboxTools, executeDepartmentInboxTool } = await import('~~/server/utils/ai/mcp/departmentInboxTools')
const email = await import('~~/server/utils/ai/marketing/departmentEmailSchemas')
const inbox = await import('~~/server/utils/ai/marketing/departmentInboxSchemas')

const CLIENT = '11111111-1111-4111-8111-111111111111'
const UUID = '22222222-2222-4222-8222-222222222222'
const HASH = 'a'.repeat(64)

describe('department email/inbox MCP tool metadata', () => {
  it('exports the exact agreed names with explicit mutability and provider risk tier', () => {
    expect(departmentEmailTools.map(t => [t.name, !!t.mutates, t.riskTier ?? null])).toEqual([
      ['marketing_list_email_campaigns', false, null], ['marketing_get_email_campaign', false, null],
      ['marketing_list_email_audiences', false, null], ['marketing_get_email_send_proposal', false, null],
      ['marketing_create_email_campaign_draft', true, null], ['marketing_update_email_campaign_draft', true, null],
      ['marketing_set_email_campaign_audience', true, null], ['marketing_propose_email_campaign_send', true, null],
      ['marketing_review_email_campaign_send', true, null], ['marketing_execute_email_campaign_send', true, 'rich_confirm'],
      ['marketing_send_email_campaign_test', true, 'rich_confirm'], ['marketing_pause_email_campaign_send', true, null],
      ['marketing_cancel_email_campaign', true, null]
    ])
    expect(departmentInboxTools.map(t => [t.name, !!t.mutates, t.riskTier ?? null])).toEqual([
      ['marketing_list_inbox_conversations', false, null], ['marketing_get_inbox_conversation', false, null],
      ['marketing_list_inbox_reply_queue', false, null], ['marketing_triage_inbox_conversation', true, null],
      ['marketing_add_inbox_note', true, null], ['marketing_draft_inbox_reply', true, null],
      ['marketing_reject_inbox_reply', true, null], ['marketing_send_inbox_reply', true, 'rich_confirm']
    ])
    expect([...email.DEPARTMENT_EMAIL_READ_NAMES, ...email.DEPARTMENT_EMAIL_WRITE_NAMES]).toEqual(departmentEmailTools.map(t => t.name))
    expect([...inbox.DEPARTMENT_INBOX_READ_NAMES, ...inbox.DEPARTMENT_INBOX_WRITE_NAMES]).toEqual(departmentInboxTools.map(t => t.name))
    for (const name of [...email.DEPARTMENT_EMAIL_PROVIDER_NAMES, ...inbox.DEPARTMENT_INBOX_PROVIDER_NAMES]) {
      expect([...email.DEPARTMENT_EMAIL_WRITE_NAMES, ...inbox.DEPARTMENT_INBOX_WRITE_NAMES] as string[]).toContain(name)
    }
  })

  it('projects strict object schemas with an acknowledgement on every mutation and untrusted results', () => {
    for (const tool of [...departmentEmailTools, ...departmentInboxTools]) {
      const schema = z.toJSONSchema(tool.parameters) as { type: string, properties: Record<string, unknown>, additionalProperties?: boolean, required?: string[] }
      expect(schema.type, tool.name).toBe('object')
      expect(schema.additionalProperties, tool.name).toBe(false)
      expect(schema.required, tool.name).toContain('clientId')
      expect(tool.requiredPermission).toBe('MARKETING_MANAGEMENT')
      expect(tool.returnsUntrusted).toBe(true)
      if (tool.mutates) expect(schema.required, tool.name).toContain('acknowledgement')
    }
  })

  it('binds sends to exact reviewed identities and rejects loose input', () => {
    const exec = email.departmentEmailContracts.marketing_execute_email_campaign_send
    expect(exec.safeParse({ clientId: CLIENT, proposalId: UUID, expectedFreezeRevision: HASH, acknowledgement: 'SEND_APPROVED_CLIENT_EMAIL' }).success).toBe(true)
    expect(exec.safeParse({ clientId: CLIENT, proposalId: UUID, acknowledgement: 'SEND_APPROVED_CLIENT_EMAIL' }).success).toBe(false)
    expect(exec.safeParse({ clientId: CLIENT, proposalId: UUID, expectedFreezeRevision: HASH, acknowledgement: 'SEND_APPROVED_CLIENT_EMAIL', listIds: [UUID] }).success).toBe(false)
    // Test sends never take a recipient address: only the verified actor address is used.
    expect(email.departmentEmailContracts.marketing_send_email_campaign_test.safeParse({
      clientId: CLIENT, campaignId: UUID, expectedRevision: HASH, to: 'someone@example.com', acknowledgement: 'SEND_TEST_EMAIL_TO_MY_VERIFIED_ADDRESS'
    }).success).toBe(false)
    const send = inbox.departmentInboxContracts.marketing_send_inbox_reply
    const reply = { clientId: CLIENT, queueItemId: UUID, conversationId: UUID, socialAccountId: UUID, replyTargetId: '123_456', expectedContentHash: HASH, acknowledgement: 'SEND_INDEPENDENTLY_REVIEWED_SOCIAL_REPLY' }
    expect(send.safeParse(reply).success).toBe(true)
    for (const key of ['socialAccountId', 'replyTargetId', 'expectedContentHash', 'conversationId']) {
      expect(send.safeParse({ ...reply, [key]: undefined }).success, key).toBe(false)
    }
    expect(send.safeParse({ ...reply, content: 'edited at send time' }).success).toBe(false)
    expect(email.departmentEmailContracts.marketing_set_email_campaign_audience.safeParse({
      clientId: CLIENT, campaignId: UUID, expectedRevision: HASH, listIds: [UUID, UUID], acknowledgement: 'SET_CLIENT_EMAIL_AUDIENCE'
    }).success).toBe(false)
    expect(inbox.departmentInboxContracts.marketing_triage_inbox_conversation.safeParse({
      clientId: CLIENT, conversationId: UUID, expected: { status: 'open', assignedTo: null }, patch: { status: 'snoozed' }, acknowledgement: 'TRIAGE_CLIENT_CONVERSATION'
    }).success).toBe(false)
  })

  it('keeps metadata dependency-free and loads services only on execution', async () => {
    expect(loaded.email || loaded.inbox).toBe(false)
    for (const file of ['server/utils/ai/mcp/departmentEmailTools.ts', 'server/utils/ai/mcp/departmentInboxTools.ts',
      'server/utils/ai/marketing/departmentEmailSchemas.ts', 'server/utils/ai/marketing/departmentInboxSchemas.ts']) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from '[^']*(Operations|server\/utils\/db|marketingPolicy|registry|email-marketing|socialInbox)'/)
    }
    await executeDepartmentEmailTool('marketing_list_email_campaigns', { clientId: 'x' }, {} as never)
    await executeDepartmentInboxTool('marketing_send_inbox_reply', {}, {} as never, 'k', 'd')
    expect(loaded).toMatchObject({ email: true, inbox: true })
    expect(loaded.calls.at(-1)).toEqual(['marketing_send_inbox_reply', {}, {}, 'k', 'd'])
  })

  it('never executes mutations through the generic handler and rejects unknown names', async () => {
    for (const tool of [...departmentEmailTools, ...departmentInboxTools].filter(t => t.mutates)) {
      expect(await tool.handler({}, {} as never)).toMatchObject({ ok: false, code: 'coordinator_required' })
    }
    expect(await executeDepartmentEmailTool('marketing_send_inbox_reply', {}, {} as never)).toMatchObject({ ok: false, code: 'not_found' })
    expect(await executeDepartmentInboxTool('marketing_execute_email_campaign_send', {}, {} as never)).toMatchObject({ ok: false, code: 'not_found' })
  })
})
