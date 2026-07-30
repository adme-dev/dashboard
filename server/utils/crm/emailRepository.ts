import { transaction as defaultTransaction } from '~~/server/utils/db'
import { projectEmailDeliveryState } from '~~/server/utils/crm/emailContracts'
import type {
  CrmEmailDeliveryState,
  CrmEmailEnvelope
} from '~~/server/utils/crm/emailContracts'

export type CrmEmailActorType = 'team_member' | 'client_user' | 'system' | 'integration'

export interface CrmEmailActor {
  type: CrmEmailActorType
  id: string | null
}

export interface CrmConversationRecord {
  id: string
  clientId: string
  primaryChannel: string
  status: string
  subject: string | null
  personId: string | null
  companyId: string | null
  leadId: string | null
  opportunityId: string | null
  assignedTo: string | null
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CrmEmailMessageRecord {
  id: string
  clientId: string
  conversationId: string
  direction: CrmEmailEnvelope['direction']
  provider: string
  providerMessageId: string | null
  idempotencyKey: string
  internetMessageId: string | null
  inReplyTo: string | null
  threadingReferences: string[]
  fromAddress: string
  fromName: string | null
  toAddresses: CrmEmailEnvelope['to']
  ccAddresses: CrmEmailEnvelope['cc']
  bccAddresses: CrmEmailEnvelope['bcc']
  replyToAddress: string | null
  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  deliveryStatus: CrmEmailDeliveryState
  deliveryStatusAt: string
  failureCode: string | null
  failureReason: string | null
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export interface CreateCrmConversationInput {
  clientId: string
  subject: string | null
  personId: string | null
  companyId: string | null
  leadId: string | null
  opportunityId: string | null
  assignedTo: string | null
  actor: CrmEmailActor
}

export interface CreateCrmEmailMessageInput {
  clientId: string
  conversationId: string
  provider: string
  providerMessageId: string | null
  idempotencyKey: string
  deliveryStatus: CrmEmailDeliveryState
  actor: CrmEmailActor
  envelope: CrmEmailEnvelope
  replyToAddress?: string | null
}

export type CreateCrmEmailMessageResult = {
  status: 'created' | 'existing'
  message: CrmEmailMessageRecord
}

export type CrmEmailMessageEventType
  = | 'drafted'
    | 'queued'
    | 'sending'
    | 'sent'
    | 'delivered'
    | 'deferred'
    | 'bounced'
    | 'failed'
    | 'rejected'
    | 'complained'
    | 'cancelled'
    | 'received'
    | 'deduplicated'

export interface CrmEmailMessageEventRecord {
  id: string
  clientId: string
  messageId: string
  provider: string
  providerEventId: string | null
  eventType: CrmEmailMessageEventType
  deliveryStatus: CrmEmailDeliveryState | null
  occurredAt: string
  smtpCode: string | null
  reason: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AppendCrmEmailMessageEventInput {
  clientId: string
  messageId: string
  provider: string
  providerEventId: string | null
  eventType: CrmEmailMessageEventType
  deliveryStatus: CrmEmailDeliveryState | null
  occurredAt: string
  smtpCode: string | null
  reason: string | null
  metadata: Record<string, unknown>
}

export type AppendCrmEmailMessageEventResult
  = | {
    status: 'appended' | 'duplicate'
    event: CrmEmailMessageEventRecord
    message: CrmEmailMessageRecord
  }
  | {
    status: 'event_conflict'
    event: CrmEmailMessageEventRecord
    existingMessageId: string
  }
  | {
    status: 'not_found'
  }

interface QueryResult {
  rows: unknown[]
  rowCount?: number | null
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<QueryResult>
}

type TransactionRunner = <T>(
  callback: (database: TransactionClient) => Promise<T>
) => Promise<T>

interface ConversationRow {
  id: string
  client_id: string
  primary_channel: string
  status: string
  subject: string | null
  person_id: string | null
  company_id: string | null
  lead_id: string | null
  opportunity_id: string | null
  assigned_to: string | null
  last_message_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}

interface MessageRow {
  id: string
  client_id: string
  conversation_id: string
  direction: CrmEmailEnvelope['direction']
  provider: string
  provider_message_id: string | null
  idempotency_key: string
  internet_message_id: string | null
  in_reply_to: string | null
  threading_references: string[]
  from_address: string
  from_name: string | null
  to_addresses: CrmEmailEnvelope['to']
  cc_addresses: CrmEmailEnvelope['cc']
  bcc_addresses: CrmEmailEnvelope['bcc']
  reply_to_address: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  delivery_status: CrmEmailDeliveryState
  delivery_status_at: string | Date
  failure_code: string | null
  failure_reason: string | null
  occurred_at: string | Date
  created_at: string | Date
  updated_at: string | Date
}

interface MessageEventRow {
  id: string
  client_id: string
  message_id: string
  provider: string
  provider_event_id: string | null
  event_type: CrmEmailMessageEventType
  delivery_status: CrmEmailDeliveryState | null
  occurred_at: string | Date
  smtp_code: string | null
  reason: string | null
  sanitized_metadata: Record<string, unknown>
  created_at: string | Date
}

const CONVERSATION_COLUMNS = `
  id, client_id, primary_channel, status, subject, person_id, company_id,
  lead_id, opportunity_id, assigned_to, last_message_at, created_at, updated_at
`

const MESSAGE_COLUMNS = `
  id, client_id, conversation_id, direction, provider, provider_message_id,
  idempotency_key, internet_message_id, in_reply_to, threading_references,
  from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
  reply_to_address, subject, body_text, body_html, delivery_status,
  delivery_status_at, failure_code, failure_reason, occurred_at, created_at,
  updated_at
`

const MESSAGE_EVENT_COLUMNS = `
  id, client_id, message_id, provider, provider_event_id, event_type,
  delivery_status, occurred_at, smtp_code, reason, sanitized_metadata,
  created_at
`

const FAILURE_STATES: ReadonlySet<CrmEmailDeliveryState> = new Set([
  'bounced',
  'failed',
  'rejected',
  'complained',
  'cancelled'
])

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function toNullableIsoString(value: string | Date | null): string | null {
  return value === null ? null : toIsoString(value)
}

function mapConversation(row: ConversationRow): CrmConversationRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    primaryChannel: row.primary_channel,
    status: row.status,
    subject: row.subject,
    personId: row.person_id,
    companyId: row.company_id,
    leadId: row.lead_id,
    opportunityId: row.opportunity_id,
    assignedTo: row.assigned_to,
    lastMessageAt: toNullableIsoString(row.last_message_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  }
}

function mapMessage(row: MessageRow): CrmEmailMessageRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    conversationId: row.conversation_id,
    direction: row.direction,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    idempotencyKey: row.idempotency_key,
    internetMessageId: row.internet_message_id,
    inReplyTo: row.in_reply_to,
    threadingReferences: row.threading_references,
    fromAddress: row.from_address,
    fromName: row.from_name,
    toAddresses: row.to_addresses,
    ccAddresses: row.cc_addresses,
    bccAddresses: row.bcc_addresses,
    replyToAddress: row.reply_to_address,
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    deliveryStatus: row.delivery_status,
    deliveryStatusAt: toIsoString(row.delivery_status_at),
    failureCode: row.failure_code,
    failureReason: row.failure_reason,
    occurredAt: toIsoString(row.occurred_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  }
}

function mapMessageEvent(row: MessageEventRow): CrmEmailMessageEventRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    messageId: row.message_id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    deliveryStatus: row.delivery_status,
    occurredAt: toIsoString(row.occurred_at),
    smtpCode: row.smtp_code,
    reason: row.reason,
    metadata: row.sanitized_metadata,
    createdAt: toIsoString(row.created_at)
  }
}

function failureCodeForEvent(input: AppendCrmEmailMessageEventInput): string | null {
  if (input.deliveryStatus === 'complained') {
    return input.smtpCode ?? 'complaint'
  }

  if (input.deliveryStatus && FAILURE_STATES.has(input.deliveryStatus)) {
    return input.smtpCode ?? input.eventType
  }

  return null
}

export function createPostgresCrmEmailRepository(
  runTransaction: TransactionRunner = defaultTransaction as unknown as TransactionRunner
) {
  return {
    async createConversation(
      input: CreateCrmConversationInput
    ): Promise<CrmConversationRecord> {
      return runTransaction(async (database) => {
        const actorType = input.actor.id === null ? null : input.actor.type
        const result = await database.query(`
          INSERT INTO crm_conversations (
            client_id, primary_channel, status, subject, person_id, company_id,
            lead_id, opportunity_id, assigned_to, metadata, created_by_type,
            created_by_id
          )
          VALUES (
            $1, 'email', 'open', $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8, $9
          )
          RETURNING ${CONVERSATION_COLUMNS}
        `, [
          input.clientId,
          input.subject,
          input.personId,
          input.companyId,
          input.leadId,
          input.opportunityId,
          input.assignedTo,
          actorType,
          input.actor.id
        ])

        const row = result.rows[0] as ConversationRow | undefined
        if (!row) {
          throw new Error('Failed to create CRM conversation')
        }

        return mapConversation(row)
      })
    },

    async createMessage(
      input: CreateCrmEmailMessageInput
    ): Promise<CreateCrmEmailMessageResult> {
      return runTransaction(async (database) => {
        const existingResult = await database.query(`
          SELECT ${MESSAGE_COLUMNS}
          FROM crm_messages
          WHERE client_id = $1
            AND idempotency_key = $2
            AND deleted_at IS NULL
          LIMIT 1
        `, [input.clientId, input.idempotencyKey])
        const existing = existingResult.rows[0] as MessageRow | undefined

        if (existing) {
          return { status: 'existing', message: mapMessage(existing) }
        }

        const { envelope } = input
        const insertResult = await database.query(`
          INSERT INTO crm_messages (
            client_id, conversation_id, channel, direction, provider,
            provider_message_id, idempotency_key, internet_message_id,
            in_reply_to, threading_references, from_address, from_name,
            to_addresses, cc_addresses, bcc_addresses, reply_to_address,
            subject, body_text, body_html, delivery_status, delivery_status_at,
            provider_metadata, occurred_at, delivered_at, created_by_type,
            created_by_id
          )
          VALUES (
            $1, $2, 'email', $3, $4, $5, $6, $7, $8, $9::text[], $10, $11,
            $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17, $18, $19,
            $20::timestamptz, '{}'::jsonb, $21::timestamptz,
            CASE WHEN $19 = 'delivered' THEN $21::timestamptz ELSE NULL END,
            $22, $23
          )
          ON CONFLICT DO NOTHING
          RETURNING ${MESSAGE_COLUMNS}
        `, [
          input.clientId,
          input.conversationId,
          envelope.direction,
          input.provider,
          input.providerMessageId,
          input.idempotencyKey,
          envelope.internetMessageId,
          envelope.inReplyTo,
          envelope.references,
          envelope.from.address,
          envelope.from.name ?? null,
          JSON.stringify(envelope.to),
          JSON.stringify(envelope.cc),
          JSON.stringify(envelope.bcc),
          input.replyToAddress ?? null,
          envelope.subject,
          envelope.text,
          envelope.html,
          input.deliveryStatus,
          envelope.occurredAt,
          envelope.occurredAt,
          input.actor.type,
          input.actor.id
        ])
        const inserted = insertResult.rows[0] as MessageRow | undefined

        if (inserted) {
          const conversationResult = await database.query(`
            UPDATE crm_conversations
            SET
              last_message_at = GREATEST(
                COALESCE(last_message_at, $3::timestamptz),
                $3::timestamptz
              ),
              updated_at = NOW()
            WHERE client_id = $1
              AND id = $2
              AND deleted_at IS NULL
          `, [input.clientId, input.conversationId, envelope.occurredAt])

          if (conversationResult.rowCount !== 1) {
            throw new Error('CRM conversation was not found for this tenant')
          }

          return { status: 'created', message: mapMessage(inserted) }
        }

        const recoveryResult = await database.query(`
          SELECT ${MESSAGE_COLUMNS}
          FROM crm_messages
          WHERE client_id = $1
            AND deleted_at IS NULL
            AND (
              idempotency_key = $2
              OR (provider = $3 AND provider_message_id = $4 AND $4 IS NOT NULL)
              OR (internet_message_id = $5 AND $5 IS NOT NULL)
            )
          ORDER BY CASE WHEN idempotency_key = $2 THEN 0 ELSE 1 END
          LIMIT 1
        `, [
          input.clientId,
          input.idempotencyKey,
          input.provider,
          input.providerMessageId,
          envelope.internetMessageId
        ])
        const recovered = recoveryResult.rows[0] as MessageRow | undefined

        if (!recovered) {
          throw new Error('Failed to create or recover CRM email message')
        }

        return { status: 'existing', message: mapMessage(recovered) }
      })
    },

    async appendMessageEvent(
      input: AppendCrmEmailMessageEventInput
    ): Promise<AppendCrmEmailMessageEventResult> {
      return runTransaction(async (database) => {
        const existingResult = await database.query(`
          SELECT ${MESSAGE_EVENT_COLUMNS}
          FROM crm_message_events
          WHERE client_id = $1
            AND provider = $2
            AND provider_event_id = $3
            AND $3 IS NOT NULL
          LIMIT 1
        `, [input.clientId, input.provider, input.providerEventId])
        const existingEvent = existingResult.rows[0] as MessageEventRow | undefined

        if (existingEvent) {
          const event = mapMessageEvent(existingEvent)
          if (existingEvent.message_id !== input.messageId) {
            return {
              status: 'event_conflict',
              event,
              existingMessageId: existingEvent.message_id
            }
          }

          const duplicateMessageResult = await database.query(`
            SELECT ${MESSAGE_COLUMNS}
            FROM crm_messages
            WHERE client_id = $1
              AND id = $2
              AND deleted_at IS NULL
            LIMIT 1
          `, [input.clientId, input.messageId])
          const duplicateMessage = duplicateMessageResult.rows[0] as MessageRow | undefined

          if (!duplicateMessage) {
            return { status: 'not_found' }
          }

          return {
            status: 'duplicate',
            event,
            message: mapMessage(duplicateMessage)
          }
        }

        const lockedMessageResult = await database.query(`
          SELECT ${MESSAGE_COLUMNS}
          FROM crm_messages
          WHERE client_id = $1
            AND id = $2
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `, [input.clientId, input.messageId])
        const lockedMessage = lockedMessageResult.rows[0] as MessageRow | undefined

        if (!lockedMessage) {
          return { status: 'not_found' }
        }

        const insertResult = await database.query(`
          INSERT INTO crm_message_events (
            client_id, message_id, provider, provider_event_id, event_type,
            delivery_status, occurred_at, smtp_code, reason,
            sanitized_metadata
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10::jsonb
          )
          ON CONFLICT DO NOTHING
          RETURNING ${MESSAGE_EVENT_COLUMNS}
        `, [
          input.clientId,
          input.messageId,
          input.provider,
          input.providerEventId,
          input.eventType,
          input.deliveryStatus,
          input.occurredAt,
          input.smtpCode,
          input.reason,
          JSON.stringify(input.metadata)
        ])
        const insertedEvent = insertResult.rows[0] as MessageEventRow | undefined

        if (!insertedEvent) {
          const recoveryResult = await database.query(`
            SELECT ${MESSAGE_EVENT_COLUMNS}
            FROM crm_message_events
            WHERE client_id = $1
              AND provider = $2
              AND provider_event_id = $3
              AND $3 IS NOT NULL
            LIMIT 1
          `, [input.clientId, input.provider, input.providerEventId])
          const recoveredEvent = recoveryResult.rows[0] as MessageEventRow | undefined

          if (!recoveredEvent) {
            throw new Error('Failed to append or recover CRM email message event')
          }

          const event = mapMessageEvent(recoveredEvent)
          if (recoveredEvent.message_id !== input.messageId) {
            return {
              status: 'event_conflict',
              event,
              existingMessageId: recoveredEvent.message_id
            }
          }

          return {
            status: 'duplicate',
            event,
            message: mapMessage(lockedMessage)
          }
        }

        let canonicalMessage = lockedMessage
        if (input.deliveryStatus) {
          const projection = projectEmailDeliveryState(
            lockedMessage.delivery_status,
            input.deliveryStatus
          )

          if (projection.changed) {
            const failureCode = failureCodeForEvent(input)
            const updateResult = await database.query(`
              UPDATE crm_messages
              SET
                delivery_status = $3,
                delivery_status_at = $4::timestamptz,
                failure_code = $5,
                failure_reason = $6,
                delivered_at = CASE
                  WHEN $3 = 'delivered' THEN $4::timestamptz
                  ELSE delivered_at
                END,
                updated_at = NOW()
              WHERE client_id = $1
                AND id = $2
                AND deleted_at IS NULL
              RETURNING ${MESSAGE_COLUMNS}
            `, [
              input.clientId,
              input.messageId,
              projection.state,
              input.occurredAt,
              failureCode,
              FAILURE_STATES.has(projection.state) ? input.reason : null
            ])
            const updatedMessage = updateResult.rows[0] as MessageRow | undefined

            if (!updatedMessage) {
              throw new Error('Failed to project CRM email delivery state')
            }

            canonicalMessage = updatedMessage
          }
        }

        return {
          status: 'appended',
          event: mapMessageEvent(insertedEvent),
          message: mapMessage(canonicalMessage)
        }
      })
    }
  }
}
