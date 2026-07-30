import type { CrmEmailDirection } from '~~/server/utils/crm/emailContracts'

export interface CrmEmailProjectionQueryResult {
  rows: unknown[]
  rowCount?: number | null
}

export interface CrmEmailProjectionDatabase {
  query(
    sql: string,
    params?: unknown[]
  ): Promise<CrmEmailProjectionQueryResult>
}

export interface ProjectCrmEmailMessageInput {
  clientId: string
  messageId: string
}

export interface CrmEmailCommunicationRecord {
  id: string
  clientId: string
  personId: string | null
  companyId: string | null
  channel: 'email'
  direction: CrmEmailDirection
  subject: string | null
  body: string | null
  occurredAt: string
  externalId: string
  source: 'email_bridge'
  metadata: Record<string, unknown>
  createdAt: string
}

export type ProjectCrmEmailMessageResult
  = | {
    status: 'projected'
    communication: CrmEmailCommunicationRecord
  }
  | {
    status: 'unchanged'
  }

interface CommunicationRow {
  id: string
  client_id: string
  person_id: string | null
  company_id: string | null
  channel: 'email'
  direction: CrmEmailDirection
  subject: string | null
  body: string | null
  occurred_at: string | Date
  external_id: string
  source: 'email_bridge'
  metadata: Record<string, unknown>
  created_at: string | Date
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function mapCommunication(row: CommunicationRow): CrmEmailCommunicationRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    personId: row.person_id,
    companyId: row.company_id,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    body: row.body,
    occurredAt: toIsoString(row.occurred_at),
    externalId: row.external_id,
    source: row.source,
    metadata: row.metadata,
    createdAt: toIsoString(row.created_at)
  }
}

export async function projectCrmEmailMessageToCommunication(
  database: CrmEmailProjectionDatabase,
  input: ProjectCrmEmailMessageInput
): Promise<ProjectCrmEmailMessageResult> {
  const result = await database.query(`
    INSERT INTO crm_communications (
      client_id, person_id, company_id, channel, direction, subject, body,
      occurred_at, external_id, source, metadata, created_by
    )
    SELECT
      message.client_id,
      conversation.person_id,
      conversation.company_id,
      'email',
      message.direction,
      message.subject,
      message.body_text,
      message.occurred_at,
      'crm_message:' || message.id::text,
      'email_bridge',
      jsonb_build_object(
        'canonical_type', 'crm_message',
        'crm_message_id', message.id,
        'conversation_id', message.conversation_id
      ),
      CASE
        WHEN message.created_by_type = 'team_member'
          AND message.created_by_id ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          THEN message.created_by_id::uuid
        ELSE NULL
      END
    FROM crm_messages AS message
    JOIN crm_conversations AS conversation
      ON conversation.client_id = message.client_id
      AND conversation.id = message.conversation_id
      AND conversation.deleted_at IS NULL
    WHERE message.client_id = $1
      AND conversation.client_id = $1
      AND message.id = $2
      AND message.deleted_at IS NULL
      AND (
        conversation.person_id IS NOT NULL
        OR conversation.company_id IS NOT NULL
      )
    ON CONFLICT (client_id, source, external_id)
      WHERE external_id IS NOT NULL
      DO NOTHING
    RETURNING
      id, client_id, person_id, company_id, channel, direction, subject, body,
      occurred_at, external_id, source, metadata, created_at
  `, [input.clientId, input.messageId])
  const row = result.rows[0] as CommunicationRow | undefined

  if (!row) {
    return { status: 'unchanged' }
  }

  return {
    status: 'projected',
    communication: mapCommunication(row)
  }
}
