import { describe, expect, it, vi } from 'vitest'
import { createPostgresCrmEmailRepository } from '~~/server/utils/crm/emailRepository'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222'
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333'
const EVENT_ID = '44444444-4444-4444-8444-444444444444'

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

const queuedMessageRow = {
  ...messageRow,
  direction: 'outbound',
  delivery_status: 'queued',
  provider_message_id: null,
  internet_message_id: '<outbound@example.com>'
}

const sentMessageRow = {
  ...queuedMessageRow,
  delivery_status: 'sent',
  delivery_status_at: '2026-07-30T00:05:00.000Z',
  updated_at: '2026-07-30T00:05:00.000Z'
}

const deliveredMessageRow = {
  ...sentMessageRow,
  delivery_status: 'delivered',
  delivery_status_at: '2026-07-30T00:10:00.000Z',
  updated_at: '2026-07-30T00:10:00.000Z'
}

const complainedMessageRow = {
  ...deliveredMessageRow,
  delivery_status: 'complained',
  delivery_status_at: '2026-07-30T00:15:00.000Z',
  failure_code: 'complaint',
  failure_reason: 'Recipient marked the message as spam.',
  updated_at: '2026-07-30T00:15:00.000Z'
}

const eventRow = {
  id: EVENT_ID,
  client_id: CLIENT_ID,
  message_id: MESSAGE_ID,
  provider: 'cloudflare_email',
  provider_event_id: 'provider-event-1',
  event_type: 'sent',
  delivery_status: 'sent',
  occurred_at: '2026-07-30T00:05:00.000Z',
  smtp_code: '250',
  reason: null,
  sanitized_metadata: { transport: 'smtp' },
  created_at: '2026-07-30T00:05:01.000Z'
}

const eventInput = {
  clientId: CLIENT_ID,
  messageId: MESSAGE_ID,
  provider: 'cloudflare_email',
  providerEventId: 'provider-event-1',
  eventType: 'sent' as const,
  deliveryStatus: 'sent' as const,
  occurredAt: '2026-07-30T00:05:00.000Z',
  smtpCode: '250',
  reason: null,
  metadata: { transport: 'smtp' }
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
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
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
    const [projectionSql, projectionParams] = query.mock.calls[3]!
    expect(projectionSql).toContain('INSERT INTO crm_communications')
    expect(projectionParams).toEqual([CLIENT_ID, MESSAGE_ID])
    expect(query).toHaveBeenCalledTimes(4)
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

describe('CRM email repository delivery events', () => {
  it('appends a provider event and advances the locked message state', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [queuedMessageRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [eventRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [sentMessageRow], rowCount: 1 })
    const repository = repositoryWith(query)

    await expect(repository.appendMessageEvent(eventInput)).resolves.toMatchObject({
      status: 'appended',
      event: { id: EVENT_ID, providerEventId: 'provider-event-1' },
      message: { id: MESSAGE_ID, deliveryStatus: 'sent' }
    })

    const [lockSql, lockParams] = query.mock.calls[1]!
    expect(lockSql).toContain('FOR UPDATE')
    expect(lockSql).toContain('client_id = $1')
    expect(lockParams).toEqual([CLIENT_ID, MESSAGE_ID])
    const [updateSql, updateParams] = query.mock.calls[3]!
    expect(updateSql).toContain('UPDATE crm_messages')
    expect(updateSql).toContain('WHERE client_id = $1')
    expect(updateParams.slice(0, 4)).toEqual([
      CLIENT_ID,
      MESSAGE_ID,
      'sent',
      eventInput.occurredAt
    ])
  })

  it('returns a duplicate event attached to the same message', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [eventRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [sentMessageRow], rowCount: 1 })
    const repository = repositoryWith(query)

    await expect(repository.appendMessageEvent(eventInput)).resolves.toMatchObject({
      status: 'duplicate',
      event: { id: EVENT_ID },
      message: { id: MESSAGE_ID, deliveryStatus: 'sent' }
    })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('rejects a provider event ID already attached to another message', async () => {
    const otherMessageId = '55555555-5555-4555-8555-555555555555'
    const query = vi.fn().mockResolvedValue({
      rows: [{ ...eventRow, message_id: otherMessageId }],
      rowCount: 1
    })
    const repository = repositoryWith(query)

    await expect(repository.appendMessageEvent(eventInput)).resolves.toMatchObject({
      status: 'event_conflict',
      event: { id: EVENT_ID },
      existingMessageId: otherMessageId
    })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('does not append an event when the tenant-owned message is absent', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const repository = repositoryWith(query)

    await expect(repository.appendMessageEvent(eventInput)).resolves.toEqual({
      status: 'not_found'
    })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('stores a stale event without regressing a delivered message', async () => {
    const staleEvent = {
      ...eventRow,
      event_type: 'sent',
      delivery_status: 'sent'
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [deliveredMessageRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [staleEvent], rowCount: 1 })
    const repository = repositoryWith(query)

    await expect(repository.appendMessageEvent(eventInput)).resolves.toMatchObject({
      status: 'appended',
      message: { deliveryStatus: 'delivered' }
    })
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('allows a complaint to advance an already delivered message', async () => {
    const complaintInput = {
      ...eventInput,
      providerEventId: 'provider-event-complaint',
      eventType: 'complained' as const,
      deliveryStatus: 'complained' as const,
      occurredAt: '2026-07-30T00:15:00.000Z',
      smtpCode: null,
      reason: 'Recipient marked the message as spam.'
    }
    const complaintEvent = {
      ...eventRow,
      provider_event_id: complaintInput.providerEventId,
      event_type: 'complained',
      delivery_status: 'complained',
      occurred_at: complaintInput.occurredAt,
      smtp_code: null,
      reason: complaintInput.reason
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [deliveredMessageRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [complaintEvent], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [complainedMessageRow], rowCount: 1 })
    const repository = repositoryWith(query)

    await expect(repository.appendMessageEvent(complaintInput)).resolves.toMatchObject({
      status: 'appended',
      message: {
        deliveryStatus: 'complained',
        failureCode: 'complaint',
        failureReason: complaintInput.reason
      }
    })
  })

  it('recovers a concurrent event insert and reports cross-message conflict', async () => {
    const otherMessageId = '55555555-5555-4555-8555-555555555555'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [queuedMessageRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ ...eventRow, message_id: otherMessageId }],
        rowCount: 1
      })
    const repository = repositoryWith(query)

    await expect(repository.appendMessageEvent(eventInput)).resolves.toMatchObject({
      status: 'event_conflict',
      existingMessageId: otherMessageId
    })
    expect(query).toHaveBeenCalledTimes(4)
  })
})
