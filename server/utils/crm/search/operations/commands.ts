import { queryOneFresh, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import type { CrmSearchTransactionClient } from '~~/server/utils/crm/searchIndex/repository'
import {
  parseCrmSearchApprovalDraft,
  requireGlobalState,
  requirePolicyState,
  crmSearchApprovalScope,
  type CrmSearchAdminActor,
  type CrmSearchApprovalDraft
} from './contracts'

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const reasonMinimum = 10
const reasonMaximum = 2_000

function fail(code: string): never {
  throw Object.assign(new Error(code), { code })
}

function revision(value: unknown, code = 'crm_search_expected_revision_required'): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(code)
  return value as number
}

function identifier(value: unknown, code = 'crm_search_invalid_command'): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) fail(code)
  return value
}

function boundedReason(value: unknown): string {
  if (typeof value !== 'string') fail('crm_search_reason_required')
  const result = value.trim()
  if (result.length < reasonMinimum || result.length > reasonMaximum) fail('crm_search_reason_required')
  return result
}

function exactConfirmation(actual: unknown, expected: string) {
  if (actual !== expected) fail('crm_search_confirmation_mismatch')
}

const globalConfirmations = {
  halted: 'HALT CRM SEARCH',
  delete_only: 'SET CRM SEARCH DELETE ONLY',
  enabled: 'ENABLE CRM SEARCH'
} as const

const policyConfirmations = {
  off: 'DISABLE CLIENT CRM SEARCH',
  indexing: 'ENABLE CLIENT CRM SEARCH INDEXING',
  shadow: 'ENABLE CLIENT CRM SEARCH SHADOW',
  assist: 'ENABLE CLIENT CRM SEARCH ASSIST',
  teardown_pending: 'BEGIN CLIENT CRM SEARCH TEARDOWN'
} as const

export function parseGlobalControlCommand(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('crm_search_invalid_command')
  const input = value as Record<string, unknown>
  const nextState = requireGlobalState(input.nextState)
  const expectedRevision = revision(input.expectedRevision)
  const reason = boundedReason(input.reason)
  exactConfirmation(input.confirmation, globalConfirmations[nextState])
  const nextMaximumMode = nextState === 'enabled'
    ? (['off', 'shadow', 'assist'].includes(String(input.nextMaximumMode)) ? input.nextMaximumMode : 'off')
    : 'off'
  const indexingReady = nextState === 'enabled' && input.indexingReady === true
  return Object.freeze({
    ...input,
    nextState,
    expectedRevision,
    reason,
    nextMaximumMode,
    indexingReady,
    approvalId: input.approvalId
  })
}

export function parseClientPolicyCommand(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('crm_search_invalid_command')
  const input = value as Record<string, unknown>
  const clientId = identifier(input.clientId)
  const nextState = requirePolicyState(input.nextState)
  const expectedControlRevision = revision(input.expectedControlRevision)
  const expectedPolicyRevision = revision(input.expectedPolicyRevision)
  const reason = boundedReason(input.reason)
  exactConfirmation(input.confirmation, policyConfirmations[nextState])
  return Object.freeze({
    ...input,
    clientId,
    nextState,
    expectedControlRevision,
    expectedPolicyRevision,
    reason,
    approvalId: input.approvalId,
    evaluationRunId: input.evaluationRunId,
    teardownCycleId: input.teardownCycleId
  })
}

export function mapCrmSearchCommandError(error: unknown) {
  const raw = error && typeof error === 'object'
    ? String((error as { code?: unknown, message?: unknown }).code
      ?? (error as { message?: unknown }).message ?? '')
    : String(error ?? '')
  if (/stale|revision (?:changed|mismatch)|CAS failed|dead[_ -]letter.*changed/i.test(raw)) {
    return {
      statusCode: 409,
      statusMessage: 'CRM search state changed. Refresh before retrying.',
      code: 'crm_search_stale_revision',
      action: 'refresh'
    }
  }
  if (/confirmation|reason|required|invalid|approval|capacity|authority|authorized/i.test(raw)) {
    return {
      statusCode: 422,
      statusMessage: 'CRM search command was not admitted.',
      code: raw.startsWith('crm_search_') ? raw : 'crm_search_command_not_admitted'
    }
  }
  return {
    statusCode: 503,
    statusMessage: 'CRM search operation is unavailable.',
    code: 'crm_search_operation_unavailable'
  }
}

export async function importCrmSearchApproval(input: {
  actor: CrmSearchAdminActor
  approval: unknown
  insertImportedApproval(approval: CrmSearchApprovalDraft): Promise<{ approvalId: string }>
}) {
  const candidate = input.approval && typeof input.approval === 'object'
    ? input.approval as Record<string, unknown>
    : {}
  if (candidate.approvalType !== 'resource_provision') fail('crm_search_import_resource_provision_only')
  const approval = parseCrmSearchApprovalDraft(input.approval)
  if (!approval.issuedAt || !approval.importedProvenanceHash) fail('crm_search_invalid_approval')
  return await input.insertImportedApproval(approval)
}

export async function revokeCrmSearchApproval(input: {
  actor: CrmSearchAdminActor
  approvalId: string
  expectedRevision: number
  reason: string
  confirmation: string
  appendRevocation(value: Record<string, unknown>): Promise<{ revocationId: string }>
  updateApproval?: (...args: unknown[]) => unknown
  deleteApproval?: (...args: unknown[]) => unknown
}) {
  const approvalId = identifier(input.approvalId)
  const expectedRevision = revision(input.expectedRevision)
  const reason = boundedReason(input.reason)
  exactConfirmation(input.confirmation, 'REVOKE CRM SEARCH APPROVAL')
  return await input.appendRevocation({
    approvalId,
    expectedRevision,
    reason,
    revokedByActorId: input.actor.actorId,
    organisationScopeId: input.actor.orgId
  })
}

export async function scheduleCrmSearchBackfillCommand(input: Record<string, unknown> & {
  actor: CrmSearchAdminActor
  createDurableOperation(value: Record<string, unknown>): Promise<unknown>
}) {
  const clientId = identifier(input.clientId)
  const expectedPolicyRevision = revision(input.expectedPolicyRevision)
  const reason = boundedReason(input.reason)
  exactConfirmation(input.confirmation, 'SCHEDULE CRM SEARCH BACKFILL')
  return await input.createDurableOperation({
    ...input,
    type: 'backfill',
    clientId,
    expectedPolicyRevision,
    reason,
    organisationScopeId: input.actor.orgId,
    requestedByActorId: input.actor.actorId
  })
}

export async function scheduleCrmSearchReconciliationCommand(input: Record<string, unknown> & {
  actor: CrmSearchAdminActor
  createDurableOperation(value: Record<string, unknown>): Promise<unknown>
}) {
  const expectedControlRevision = revision(input.expectedControlRevision)
  const reason = boundedReason(input.reason)
  exactConfirmation(input.confirmation, 'SCHEDULE CRM SEARCH RECONCILIATION')
  return await input.createDurableOperation({
    ...input,
    type: 'reconcile',
    expectedControlRevision,
    reason,
    organisationScopeId: input.actor.orgId,
    requestedByActorId: input.actor.actorId
  })
}

export async function recoverCrmSearchDeadLetterCommand(input: Record<string, unknown> & {
  actor: CrmSearchAdminActor
  requestDurableRecovery(value: Record<string, unknown>): Promise<unknown>
}) {
  const deadLetterId = identifier(input.deadLetterId)
  const expectedRevision = revision(input.expectedRevision)
  const reason = boundedReason(input.reason)
  exactConfirmation(input.confirmation, 'RECOVER CRM SEARCH DEAD LETTER')
  const origin = input.origin
  const action = input.action
  const expectedAction = origin === 'cloudflare_transport'
    ? 'transport_retry'
    : origin === 'provider_confirmation'
      ? 'confirmation_reconcile'
      : null
  if (!expectedAction || action !== expectedAction) fail('crm_search_dead_letter_action_mismatch')
  return await input.requestDurableRecovery({
    deadLetterId,
    expectedRevision,
    reason,
    origin,
    action,
    organisationScopeId: input.actor.orgId,
    actorId: input.actor.actorId
  })
}

interface QueryResult { rows: Array<Record<string, unknown>> }

async function transactionRow(transaction: CrmSearchTransactionClient, sql: string, params: unknown[]) {
  const result = await transaction.query(sql, params) as QueryResult
  return result.rows[0] ?? null
}

export async function changeGlobalControl(
  value: unknown,
  actor: CrmSearchAdminActor,
  dependencies: { transition?: (input: Record<string, unknown>) => Promise<unknown> } = {}
) {
  const command = parseGlobalControlCommand(value)
  if (dependencies.transition) return await dependencies.transition({ ...command, actorId: actor.actorId, orgId: actor.orgId })
  const row = await queryOneFresh<{ revision: number }>(`
    SELECT crm_search_transition_global_control(
      $1::UUID, $2::BIGINT, $3::TEXT, $4::TEXT, $5::BOOLEAN,
      $6::UUID, $7::TEXT, $8::UUID
    )::INT AS revision
  `, [actor.orgId, command.expectedRevision, command.nextState, command.nextMaximumMode,
    command.indexingReady, actor.actorId, command.reason, command.approvalId ?? null])
  if (!row) fail('crm_search_global_control_transition_failed')
  return { state: command.nextState, revision: row.revision }
}

export async function changeClientPolicy(
  value: unknown,
  actor: CrmSearchAdminActor,
  dependencies: { transition?: (input: Record<string, unknown>) => Promise<unknown> } = {}
) {
  const command = parseClientPolicyCommand(value)
  if (dependencies.transition) return await dependencies.transition({ ...command, actorId: actor.actorId, orgId: actor.orgId })
  return await transactionWithoutRetry(async (transaction) => {
    const snapshot = await transactionRow(transaction, `
      SELECT control.revision AS control_revision,
             policy.active_schema_version,
             policy.candidate_schema_version
        FROM crm_search_global_control control
        JOIN crm_search_policies policy
          ON policy.organisation_scope_id = control.organisation_scope_id
       WHERE control.organisation_scope_id = $1::UUID
         AND policy.client_id = $2::UUID
         AND control.revision = $3::BIGINT
         AND policy.revision = $4::BIGINT
       FOR SHARE OF control, policy
    `, [actor.orgId, command.clientId, command.expectedControlRevision, command.expectedPolicyRevision])
    if (!snapshot) fail('crm_search_stale_revision')
    const result = await transactionRow(transaction, `
      SELECT crm_search_transition_policy(
        $1::UUID, $2::UUID, $3::BIGINT, $4::TEXT, $5::TEXT, $6::TEXT,
        $7::UUID, $8::UUID, $9::TEXT, $10::UUID, $11::UUID
      )::INT AS revision
    `, [actor.orgId, command.clientId, command.expectedPolicyRevision, command.nextState,
      snapshot.active_schema_version, snapshot.candidate_schema_version,
      command.evaluationRunId ?? null, actor.actorId, command.reason,
      command.teardownCycleId ?? null, command.approvalId ?? null])
    if (!result) fail('crm_search_policy_transition_failed')
    return { clientId: command.clientId, state: command.nextState, revision: Number(result.revision) }
  })
}

function approvalParams(approval: CrmSearchApprovalDraft) {
  return [
    approval.approvalType, approval.environment, approval.implementationGitSha,
    approval.artifactManifestDigest, approval.pagesBundleDigest ?? null,
    approval.workerBundleDigest ?? null, approval.bindingManifestDigest,
    approval.evidenceBundleHash, approval.loadProtocolDigest ?? null,
    approval.providerContractDigest ?? null, approval.rateCardId ?? null,
    approval.organisationScopeId, crmSearchApprovalScope(approval.approvalType),
    approval.clientId ?? null, approval.maximumCostUsdMicros,
    approval.activeVectorCount ?? null, approval.candidateVectorCount ?? null,
    approval.retiringVectorCount ?? null, approval.sentinelVectorCount ?? null,
    approval.deletionPendingVectorCount ?? null, approval.forecastVectorCount ?? null,
    approval.vectorCapacity ?? null, approval.activeNamespaceCount ?? null,
    approval.candidateNamespaceCount ?? null, approval.retiringNamespaceCount ?? null,
    approval.sentinelNamespaceCount ?? null, approval.deletionPendingNamespaceCount ?? null,
    approval.forecastNamespaceCount ?? null, approval.namespaceCapacity ?? null,
    approval.expectedControlRevision ?? null, approval.expectedPolicyRevision ?? null,
    approval.expectedDeploymentApprovalId ?? null, approval.targetSchemaVersion ?? null,
    approval.requestedAction ?? null, approval.approvedBy, approval.reason,
    approval.issuedAt ?? null, approval.expiresAt, approval.importedProvenanceHash ?? null
  ]
}

async function persistApproval(approval: CrmSearchApprovalDraft, importerId?: string) {
  return await transactionWithoutRetry(async (transaction) => {
    const row = await transactionRow(transaction, `
      INSERT INTO crm_search_change_approvals (
        approval_type, environment, implementation_git_sha, artifact_manifest_digest,
        pages_bundle_digest, worker_bundle_digest, binding_manifest_digest, evidence_bundle_hash,
        load_protocol_digest, provider_contract_digest, rate_card_id, organisation_scope_id,
        scope_kind, client_id, maximum_cost_usd_micros,
        active_vector_count, candidate_vector_count, retiring_vector_count, sentinel_vector_count,
        deletion_pending_vector_count, forecast_vector_count, vector_capacity,
        active_namespace_count, candidate_namespace_count, retiring_namespace_count,
        sentinel_namespace_count, deletion_pending_namespace_count, forecast_namespace_count,
        namespace_capacity, expected_control_revision, expected_policy_revision,
        expected_deployment_approval_id, target_schema_version, requested_action, approved_by,
        reason, issued_at, expires_at, imported_provenance_hash
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::UUID,$12::UUID,$13,$14::UUID,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,
        $32::UUID,$33,$34,$35::UUID,$36,COALESCE($37::TIMESTAMPTZ,NOW()),$38::TIMESTAMPTZ,$39
      ) RETURNING id::TEXT AS id
    `, approvalParams(approval))
    if (!row || typeof row.id !== 'string') fail('crm_search_approval_create_failed')
    await transaction.query(`
      INSERT INTO crm_search_audit_log (
        organisation_scope_id, client_id, event_type, actor_id, correlation_id,
        reason, evidence_hash, details
      ) VALUES ($1::UUID, $2::UUID, $3, $4::UUID, gen_random_uuid(), $5, $6,
        jsonb_build_object('approvalId',$7,'action',$8,'expectedState',$9))
    `, [approval.organisationScopeId, approval.clientId ?? null,
      importerId ? 'approval.imported' : 'approval.created', importerId ?? approval.approvedBy,
      approval.reason, approval.evidenceBundleHash, row.id, approval.approvalType,
      crmSearchApprovalScope(approval.approvalType)])
    return { approvalId: row.id }
  })
}

export async function createCrmSearchApproval(
  value: unknown,
  actor: CrmSearchAdminActor,
  dependencies: { insert?: (approval: CrmSearchApprovalDraft) => Promise<{ approvalId: string }> } = {}
) {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const approval = parseCrmSearchApprovalDraft({
    ...input,
    organisationScopeId: actor.orgId,
    approvedBy: actor.actorId
  })
  return dependencies.insert ? dependencies.insert(approval) : persistApproval(approval)
}

export async function importCrmSearchApprovalBootstrap(
  value: unknown,
  actor: CrmSearchAdminActor,
  dependencies: { insert?: (approval: CrmSearchApprovalDraft) => Promise<{ approvalId: string }> } = {}
) {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return await importCrmSearchApproval({
    actor,
    approval: { ...candidate, organisationScopeId: actor.orgId },
    insertImportedApproval: dependencies.insert ?? (approval => persistApproval(approval, actor.actorId))
  })
}

export async function revokeCrmSearchApprovalRecord(value: Record<string, unknown>, actor: CrmSearchAdminActor) {
  return await revokeCrmSearchApproval({
    actor,
    approvalId: String(value.approvalId),
    expectedRevision: Number(value.expectedRevision),
    reason: String(value.reason),
    confirmation: String(value.confirmation),
    async appendRevocation(command) {
      return await transactionWithoutRetry(async (transaction) => {
        const current = await transactionRow(transaction, `
          SELECT approval.id::TEXT AS id,
                 CASE WHEN revocation.id IS NULL THEN 0 ELSE 1 END AS revision,
                 approval.organisation_scope_id::TEXT AS organisation_scope_id,
                 approval.client_id::TEXT AS client_id,
                 approval.evidence_bundle_hash
            FROM crm_search_change_approvals approval
            LEFT JOIN crm_search_change_approval_revocations revocation
              ON revocation.approval_id = approval.id
           WHERE approval.id = $1::UUID
             AND approval.organisation_scope_id = $2::UUID
           FOR UPDATE OF approval
        `, [command.approvalId, actor.orgId])
        if (!current || Number(current.revision) !== command.expectedRevision) fail('crm_search_stale_revision')
        const revocation = await transactionRow(transaction, `
          INSERT INTO crm_search_change_approval_revocations (approval_id, revoked_by, reason)
          VALUES ($1::UUID, $2::UUID, $3)
          RETURNING id::TEXT AS id
        `, [command.approvalId, actor.actorId, command.reason])
        if (!revocation) fail('crm_search_approval_revoke_failed')
        await transaction.query(`
          INSERT INTO crm_search_audit_log (
            organisation_scope_id, client_id, event_type, actor_id, correlation_id,
            reason, evidence_hash, details
          ) VALUES ($1::UUID,$2::UUID,'approval.revoked',$3::UUID,gen_random_uuid(),$4,$5,
            jsonb_build_object('approvalId',$6,'fromRevision',0,'toRevision',1))
        `, [actor.orgId, current.client_id ?? null, actor.actorId, command.reason,
          current.evidence_bundle_hash, command.approvalId])
        return { revocationId: String(revocation.id) }
      })
    }
  })
}

export async function createDurableCrmSearchRequest(input: Record<string, unknown>) {
  const isBackfill = input.type === 'backfill'
  const eventType = isBackfill ? 'backfill.requested' : 'reconciliation.requested'
  const details: Record<string, unknown> = {
    action: input.type,
    expectedState: 'pending'
  }
  const expectedRevision = input.expectedControlRevision ?? input.expectedPolicyRevision
  if (expectedRevision !== undefined && expectedRevision !== null) details.fromRevision = expectedRevision
  if (input.candidateSchemaVersion) details.candidateSchemaVersion = input.candidateSchemaVersion
  if (input.approvalId) details.approvalId = input.approvalId
  if (input.limit) details.rowCount = input.limit

  return await transactionWithoutRetry(async (transaction) => {
    const admitted = isBackfill
      ? await transactionRow(transaction, `
          SELECT policy.revision
            FROM crm_search_policies policy
            JOIN crm_search_global_control control
              ON control.organisation_scope_id = policy.organisation_scope_id
            JOIN crm_search_schema_versions schema_version
              ON schema_version.organisation_scope_id = policy.organisation_scope_id
             AND schema_version.schema_version = policy.candidate_schema_version
            JOIN crm_search_change_approvals approval
              ON approval.id = $5::UUID
             AND approval.approval_type = 'client_indexing'
             AND approval.scope_kind = 'client'
             AND approval.organisation_scope_id = policy.organisation_scope_id
             AND approval.client_id = policy.client_id
             AND approval.expected_control_revision = control.revision
             AND approval.expected_policy_revision = policy.revision
             AND approval.target_schema_version = policy.candidate_schema_version
             AND approval.approved_by <> $6::UUID
             AND approval.maximum_cost_usd_micros > 0
             AND approval.expires_at > NOW()
             AND crm_search_approval_matches_active_deployment(approval, control)
            LEFT JOIN crm_search_change_approval_revocations revocation
              ON revocation.approval_id = approval.id
           WHERE policy.organisation_scope_id = $1::UUID
             AND policy.client_id = $2::UUID
             AND policy.revision = $3::BIGINT
             AND policy.candidate_schema_version = $4
             AND policy.lifecycle_state = 'indexing'
             AND control.state = 'enabled'
             AND control.indexing_ready = TRUE
             AND schema_version.metadata_index_state = 'ready'
             AND schema_version.sentinel_state = 'confirmed_absent'
             AND revocation.id IS NULL
           FOR SHARE OF policy, control, schema_version, approval
        `, [input.organisationScopeId, input.clientId, input.expectedPolicyRevision,
          input.candidateSchemaVersion, input.approvalId, input.requestedByActorId])
      : await transactionRow(transaction, `
          SELECT revision
            FROM crm_search_global_control
           WHERE organisation_scope_id = $1::UUID
             AND revision = $2::BIGINT
           FOR SHARE
        `, [input.organisationScopeId, input.expectedControlRevision])
    if (!admitted) fail('crm_search_stale_revision')

    const row = await transactionRow(transaction, `
      INSERT INTO crm_search_audit_log (
        organisation_scope_id, client_id, event_type, actor_id, correlation_id, reason, details
      ) VALUES ($1::UUID,$2::UUID,$3,$4::UUID,gen_random_uuid(),$5,$6::JSONB)
      RETURNING id::TEXT AS id
    `, [input.organisationScopeId, input.clientId ?? null, eventType, input.requestedByActorId,
      input.reason, JSON.stringify(details)])
    if (!row || typeof row.id !== 'string') fail('crm_search_durable_request_failed')
    return { operationId: row.id, status: 'pending' as const }
  })
}

export async function requestCrmSearchDeadLetterRecoveryRecord(input: Record<string, unknown>) {
  const nextState = input.action === 'transport_retry'
    ? 'transport_retry_requested'
    : 'confirmation_reconcile_requested'
  const row = await queryOneFresh<{ state: string }>(`
    SELECT crm_search_transition_dead_letter($1::UUID,'open',$2,$3::UUID,$4)::TEXT AS state
  `, [input.deadLetterId, nextState, input.actorId, input.reason])
  if (!row || row.state !== nextState) fail('crm_search_dead_letter_changed')
  return { recoveryId: String(input.deadLetterId), status: row.state }
}

export async function listCrmSearchApprovals(organisationScopeId: string) {
  const rows = await queryRowsFresh<Record<string, unknown>>(`
    SELECT approval.id::TEXT AS id, approval.approval_type AS "approvalType",
           approval.environment, approval.scope_kind AS "scopeKind",
           approval.client_id::TEXT AS "clientId", approval.reason,
           approval.evidence_bundle_hash AS "evidenceBundleHash",
           approval.maximum_cost_usd_micros::BIGINT AS "maximumCostUsdMicros",
           approval.issued_at AS "issuedAt", approval.expires_at AS "expiresAt",
           approval.approved_by::TEXT AS "approvedBy",
           CASE WHEN revocation.id IS NULL THEN 0 ELSE 1 END AS revision,
           revocation.revoked_at AS "revokedAt", consumption.consumed_at AS "consumedAt"
      FROM crm_search_change_approvals approval
      LEFT JOIN crm_search_change_approval_revocations revocation ON revocation.approval_id = approval.id
      LEFT JOIN crm_search_change_approval_consumptions consumption ON consumption.approval_id = approval.id
     WHERE approval.organisation_scope_id = $1::UUID
     ORDER BY approval.issued_at DESC
     LIMIT 200
  `, [organisationScopeId])
  return rows.map(row => {
    const maximumCostUsdMicros = Number(row.maximumCostUsdMicros)
    const approvalRevision = Number(row.revision)
    if (!Number.isSafeInteger(maximumCostUsdMicros) || maximumCostUsdMicros < 0
      || !Number.isSafeInteger(approvalRevision) || approvalRevision < 0) {
      fail('crm_search_approval_read_invalid')
    }
    return { ...row, maximumCostUsdMicros, revision: approvalRevision }
  })
}
