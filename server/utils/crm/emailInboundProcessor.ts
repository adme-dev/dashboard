import { transaction as defaultTransaction } from '~~/server/utils/db'
import {
  createPostgresCrmEmailRepository
} from '~~/server/utils/crm/emailRepository'
import {
  createLeadIntakeService
} from '~~/server/utils/leads/intake'
import {
  insertLeadWithDedup
} from '~~/server/utils/leads/db'
import {
  createCrmLeadPromotionService
} from '~~/server/utils/leads/crmPromotion'
import {
  appendCanonicalConversionEvent
} from '~~/server/utils/measurement/outbox'
import type {
  CrmEmailInboundProcessingRequest
} from '~~/server/utils/crm/emailInboundProcessingContracts'
import type {
  IngestLeadInput,
  IngestLeadResult,
  LeadIntakeStage
} from '~~/server/utils/leads/intake'
import type {
  CrmLeadPromotionResult
} from '~~/server/utils/leads/crmPromotion'
import {
  requireAllCrmRecordsAccess,
  type AuthoritativeCrmRecord,
  type CrmRecordRef,
  type TransactionClient as CrmAccessTransactionClient
} from '~~/server/utils/crm/recordAccess'
import {
  resolveTrustedCrmSystemContext,
  type CrmRecordAccessContext
} from '~~/server/utils/crm/searchContext'

interface QueryResult {
  rows: unknown[]
  rowCount?: number | null
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<QueryResult>
}

type Transaction = <T>(
  callback: (database: TransactionClient) => Promise<T>
) => Promise<T>

type CrmEmailRepository = ReturnType<typeof createPostgresCrmEmailRepository>

export type CrmInboundEmailProcessorStage
  = | 'acquire_locks'
    | 'deduplicate_message'
    | 'validate_route'
    | 'resolve_assignment'
    | 'ingest_lead'
    | `ingest_lead_${LeadIntakeStage}`
    | 'recover_lead'
    | 'promote_lead'
    | 'create_conversation'
    | 'create_message'
    | 'append_received_event'
    | 'mark_route_used'

interface CrmInboundEmailProcessorDeps {
  transaction: Transaction
  repositoryFor(database: TransactionClient): CrmEmailRepository
  ingestLead(
    database: TransactionClient,
    input: IngestLeadInput
  ): Promise<IngestLeadResult>
  promoteLead(
    database: TransactionClient,
    leadId: string
  ): Promise<CrmLeadPromotionResult>
  resolveContext(input: { clientId: string; purpose: 'crm_email_inbound' }): Promise<CrmRecordAccessContext>
  authorizeAll(
    context: CrmRecordAccessContext,
    refs: readonly CrmRecordRef[],
    client?: CrmAccessTransactionClient
  ): Promise<readonly AuthoritativeCrmRecord[]>
  onStage?(stage: CrmInboundEmailProcessorStage): void
}

export type ProcessCrmInboundEmailResult
  = { status: 'created' | 'duplicate' | 'route_unavailable' }

interface ExistingMessageRow {
  id: string
}

interface RouteRow {
  id: string
  person_id: string | null
  company_id: string | null
  opportunity_id: string | null
}

interface LeadRow {
  id: string
}

interface AssignmentRow {
  team_member_id: string
}

function defaultRepositoryFor(
  database: TransactionClient
): CrmEmailRepository {
  return createPostgresCrmEmailRepository(
    async callback => callback(database)
  )
}

async function defaultIngestLead(
  database: TransactionClient,
  input: IngestLeadInput,
  onStage?: (stage: LeadIntakeStage) => void
): Promise<IngestLeadResult> {
  const service = createLeadIntakeService({
    transaction: async callback => callback(database),
    insertLead: (lead, transactionDatabase) =>
      insertLeadWithDedup(lead, transactionDatabase),
    appendOutbox: appendCanonicalConversionEvent,
    onStage
  })
  return service.ingest(input)
}

async function defaultPromoteLead(
  database: TransactionClient,
  leadId: string
): Promise<CrmLeadPromotionResult> {
  const service = createCrmLeadPromotionService({
    transaction: async callback => callback(database)
  })
  return service.promote(leadId)
}

const defaultDependencies: CrmInboundEmailProcessorDeps = {
  transaction: defaultTransaction as unknown as Transaction,
  repositoryFor: defaultRepositoryFor,
  ingestLead: defaultIngestLead,
  promoteLead: defaultPromoteLead,
  resolveContext: resolveTrustedCrmSystemContext,
  authorizeAll: requireAllCrmRecordsAccess
}

const INBOUND_EMAIL_ACTOR = {
  type: 'integration' as const,
  id: 'cloudflare_email'
}

function promotionLinks(result: CrmLeadPromotionResult): {
  personId: string | null
  opportunityId: string | null
} {
  if (result.status === 'promoted') {
    return {
      personId: result.personId,
      opportunityId: result.opportunityId
    }
  }
  if (result.status === 'already_promoted') {
    return {
      personId: result.personId,
      opportunityId: result.opportunityId
    }
  }
  return { personId: null, opportunityId: null }
}

function leadFieldData(
  input: CrmEmailInboundProcessingRequest
): Record<string, string> {
  const fields: Record<string, string> = {
    email: input.email.from.address,
    lead_provider: 'email'
  }
  if (input.email.from.name) fields.full_name = input.email.from.name
  if (input.email.subject) fields.message_subject = input.email.subject
  return fields
}

export function createCrmInboundEmailProcessor(
  overrides: Partial<CrmInboundEmailProcessorDeps> = {}
) {
  const usesDefaultIngestLead = !overrides.ingestLead
  const deps: CrmInboundEmailProcessorDeps = {
    ...defaultDependencies,
    ...overrides
  }
  return {
    async process(
      input: CrmEmailInboundProcessingRequest
    ): Promise<ProcessCrmInboundEmailResult> {
      return deps.transaction(async (database) => {
        const { job, email } = input
        const context = await deps.resolveContext({
          clientId: job.clientId,
          purpose: 'crm_email_inbound'
        })
        deps.onStage?.('acquire_locks')
        for (const lockKey of [
          job.idempotencyKey,
          `${job.clientId}\n${job.provider}\n${job.providerMessageId}`
        ]) {
          await database.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [lockKey]
          )
        }

        deps.onStage?.('deduplicate_message')
        const existingResult = await database.query(`
          SELECT id
          FROM crm_messages
          WHERE client_id = $1
            AND deleted_at IS NULL
            AND (
              idempotency_key = $2
              OR (provider = $3 AND provider_message_id = $4)
              OR (internet_message_id = $5 AND $5 IS NOT NULL)
            )
          LIMIT 1
        `, [
          job.clientId,
          job.idempotencyKey,
          job.provider,
          job.providerMessageId,
          email.internetMessageId
        ])
        const existing
          = existingResult.rows?.[0] as ExistingMessageRow | undefined
        if (existing) return { status: 'duplicate' }

        deps.onStage?.('validate_route')
        const routeResult = await database.query(`
          SELECT route.id, conversation.person_id, conversation.company_id,
                 conversation.opportunity_id
          FROM crm_email_routes AS route
          LEFT JOIN crm_conversations AS conversation
            ON conversation.client_id = route.client_id
           AND conversation.id = route.conversation_id
           AND conversation.deleted_at IS NULL
          WHERE route.id = $1
            AND route.client_id = $2
            AND route.route_kind = $3
            AND route.conversation_id IS NOT DISTINCT FROM $4
            AND route.is_active = TRUE
            AND route.revoked_at IS NULL
            AND (route.expires_at IS NULL OR route.expires_at > NOW())
            AND (
              route.route_kind = 'lead_inbox'
              OR conversation.id IS NOT NULL
            )
          LIMIT 1
          FOR UPDATE OF route
        `, [
          job.routeId,
          job.clientId,
          job.routeKind,
          job.conversationId
        ])
        const route = routeResult.rows?.[0] as RouteRow | undefined
        if (!route) return { status: 'route_unavailable' }
        const protectedRefs: CrmRecordRef[] = []
        if (route.person_id) protectedRefs.push({ type: 'person', id: route.person_id })
        if (route.company_id) protectedRefs.push({ type: 'company', id: route.company_id })
        if (route.opportunity_id) protectedRefs.push({ type: 'opportunity', id: route.opportunity_id })
        const authorized = await deps.authorizeAll(context, protectedRefs, database)
        if (authorized.length !== protectedRefs.length) {
          throw new Error('CRM email route authorization was incomplete')
        }

        const repository = deps.repositoryFor(database)
        let conversationId = job.conversationId

        if (job.routeKind === 'lead_inbox') {
          deps.onStage?.('resolve_assignment')
          const assignmentResult = await database.query(`
            SELECT team_member_id
            FROM client_team_assignments
            WHERE client_id = $1
              AND role = 'primary_am'
            ORDER BY assigned_at DESC
            LIMIT 1
          `, [job.clientId])
          const assignedTo = (
            assignmentResult.rows?.[0] as AssignmentRow | undefined
          )?.team_member_id ?? null

          deps.onStage?.('ingest_lead')
          const leadInput: IngestLeadInput = {
            lead: {
              client_id: job.clientId,
              source: 'email',
              source_lead_id: job.idempotencyKey,
              form_id: job.routeId,
              form_name: 'Inbound email',
              ad_id: null,
              ad_name: null,
              campaign_id: null,
              campaign_name: null,
              page_id: null,
              submitted_at: job.receivedAt,
              field_data: leadFieldData(input),
              attribution: null,
              assigned_to: assignedTo,
              created_by: null,
              is_test: false
            },
            consentDecision: 'unknown'
          }
          const intake = usesDefaultIngestLead
            ? await defaultIngestLead(
                database,
                leadInput,
                stage => deps.onStage?.(`ingest_lead_${stage}`)
              )
            : await deps.ingestLead(database, leadInput)

          let leadId: string
          if (intake.status === 'created') {
            leadId = intake.leadId
          } else {
            deps.onStage?.('recover_lead')
            const leadResult = await database.query(`
              SELECT id
              FROM leads
              WHERE client_id = $1
                AND source = 'email'
                AND source_lead_id = $2
                AND deleted_at IS NULL
              LIMIT 1
              FOR UPDATE
            `, [job.clientId, job.idempotencyKey])
            const recoveredLeadId
              = (leadResult.rows?.[0] as LeadRow | undefined)?.id
            if (!recoveredLeadId) {
              throw new Error('CRM email lead duplicate could not be recovered')
            }
            leadId = recoveredLeadId
          }

          deps.onStage?.('promote_lead')
          const promotion = await deps.promoteLead(database, leadId)
          const links = promotionLinks(promotion)
          deps.onStage?.('create_conversation')
          const conversation = await repository.createConversation({
            clientId: job.clientId,
            subject: email.subject,
            personId: links.personId,
            companyId: null,
            leadId,
            opportunityId: links.opportunityId,
            assignedTo,
            actor: INBOUND_EMAIL_ACTOR
          })
          conversationId = conversation.id
        }

        if (!conversationId) {
          throw new Error('CRM email conversation was not resolved')
        }

        deps.onStage?.('create_message')
        const messageResult = await repository.createMessage({
          clientId: job.clientId,
          conversationId,
          provider: job.provider,
          providerMessageId: job.providerMessageId,
          idempotencyKey: job.idempotencyKey,
          deliveryStatus: 'delivered',
          actor: INBOUND_EMAIL_ACTOR,
          envelope: {
            direction: 'inbound',
            from: email.from,
            to: email.to,
            cc: email.cc,
            bcc: [],
            subject: email.subject,
            text: email.text,
            html: null,
            internetMessageId: email.internetMessageId,
            inReplyTo: email.inReplyTo,
            references: email.references,
            occurredAt: job.receivedAt
          },
          replyToAddress: email.replyTo[0]?.address ?? email.from.address,
          rawMimeR2Key: job.rawMimeR2Key,
          rawMimeExpiresAt: job.rawMimeExpiresAt,
          attachments: job.attachments
        })
        if (messageResult.status === 'existing') {
          throw new Error('Concurrent CRM email duplicate must be retried')
        }

        deps.onStage?.('append_received_event')
        const eventResult = await repository.appendMessageEvent({
          clientId: job.clientId,
          messageId: messageResult.message.id,
          provider: job.provider,
          providerEventId: `${job.idempotencyKey}:received`,
          eventType: 'received',
          deliveryStatus: null,
          occurredAt: job.receivedAt,
          smtpCode: null,
          reason: null,
          metadata: {}
        })
        if (eventResult.status !== 'appended') {
          throw new Error('CRM email received event was not appended')
        }

        deps.onStage?.('mark_route_used')
        const routeUpdate = await database.query(`
          UPDATE crm_email_routes
          SET last_used_at = GREATEST(
            COALESCE(last_used_at, $3::timestamptz),
            $3::timestamptz
          )
          WHERE id = $1
            AND client_id = $2
            AND is_active = TRUE
            AND revoked_at IS NULL
        `, [job.routeId, job.clientId, job.receivedAt])
        if (routeUpdate.rowCount !== 1) {
          throw new Error('CRM email route usage was not recorded')
        }

        return { status: 'created' }
      })
    }
  }
}

export const crmInboundEmailProcessor = createCrmInboundEmailProcessor()

export async function processCrmInboundEmail(
  input: CrmEmailInboundProcessingRequest
): Promise<ProcessCrmInboundEmailResult> {
  return crmInboundEmailProcessor.process(input)
}
