import { scheduleCrmSearchBackfill } from '~~/server/utils/crm/searchIndex/backfill'
import {
  createCrmSearchConfirmationTag,
  type CrmSearchConfirmationKeyring
} from '~~/server/utils/crm/searchIndex/confirmation'
import { deriveCrmSearchVectorId } from '~~/server/utils/crm/searchIndex/identity'
import { upsertCrmSearchOperation } from '~~/server/utils/crm/searchIndex/operationRepository'
import type { CrmSearchTransactionClient } from '~~/server/utils/crm/searchIndex/repository'
import { transactionWithoutRetry } from '~~/server/utils/db'

interface BackfillExecutionInput extends Record<string, unknown> {
  organisationScopeId: string
  clientId: string
  candidateSchemaVersion: string
  expectedPolicyRevision: number
  approvalId: string
  requestedByActorId: string
  reason: string
  limit: number
  requestedAt: string
  confirmationKeyring?: CrmSearchConfirmationKeyring | null
}

interface BackfillExecutionDependencies {
  scheduleBackfill: typeof scheduleCrmSearchBackfill
  loadBackfillAuthority(input: Record<string, unknown>): Promise<unknown>
  listCurrentSources(input: Record<string, unknown>): Promise<unknown[]>
  createCandidateOperation(input: Record<string, unknown>): Promise<{
    created: boolean
    operationId: string
  }>
  recordBackfillAudit(input: Record<string, unknown>): Promise<{ auditId: string }>
}

interface QueryResult {
  rows: Array<Record<string, unknown>>
}

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu

function first(result: unknown): Record<string, unknown> | null {
  return (result as QueryResult | undefined)?.rows?.[0] ?? null
}

function operationId(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new Error('crm_search_durable_request_failed')
  }
  return value
}

function defaultBackfillDependencies(
  input: BackfillExecutionInput,
  transaction: CrmSearchTransactionClient
): Omit<BackfillExecutionDependencies, 'scheduleBackfill'> {
  return {
    async loadBackfillAuthority(value) {
      const row = first(await transaction.query(`
        SELECT control.revision::BIGINT AS control_revision,
               policy.revision::BIGINT AS policy_revision,
               policy.lifecycle_state, policy.indexing_enabled,
               policy.active_schema_version, policy.candidate_schema_version,
               policy.retiring_schema_versions,
               schema_version.metadata_index_state AS candidate_metadata_index_state,
               schema_version.sentinel_state AS candidate_sentinel_state,
               namespace.namespace,
               approval.id::TEXT AS approval_id,
               approval.approval_type,
               approval.expected_policy_revision::BIGINT AS approval_policy_revision,
               approval.maximum_cost_usd_micros::BIGINT AS maximum_cost_usd_micros,
               (approval.expires_at > NOW()) AS approval_unexpired,
               (revocation.id IS NULL) AS approval_unrevoked
          FROM crm_search_policies policy
          JOIN crm_search_global_control control
            ON control.organisation_scope_id = policy.organisation_scope_id
          JOIN crm_search_schema_versions schema_version
            ON schema_version.organisation_scope_id = policy.organisation_scope_id
           AND schema_version.schema_version = policy.candidate_schema_version
          JOIN crm_search_namespaces namespace
            ON namespace.organisation_scope_id = policy.organisation_scope_id
           AND namespace.client_id = policy.client_id
          JOIN crm_search_change_approvals approval
            ON approval.id = $5::UUID
           AND approval.organisation_scope_id = policy.organisation_scope_id
           AND approval.client_id = policy.client_id
           AND approval.approval_type = 'client_indexing'
           AND approval.expected_control_revision = control.revision
           AND approval.expected_policy_revision = policy.revision
           AND approval.target_schema_version = policy.candidate_schema_version
           AND approval.approved_by <> $6::UUID
           AND crm_search_approval_matches_active_deployment(approval, control)
          LEFT JOIN crm_search_change_approval_revocations revocation
            ON revocation.approval_id = approval.id
         WHERE policy.organisation_scope_id = $1::UUID
           AND policy.client_id = $2::UUID
           AND policy.revision = $3::BIGINT
           AND policy.candidate_schema_version = $4
           AND control.state = 'enabled'
           AND control.indexing_ready = TRUE
         FOR SHARE OF policy, control, schema_version, namespace, approval
      `, [value.organisationScopeId, value.clientId, value.expectedPolicyRevision,
        value.candidateSchemaVersion, value.approvalId, input.requestedByActorId]))
      if (!row) return null
      return {
        controlRevision: Number(row.control_revision),
        policyRevision: Number(row.policy_revision),
        lifecycleState: String(row.lifecycle_state),
        indexingEnabled: row.indexing_enabled === true,
        activeSchemaVersion: String(row.active_schema_version ?? ''),
        candidateSchemaVersion: String(row.candidate_schema_version ?? ''),
        retiringSchemaVersions: Array.isArray(row.retiring_schema_versions)
          ? row.retiring_schema_versions.map(String)
          : [],
        candidateMetadataIndexState: String(row.candidate_metadata_index_state),
        candidateSentinelState: String(row.candidate_sentinel_state),
        namespace: String(row.namespace),
        capacityReady: Number(row.maximum_cost_usd_micros) > 0,
        approval: {
          id: String(row.approval_id),
          approvalType: String(row.approval_type),
          expectedPolicyRevision: Number(row.approval_policy_revision),
          unexpired: row.approval_unexpired === true,
          unrevoked: row.approval_unrevoked === true,
          maximumCostUsdMicros: Number(row.maximum_cost_usd_micros)
        }
      }
    },
    async listCurrentSources(value) {
      const result = await transaction.query(`
        WITH current_source AS (
          SELECT 'person'::TEXT AS entity_type, person.id AS entity_id,
                 person.search_revision AS source_revision,
                 crm_search_person_projection_hash_v1(
                   person.first_name, person.last_name, person.job_title, person.department,
                   person.custom_fields->>'lifecycle_stage'
                 ) AS content_hash
            FROM crm_people person
           WHERE person.client_id = $2::UUID AND person.deleted_at IS NULL
          UNION ALL
          SELECT 'company', company.id, company.search_revision,
                 crm_search_company_projection_hash_v1(
                   company.name, company.domain, company.custom_fields->>'lifecycle_stage'
                 )
            FROM crm_companies company
           WHERE company.client_id = $2::UUID AND company.deleted_at IS NULL
          UNION ALL
          SELECT 'opportunity', opportunity.id, opportunity.search_revision,
                 crm_search_opportunity_projection_hash_v1(
                   opportunity.name, opportunity.status, opportunity.source
                 )
            FROM crm_opportunities opportunity
           WHERE opportunity.client_id = $2::UUID AND opportunity.deleted_at IS NULL
        )
        SELECT source.entity_type, source.entity_id::TEXT AS entity_id,
               source.source_revision::BIGINT AS source_revision,
               nextval('crm_search_source_event_sequence')::BIGINT AS source_event_sequence,
               source.content_hash
          FROM current_source source
         WHERE NOT EXISTS (
           SELECT 1
             FROM crm_search_operations operation
            WHERE operation.organisation_scope_id = $1::UUID
              AND operation.client_id = $2::UUID
              AND operation.entity_type = source.entity_type
              AND operation.entity_id = source.entity_id
              AND operation.schema_version = $3
              AND operation.source_revision = source.source_revision
              AND operation.desired_action = 'upsert'
         )
         ORDER BY source.entity_type, source.entity_id
         LIMIT $4
      `, [value.organisationScopeId, value.clientId, input.candidateSchemaVersion, value.limit])
      return (result as QueryResult).rows.map(row => ({
        entityType: String(row.entity_type),
        entityId: String(row.entity_id),
        sourceRevision: Number(row.source_revision),
        sourceEventSequence: Number(row.source_event_sequence),
        contentHash: String(row.content_hash)
      }))
    },
    async createCandidateOperation(value) {
      if (!input.confirmationKeyring) throw new Error('crm_search_confirmation_key_unavailable')
      const vectorId = await deriveCrmSearchVectorId({
        organisationScopeId: String(value.organisationScopeId),
        clientId: String(value.clientId),
        schemaVersion: String(value.schemaVersion),
        entityType: value.entityType as 'person' | 'company' | 'opportunity',
        entityId: String(value.entityId)
      })
      const confirmation = await createCrmSearchConfirmationTag({
        organisationScopeId: String(value.organisationScopeId),
        clientId: String(value.clientId),
        vectorId,
        schemaVersion: String(value.schemaVersion),
        sourceRevision: Number(value.sourceRevision),
        contentHash: String(value.contentHash)
      }, input.confirmationKeyring)
      const stored = await upsertCrmSearchOperation({
        organisationScopeId: String(value.organisationScopeId),
        clientId: String(value.clientId),
        entityType: value.entityType as 'person' | 'company' | 'opportunity',
        entityId: String(value.entityId),
        schemaVersion: String(value.schemaVersion),
        sourceRevision: Number(value.sourceRevision),
        sourceEventSequence: Number(value.sourceEventSequence),
        desiredAction: 'upsert',
        vectorId,
        namespace: String(value.namespace),
        contentHash: String(value.contentHash),
        confirmationTag: confirmation.confirmationTag,
        confirmationKeyVersion: confirmation.confirmationKeyVersion
      }, transaction)
      return { created: true, operationId: stored.id }
    },
    async recordBackfillAudit(value) {
      const row = first(await transaction.query(`
        INSERT INTO crm_search_audit_log (
          organisation_scope_id, client_id, event_type, actor_id, correlation_id,
          reason, details
        ) VALUES ($1::UUID,$2::UUID,'backfill.requested',$3::UUID,gen_random_uuid(),$4,
          jsonb_build_object(
            'action','backfill','expectedState','pending','approvalId',$5::UUID,
            'candidateSchemaVersion',$6,'fromRevision',$7::BIGINT,'rowCount',$8::INT
          ))
        RETURNING id::TEXT AS id
      `, [input.organisationScopeId, input.clientId, input.requestedByActorId, input.reason,
        input.approvalId, input.candidateSchemaVersion, input.expectedPolicyRevision,
        value.operationsCreated]))
      if (!row) throw new Error('crm_search_durable_request_failed')
      return { auditId: String(row.id) }
    }
  }
}

async function runBackfill(
  input: BackfillExecutionInput,
  dependencies: BackfillExecutionDependencies
) {
  const operationIds: string[] = []
  let auditId: string | null = null
  const result = await dependencies.scheduleBackfill(input, {
    loadBackfillAuthority: dependencies.loadBackfillAuthority as never,
    listCurrentSources: dependencies.listCurrentSources as never,
    async createCandidateOperation(value) {
      const created = await dependencies.createCandidateOperation(
        value as unknown as Record<string, unknown>
      )
      if (created.created) operationIds.push(operationId(created.operationId))
      return created.created
    },
    async recordBackfillAudit(value) {
      const audit = await dependencies.recordBackfillAudit(value)
      if (!audit || typeof audit.auditId !== 'string' || audit.auditId.length === 0) {
        throw new Error('crm_search_durable_request_failed')
      }
      auditId = audit.auditId
      return true
    }
  })
  if (!auditId || result.operationsCreated !== operationIds.length) {
    throw new Error('crm_search_durable_request_failed')
  }
  return {
    ...result,
    status: 'pending' as const,
    operationIds: Object.freeze(operationIds),
    auditId
  }
}

export async function executeCrmSearchBackfill(
  input: BackfillExecutionInput,
  overrides: Partial<BackfillExecutionDependencies> = {}
) {
  if (overrides.loadBackfillAuthority && overrides.listCurrentSources
    && overrides.createCandidateOperation && overrides.recordBackfillAudit) {
    return await runBackfill(input, {
      scheduleBackfill: overrides.scheduleBackfill ?? scheduleCrmSearchBackfill,
      loadBackfillAuthority: overrides.loadBackfillAuthority,
      listCurrentSources: overrides.listCurrentSources,
      createCandidateOperation: overrides.createCandidateOperation,
      recordBackfillAudit: overrides.recordBackfillAudit
    })
  }
  return await transactionWithoutRetry(async (transaction) => {
    const dependencies = defaultBackfillDependencies(input, transaction)
    return await runBackfill(input, {
      scheduleBackfill: overrides.scheduleBackfill ?? scheduleCrmSearchBackfill,
      ...dependencies
    })
  })
}

interface ReconciliationScheduleInput {
  organisationScopeId: string
  expectedControlRevision: number
  requestedByActorId: string
  reason: string
  limit: number
}

export async function executeCrmSearchReconciliationSchedule(
  input: ReconciliationScheduleInput,
  dependencies: { transactionWithoutRetry?: typeof transactionWithoutRetry } = {}
) {
  const runTransaction = dependencies.transactionWithoutRetry ?? transactionWithoutRetry
  return await runTransaction(async (transaction) => {
    const control = first(await transaction.query(`
      SELECT revision::INT AS revision
        FROM crm_search_global_control
       WHERE organisation_scope_id = $1::UUID
         AND revision = $2::BIGINT
       FOR SHARE
    `, [input.organisationScopeId, input.expectedControlRevision]))
    if (!control) throw new Error('crm_search_stale_revision')

    const scheduled = await transaction.query(`
      WITH candidates AS (
        SELECT operation.id
          FROM crm_search_operations operation
          JOIN crm_search_documents document
            ON document.organisation_scope_id = operation.organisation_scope_id
           AND document.client_id = operation.client_id
           AND document.entity_type = operation.entity_type
           AND document.entity_id = operation.entity_id
           AND document.schema_version = operation.schema_version
           AND document.source_revision = operation.source_revision
           AND document.source_event_sequence = operation.source_event_sequence
         WHERE operation.organisation_scope_id = $1::UUID
           AND operation.state IN ('admitted','provider_pending')
           AND document.confirmation_state IN ('provider_pending','delete_pending')
           AND (document.lease_expires_at IS NULL OR document.lease_expires_at <= NOW())
           AND (operation.state = 'provider_pending' OR EXISTS (
             SELECT 1
               FROM crm_search_provider_attempts attempt
              WHERE attempt.operation_id = operation.id
                AND attempt.provider = 'vectorize'
                AND attempt.state = 'ambiguous'
           ))
         ORDER BY operation.next_attempt_at, document.updated_at, document.id
         LIMIT $2
         FOR UPDATE OF operation, document SKIP LOCKED
      )
      UPDATE crm_search_operations operation
         SET next_attempt_at = NOW(), updated_at = NOW()
        FROM candidates
       WHERE operation.id = candidates.id
      RETURNING operation.id::TEXT AS id
    `, [input.organisationScopeId, input.limit]) as QueryResult
    const operationIds = scheduled.rows.map(row => operationId(row.id))
    const audit = first(await transaction.query(`
      INSERT INTO crm_search_audit_log (
        organisation_scope_id, event_type, actor_id, correlation_id, reason, details
      ) VALUES ($1::UUID,'reconciliation.requested',$2::UUID,gen_random_uuid(),$3,
        jsonb_build_object(
          'action','reconcile','expectedState','pending','fromRevision',$4::BIGINT,
          'rowCount',$5::INT
        ))
      RETURNING id::TEXT AS id
    `, [input.organisationScopeId, input.requestedByActorId, input.reason,
      input.expectedControlRevision, operationIds.length]))
    if (!audit) throw new Error('crm_search_durable_request_failed')
    return { status: 'pending' as const, operationIds, auditId: String(audit.id) }
  })
}
