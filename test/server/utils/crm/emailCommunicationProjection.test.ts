import { describe, expect, it, vi } from 'vitest'
import { projectCrmEmailMessageToCommunication } from '~~/server/utils/crm/emailCommunicationProjection'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333'
const COMMUNICATION_ID = '66666666-6666-4666-8666-666666666666'

const communicationRow = {
  id: COMMUNICATION_ID,
  client_id: CLIENT_ID,
  person_id: '77777777-7777-4777-8777-777777777777',
  company_id: null,
  channel: 'email',
  direction: 'inbound',
  subject: 'Website enquiry',
  body: 'I would like more information.',
  occurred_at: '2026-07-30T00:00:00.000Z',
  external_id: `crm_message:${MESSAGE_ID}`,
  source: 'email_bridge',
  metadata: {
    canonical_type: 'crm_message',
    crm_message_id: MESSAGE_ID,
    conversation_id: '22222222-2222-4222-8222-222222222222'
  },
  created_at: '2026-07-30T00:00:01.000Z'
}

function trustedDeps() {
  return {
    resolveContext: vi.fn(async () => ({
      clientId: CLIENT_ID,
      actorType: 'system',
      actorId: 'trusted-system:crm_email_projection',
      visibility: { ownerScoped: false }
    })),
    authorizeAll: vi.fn(async (_context, refs) => refs)
  } as never
}

describe('CRM email communication projection', () => {
  it('reloads the trusted client before reading a message or projecting its target', async () => {
    const query = vi.fn()
    const resolveContext = vi.fn(async () => {
      throw Object.assign(new Error('Client not found'), {
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    })

    await expect(projectCrmEmailMessageToCommunication(
      { query },
      { clientId: CLIENT_ID, messageId: MESSAGE_ID },
      { resolveContext, authorizeAll: vi.fn() } as never
    )).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Client not found' })
    expect(resolveContext).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      purpose: 'crm_email_projection'
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('projects a linked canonical message with tenant-safe timeline fields', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ person_id: communicationRow.person_id, company_id: null }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [communicationRow], rowCount: 1 })

    await expect(projectCrmEmailMessageToCommunication(
      { query },
      { clientId: CLIENT_ID, messageId: MESSAGE_ID },
      trustedDeps()
    )).resolves.toMatchObject({
      status: 'projected',
      communication: {
        id: COMMUNICATION_ID,
        clientId: CLIENT_ID,
        personId: communicationRow.person_id,
        externalId: `crm_message:${MESSAGE_ID}`,
        source: 'email_bridge'
      }
    })

    const [sql, params] = query.mock.calls[1]!
    expect(sql).toContain('INSERT INTO crm_communications')
    expect(sql).toContain('JOIN crm_conversations')
    expect(sql).toContain('message.client_id = $1')
    expect(sql).toContain('conversation.client_id = $1')
    expect(sql).toContain('message.body_text')
    expect(sql).not.toContain('body_html')
    expect(sql).toContain(`'crm_message:' || message.id::text`)
    expect(sql).toContain(`'canonical_type', 'crm_message'`)
    expect(sql).toContain('conversation.person_id IS NOT NULL')
    expect(sql).toContain('conversation.company_id IS NOT NULL')
    expect(sql).toContain('ON CONFLICT (client_id, source, external_id)')
    expect(sql).toContain('DO NOTHING')
    expect(params).toEqual([CLIENT_ID, MESSAGE_ID])
  })

  it('returns unchanged when the message is unlinked, absent, or already projected', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })

    await expect(projectCrmEmailMessageToCommunication(
      { query },
      { clientId: CLIENT_ID, messageId: MESSAGE_ID },
      trustedDeps()
    )).resolves.toEqual({ status: 'unchanged' })
    expect(query).toHaveBeenCalledTimes(1)
  })
})
