import { describe, expect, it, vi } from 'vitest'
import {
  createCrmInboundEmailProcessor
} from '../../../../server/utils/crm/emailInboundProcessor'
import type {
  CrmEmailInboundProcessingRequest
} from '../../../../server/utils/crm/emailInboundProcessingContracts'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ROUTE_ID = '22222222-2222-4222-8222-222222222222'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444'
const LEAD_ID = '55555555-5555-4555-8555-555555555555'
const PERSON_ID = '66666666-6666-4666-8666-666666666666'
const OPPORTUNITY_ID = '77777777-7777-4777-8777-777777777777'
const ASSIGNED_TO = '88888888-8888-4888-8888-888888888888'
const R2_PREFIX
  = 'crm-email/inbound/2026/07/30/99999999-9999-4999-8999-999999999999'

function input(
  overrides: {
    routeKind?: 'lead_inbox' | 'conversation_reply'
    conversationId?: string | null
    fromName?: string | null
  } = {}
): CrmEmailInboundProcessingRequest {
  const routeKind = overrides.routeKind ?? 'lead_inbox'
  const conversationId = overrides.conversationId
    ?? (routeKind === 'conversation_reply' ? CONVERSATION_ID : null)
  return {
    job: {
      version: 1,
      type: 'crm.email.inbound',
      idempotencyKey: `crm-inbound:${'a'.repeat(64)}`,
      routeId: ROUTE_ID,
      clientId: CLIENT_ID,
      conversationId,
      routeKind,
      provider: 'cloudflare_email',
      providerMessageId: '<provider-message@example.net>',
      rawMimeR2Key: `${R2_PREFIX}/message.eml`,
      rawMimeSha256: 'b'.repeat(64),
      rawMimeExpiresAt: '2026-08-29T05:30:00.000Z',
      attachments: [{
        r2ObjectKey: `${R2_PREFIX}/attachments/01.bin`,
        filename: 'details.pdf',
        contentType: 'application/pdf',
        byteSize: 1024,
        sha256: 'c'.repeat(64),
        contentId: null
      }],
      receivedAt: '2026-07-30T05:30:00.000Z'
    },
    email: {
      from: {
        address: 'customer@example.com',
        name: overrides.fromName === undefined
          ? 'Customer Name'
          : overrides.fromName
      },
      to: [{
        address: 'lead+opaque@mail.xeroflow.io',
        name: null
      }],
      cc: [],
      replyTo: [],
      subject: 'Vehicle enquiry',
      text: 'Please contact me.',
      internetMessageId: '<provider-message@example.net>',
      inReplyTo: null,
      references: []
    }
  }
}

function messageRecord(conversationId = CONVERSATION_ID) {
  return {
    id: MESSAGE_ID,
    clientId: CLIENT_ID,
    conversationId
  }
}

function createHarness(options: {
  existingMessage?: boolean
  routeAvailable?: boolean
  intakeStatus?: 'created' | 'duplicate'
  promotion?: Record<string, unknown>
  promotionError?: Error
  messageStatus?: 'created' | 'existing'
  onStage?: (stage: string) => void
} = {}) {
  const statements: Array<{ sql: string, params: unknown[] }> = []
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params })
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}] }
      if (/FROM crm_messages/.test(sql)) {
        return {
          rows: options.existingMessage ? [{ id: MESSAGE_ID }] : []
        }
      }
      if (/FROM crm_email_routes/.test(sql)) {
        return {
          rows: options.routeAvailable === false
            ? []
            : [{
                id: ROUTE_ID,
                client_id: CLIENT_ID,
                conversation_id: params[3] as string | null,
                route_kind: params[2] as string
              }]
        }
      }
      if (/FROM client_team_assignments/.test(sql)) {
        return { rows: [{ team_member_id: ASSIGNED_TO }] }
      }
      if (/FROM leads/.test(sql)) return { rows: [{ id: LEAD_ID }] }
      if (/UPDATE crm_email_routes/.test(sql)) {
        return { rows: [], rowCount: 1 }
      }
      return { rows: [] }
    })
  }
  const repository = {
    createConversation: vi.fn().mockResolvedValue({
      id: CONVERSATION_ID,
      clientId: CLIENT_ID
    }),
    createMessage: vi.fn().mockResolvedValue({
      status: options.messageStatus ?? 'created',
      message: messageRecord()
    }),
    appendMessageEvent: vi.fn().mockResolvedValue({ status: 'appended' })
  }
  const ingestLead = vi.fn().mockResolvedValue(
    options.intakeStatus === 'duplicate'
      ? { status: 'duplicate' }
      : {
          status: 'created',
          leadId: LEAD_ID,
          outbox: { status: 'profile_not_found' }
        }
  )
  const promoteLead = options.promotionError
    ? vi.fn().mockRejectedValue(options.promotionError)
    : vi.fn().mockResolvedValue(
        options.promotion ?? {
          status: 'promoted',
          personId: PERSON_ID,
          opportunityId: OPPORTUNITY_ID,
          linkId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          personCreated: true
        }
      )
  const processor = createCrmInboundEmailProcessor({
    transaction: async callback => callback(db),
    repositoryFor: () => repository as never,
    ingestLead: ingestLead as never,
    promoteLead: promoteLead as never,
    onStage: options.onStage
  })

  return {
    processor,
    repository,
    ingestLead,
    promoteLead,
    statements
  }
}

describe('CRM inbound email processor', () => {
  it('reports the safe processor stage before a promotion failure', async () => {
    const stages: string[] = []
    const harness = createHarness({
      promotionError: new Error('sensitive promotion detail'),
      onStage: stage => stages.push(stage)
    })

    await expect(harness.processor.process(input())).rejects.toThrow(
      'sensitive promotion detail'
    )

    expect(stages.at(-1)).toBe('promote_lead')
  })

  it('returns an existing message before route or conversation mutation', async () => {
    const harness = createHarness({ existingMessage: true })

    await expect(harness.processor.process(input())).resolves.toEqual({
      status: 'duplicate'
    })

    expect(harness.repository.createConversation).not.toHaveBeenCalled()
    expect(harness.repository.createMessage).not.toHaveBeenCalled()
    expect(harness.statements.some(statement =>
      /FROM crm_email_routes/.test(statement.sql)
    )).toBe(false)
  })

  it('rejects a route that is revoked, expired, inactive, or cross-tenant', async () => {
    const harness = createHarness({ routeAvailable: false })

    await expect(harness.processor.process(input())).resolves.toEqual({
      status: 'route_unavailable'
    })

    const routeLookup = harness.statements.find(statement =>
      /FROM crm_email_routes/.test(statement.sql)
    )
    expect(routeLookup?.sql).toMatch(/client_id = \$2/)
    expect(routeLookup?.sql).toMatch(/is_active = TRUE/)
    expect(routeLookup?.sql).toMatch(/revoked_at IS NULL/)
    expect(routeLookup?.sql).toMatch(/expires_at > NOW\(\)/)
    expect(routeLookup?.sql).toMatch(/conversation_id IS NOT DISTINCT FROM \$4/)
    expect(routeLookup?.params).toEqual([
      ROUTE_ID,
      CLIENT_ID,
      'lead_inbox',
      null
    ])
    expect(harness.repository.createConversation).not.toHaveBeenCalled()
  })

  it('appends a reply to its pre-resolved conversation without creating a lead', async () => {
    const harness = createHarness()
    const reply = input({ routeKind: 'conversation_reply' })
    await harness.processor.process(reply)

    expect(harness.ingestLead).not.toHaveBeenCalled()
    expect(harness.promoteLead).not.toHaveBeenCalled()
    expect(harness.repository.createConversation).not.toHaveBeenCalled()
    expect(harness.repository.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: CLIENT_ID,
        conversationId: CONVERSATION_ID,
        actor: {
          type: 'integration',
          id: 'cloudflare_email'
        },
        rawMimeR2Key: `${R2_PREFIX}/message.eml`,
        rawMimeExpiresAt: '2026-08-29T05:30:00.000Z',
        attachments: reply.job.attachments,
        envelope: expect.objectContaining({
          direction: 'inbound',
          html: null,
          text: 'Please contact me.'
        })
      })
    )
  })

  it('creates an email lead with unknown consent and reuses CRM promotion links', async () => {
    const harness = createHarness()
    const request = input()

    await expect(harness.processor.process(request)).resolves.toEqual({
      status: 'created'
    })

    expect(harness.ingestLead).toHaveBeenCalledWith(
      expect.anything(),
      {
        lead: {
          client_id: CLIENT_ID,
          source: 'email',
          source_lead_id: request.job.idempotencyKey,
          form_id: ROUTE_ID,
          form_name: 'Inbound email',
          ad_id: null,
          ad_name: null,
          campaign_id: null,
          campaign_name: null,
          page_id: null,
          submitted_at: request.job.receivedAt,
          field_data: {
            full_name: 'Customer Name',
            email: 'customer@example.com',
            lead_provider: 'email',
            message_subject: 'Vehicle enquiry'
          },
          attribution: null,
          assigned_to: ASSIGNED_TO,
          created_by: null,
          is_test: false
        },
        consentDecision: 'unknown'
      }
    )
    expect(JSON.stringify(harness.ingestLead.mock.calls)).not.toContain(
      'Please contact me.'
    )
    expect(harness.promoteLead).toHaveBeenCalledWith(
      expect.anything(),
      LEAD_ID
    )
    expect(harness.repository.createConversation).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      subject: 'Vehicle enquiry',
      personId: PERSON_ID,
      companyId: null,
      leadId: LEAD_ID,
      opportunityId: OPPORTUNITY_ID,
      assignedTo: ASSIGNED_TO,
      actor: {
        type: 'integration',
        id: 'cloudflare_email'
      }
    })
    expect(harness.repository.appendMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: CLIENT_ID,
        messageId: MESSAGE_ID,
        providerEventId: `${request.job.idempotencyKey}:received`,
        eventType: 'received',
        deliveryStatus: null,
        metadata: {}
      })
    )
    const routeUpdate = harness.statements.find(statement =>
      /UPDATE crm_email_routes/.test(statement.sql)
    )
    expect(routeUpdate?.sql).toMatch(/GREATEST/)
    expect(routeUpdate?.params).toEqual([
      ROUTE_ID,
      CLIENT_ID,
      request.job.receivedAt
    ])
  })

  it.each([
    [{ status: 'identity_conflict', candidateCount: 2 }, 'Customer Name'],
    [{ status: 'insufficient_identity', missing: ['name'] }, null]
  ])(
    'keeps an unsafe or incomplete identity lead-only',
    async (promotion, fromName) => {
      const harness = createHarness({ promotion })

      await harness.processor.process(input({ fromName }))

      expect(harness.repository.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          personId: null,
          opportunityId: null,
          leadId: LEAD_ID
        })
      )
    }
  )

  it('rolls back a newly-created conversation when message uniqueness recovers another message', async () => {
    const harness = createHarness({ messageStatus: 'existing' })

    await expect(harness.processor.process(input())).rejects.toThrow(
      'Concurrent CRM email duplicate must be retried'
    )
    expect(harness.repository.appendMessageEvent).not.toHaveBeenCalled()
  })
})
