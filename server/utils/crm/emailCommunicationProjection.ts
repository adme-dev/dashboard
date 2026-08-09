import type { CrmEmailDirection } from '~~/server/utils/crm/emailContracts'
import {
  requireAllCrmRecordsAccess,
  type AuthoritativeCrmRecord,
  type CrmRecordRef,
  type TransactionClient
} from '~~/server/utils/crm/recordAccess'
import {
  resolveTrustedCrmSystemContext,
  type CrmRecordAccessContext
} from '~~/server/utils/crm/searchContext'

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

interface ProjectionDependencies {
  resolveContext(input: { clientId: string; purpose: 'crm_email_projection' }): Promise<CrmRecordAccessContext>
  authorizeAll(
    context: CrmRecordAccessContext,
    refs: readonly CrmRecordRef[],
    client?: TransactionClient
  ): Promise<readonly AuthoritativeCrmRecord[]>
}

const defaultProjectionDependencies: ProjectionDependencies = {
  resolveContext: resolveTrustedCrmSystemContext,
  authorizeAll: requireAllCrmRecordsAccess
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
  input: ProjectCrmEmailMessageInput,
  deps: ProjectionDependencies = defaultProjectionDependencies
): Promise<ProjectCrmEmailMessageResult> {
  const messageResult = await database.query(`
    SELECT message.client_id::text AS client_id,
           message.conversation_id::text AS conversation_id
      FROM crm_messages AS message
     WHERE message.id = $1
       AND message.deleted_at IS NULL
     FOR UPDATE OF message
  `, [input.messageId])
  const message = messageResult.rows[0] as { client_id: string, conversation_id: string } | undefined
  if (!message) return { status: 'unchanged' }

  const context = await deps.resolveContext({
    clientId: message.client_id,
    purpose: 'crm_email_projection'
  })
  const linkedResult = await database.query(`
    SELECT conversation.person_id::text AS person_id,
           conversation.company_id::text AS company_id
      FROM crm_conversations AS conversation
     WHERE conversation.client_id = $1
       AND conversation.id = $2
       AND conversation.deleted_at IS NULL
       AND (conversation.person_id IS NOT NULL OR conversation.company_id IS NOT NULL)
     FOR UPDATE OF conversation
  `, [message.client_id, message.conversation_id])
  const linked = linkedResult.rows[0] as { person_id: string | null, company_id: string | null } | undefined
  if (!linked) return { status: 'unchanged' }
  const refs: CrmRecordRef[] = []
  if (linked.person_id) refs.push({ type: 'person', id: linked.person_id })
  if (linked.company_id) refs.push({ type: 'company', id: linked.company_id })
  const authorized = await deps.authorizeAll(context, refs, database)
  if (authorized.length !== refs.length) {
    throw new Error('CRM email projection authorization was incomplete')
  }

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
  `, [message.client_id, input.messageId])
  const row = result.rows[0] as CommunicationRow | undefined

  if (!row) {
    return { status: 'unchanged' }
  }

  return {
    status: 'projected',
    communication: mapCommunication(row)
  }
}
