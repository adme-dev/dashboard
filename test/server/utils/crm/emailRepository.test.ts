import { describe, expect, it, vi } from 'vitest'
import { createPostgresCrmEmailRepository } from '~~/server/utils/crm/emailRepository'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222'
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333'

const conversationRow = {
  id: CONVERSATION_ID,
  client_id: CLIENT_ID,
  primary_channel: 'email',
  status: 'open',
  subject: 'Website enquiry',
  person_id: null,
  company_id: null,
  lead_id: null,
  opportunity_id: null,
  assigned_to: null,
  last_message_at: null,
  created_at: '2026-07-30T00:00:00.000Z',
  updated_at: '2026-07-30T00:00:00.000Z'
}

const messageRow = {
  id: MESSAGE_ID,
  client_id: CLIENT_ID,
  conversation_id: CONVERSATION_ID,
  direction: 'inbound',
  provider: 'cloudflare_email',
  provider_message_id: 'provider-message-1',
  idempotency_key: 'inbound-message-1',
  internet_message_id: '<message@example.com>',
  in_reply_to: null,
  threading_references: [],
  from_address: 'customer@example.net',
  from_name: 'Customer',
  to_addresses: [{ address: 'sales@example.com' }],
  cc_addresses: [],
  bcc_addresses: [],
  reply_to_address: null,
  subject: 'Website enquiry',
  body_text: 'I would like more information.',
  body_html: null,
  delivery_status: 'delivered',
  delivery_status_at: '2026-07-30T00:00:00.000Z',
  failure_code: null,
  failure_reason: null,
  occurred_at: '2026-07-30T00:00:00.000Z',
  created_at: '2026-07-30T00:00:00.000Z',
  updated_at: '2026-07-30T00:00:00.000Z'
}

const messageInput = {
  clientId: CLIENT_ID,
  conversationId: CONVERSATION_ID,
  provider: 'cloudflare_email',
  providerMessageId: 'provider-message-1',
  idempotencyKey: 'inbound-message-1',
  deliveryStatus: 'delivered' as const,
  actor: { type: 'integration' as const, id: null },
  envelope: {
    direction: 'inbound' as const,
    from: { address: 'customer@example.net', name: 'Customer' },
    to: [{ address: 'sales@example.com' }],
    cc: [],
    bcc: [],
    subject: 'Website enquiry',
    text: 'I would like more information.',
    html: null,
    internetMessageId: '<message@example.com>',
    inReplyTo: null,
    references: [],
    occurredAt: '2026-07-30T00:00:00.000Z'
  }
}

function repositoryWith(query: ReturnType<typeof vi.fn>) {
  return createPostgresCrmEmailRepository(async callback => callback({ query }))
}

describe('CRM email repository conversation and message writes', () => {
  it('creates a tenant-scoped conversation', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [conversationRow], rowCount: 1 })
    const repository = repositoryWith(query)

    await expect(repository.createConversation({
      clientId: CLIENT_ID,
      subject: 'Website enquiry',
      personId: null,
      companyId: null,
      leadId: null,
      opportunityId: null,
      assignedTo: null,
      actor: { type: 'system', id: null }
    })).resolves.toMatchObject({
      id: CONVERSATION_ID,
      clientId: CLIENT_ID,
      subject: 'Website enquiry'
    })

    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain('INSERT INTO crm_conversations')
    expect(sql).toContain('client_id')
    expect(params[0]).toBe(CLIENT_ID)
  })

  it('creates a message once and updates its tenant-owned conversation timestamp', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [messageRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    const repository = repositoryWith(query)

    await expect(repository.createMessage(messageInput)).resolves.toMatchObject({
      status: 'created',
      message: {
        id: MESSAGE_ID,
        clientId: CLIENT_ID,
        conversationId: CONVERSATION_ID,
        deliveryStatus: 'delivered'
      }
    })

    const [existingSql, existingParams] = query.mock.calls[0]!
    expect(existingSql).toContain('WHERE client_id = $1')
    expect(existingParams).toEqual([CLIENT_ID, 'inbound-message-1'])
    const [insertSql, insertParams] = query.mock.calls[1]!
    expect(insertSql).toContain('ON CONFLICT DO NOTHING')
    expect(insertParams[0]).toBe(CLIENT_ID)
    const [updateSql, updateParams] = query.mock.calls[2]!
    expect(updateSql).toContain('UPDATE crm_conversations')
    expect(updateSql).toContain('WHERE client_id = $1')
    expect(updateParams).toEqual([CLIENT_ID, CONVERSATION_ID, messageInput.envelope.occurredAt])
  })

  it('returns an existing message for a repeated tenant idempotency key', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [messageRow], rowCount: 1 })
    const repository = repositoryWith(query)

    await expect(repository.createMessage(messageInput)).resolves.toMatchObject({
      status: 'existing',
      message: { id: MESSAGE_ID }
    })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('recovers the canonical message after a provider-message uniqueness race', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [messageRow], rowCount: 1 })
    const repository = repositoryWith(query)

    await expect(repository.createMessage({
      ...messageInput,
      idempotencyKey: 'different-retry-key'
    })).resolves.toMatchObject({
      status: 'existing',
      message: { id: MESSAGE_ID, providerMessageId: 'provider-message-1' }
    })

    const [recoverySql, recoveryParams] = query.mock.calls[2]!
    expect(recoverySql).toContain('client_id = $1')
    expect(recoverySql).toContain('provider_message_id = $4')
    expect(recoveryParams).toEqual([
      CLIENT_ID,
      'different-retry-key',
      'cloudflare_email',
      'provider-message-1',
      '<message@example.com>'
    ])
    expect(query).toHaveBeenCalledTimes(3)
  })
})
