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
import { requireVerifiedCrmSearchBootstrapApproval } from './bootstrapApproval'
import {
  executeCrmSearchBackfill,
  executeCrmSearchReconciliationSchedule
} from './execution'
import {
  assertCrmSearchDurableCapacityAdmission,
  loadCrmSearchDurableCapacity,
  type CrmSearchCapacity
} from './health'

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

function exactTimestampRevision(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/u.test(value)) {
    fail('crm_search_expected_revision_required')
  }
  return value
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
  verifiedApproval: CrmSearchApprovalDraft
  insertImportedApproval(approval: CrmSearchApprovalDraft): Promise<{ approvalId: string }>
}) {
  const candidate = requireVerifiedCrmSearchBootstrapApproval(input.verifiedApproval)
  if (candidate.approvalType !== 'resource_provision') fail('crm_search_import_resource_provision_only')
  if (candidate.organisationScopeId !== input.actor.orgId) fail('crm_search_invalid_approval')
  const approval = parseCrmSearchApprovalDraft(candidate)
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
  loadDurableCapacity?: (organisationScopeId: string) => Promise<CrmSearchCapacity>
  createDurableOperation(value: Record<string, unknown>): Promise<unknown>
}) {
  const clientId = identifier(input.clientId)
  const expectedPolicyRevision = revision(input.expectedPolicyRevision)
  const reason = boundedReason(input.reason)
  exactConfirmation(input.confirmation, 'SCHEDULE CRM SEARCH BACKFILL')
  const capacity = await (input.loadDurableCapacity ?? loadCrmSearchDurableCapacity)(input.actor.orgId)
  assertCrmSearchDurableCapacityAdmission(capacity)
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
  const expectedRevision = exactTimestampRevision(input.expectedRevision)
  const expectedGeneration = revision(input.expectedGeneration, 'crm_search_expected_generation_required')
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
    expectedGeneration,
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
    approval.requestedAction ?? null, approval.requestedByActorId, approval.approvedBy, approval.reason,
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
        expected_deployment_approval_id, target_schema_version, requested_action, requested_by,
        approved_by,
        reason, issued_at, expires_at, imported_provenance_hash
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::UUID,$12::UUID,$13,$14::UUID,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,
        $32::UUID,$33,$34,$35::UUID,$36::UUID,$37,COALESCE($38::TIMESTAMPTZ,NOW()),
        $39::TIMESTAMPTZ,$40
      ) RETURNING id::TEXT AS id
    `, approvalParams(approval))
    if (!row || typeof row.id !== 'string') fail('crm_search_approval_create_failed')
    await transaction.query(`
      INSERT INTO crm_search_audit_log (
        organisation_scope_id, client_id, event_type, actor_id, correlation_id,
        reason, evidence_hash, details
      ) VALUES ($1::UUID, $2::UUID, $3, $4::UUID, gen_random_uuid(), $5, $6,
        jsonb_strip_nulls(jsonb_build_object(
          'approvalId',$7,'action',$8,'expectedState',$9,
          'requestedByActorId',$10::UUID,'importedProvenanceHash',$11
        )))
    `, [approval.organisationScopeId, approval.clientId ?? null,
      importerId ? 'approval.imported' : 'approval.created', importerId ?? approval.approvedBy,
      approval.reason, approval.evidenceBundleHash, row.id, approval.approvalType,
      crmSearchApprovalScope(approval.approvalType), approval.requestedByActorId,
      approval.importedProvenanceHash ?? null])
    await transaction.query(`
      INSERT INTO crm_search_audit_log (
        organisation_scope_id, client_id, event_type, actor_id, correlation_id,
        reason, evidence_hash, details
      ) VALUES ($1::UUID, $2::UUID, 'approval.requested', $3::UUID, gen_random_uuid(),
        $4, $5, jsonb_build_object('approvalId',$6,'action',$7,'expectedState',$8))
    `, [approval.organisationScopeId, approval.clientId ?? null,
      approval.requestedByActorId, approval.reason, approval.evidenceBundleHash, row.id,
      approval.approvalType, crmSearchApprovalScope(approval.approvalType)])
    return { approvalId: row.id }
  })
}

async function loadActiveApprovalRequester(requestedByActorId: string, organisationScopeId: string) {
  const requester = await queryOneFresh<{ actor_id: string }>(`
    SELECT actor.id::TEXT AS actor_id
      FROM team_members actor
     WHERE actor.id = $1::UUID
       AND actor.is_active = TRUE
       AND EXISTS (
         SELECT 1
           FROM crm_search_organisation_scopes scope
          WHERE scope.id = $2::UUID
            AND scope.is_primary = TRUE
            AND scope.is_active = TRUE
       )
     LIMIT 1
  `, [requestedByActorId, organisationScopeId])
  return requester ? { actorId: requester.actor_id, active: true as const } : null
}

export async function createCrmSearchApproval(
  value: unknown,
  actor: CrmSearchAdminActor,
  dependencies: {
    insert?: (approval: CrmSearchApprovalDraft) => Promise<{ approvalId: string }>
    loadActiveRequester?: typeof loadActiveApprovalRequester
    loadDurableCapacity?: (organisationScopeId: string) => Promise<CrmSearchCapacity>
  } = {}
) {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  if (input.approvalType === 'resource_provision') {
    fail('crm_search_resource_provision_import_required')
  }
  const approval = parseCrmSearchApprovalDraft({
    ...input,
    organisationScopeId: actor.orgId,
    approvedBy: actor.actorId
  })
  if (approval.approvalType === 'client_indexing') {
    const capacity = await (dependencies.loadDurableCapacity ?? loadCrmSearchDurableCapacity)(actor.orgId)
    assertCrmSearchDurableCapacityAdmission(capacity)
  }
  const requester = await (dependencies.loadActiveRequester ?? loadActiveApprovalRequester)(
    approval.requestedByActorId,
    actor.orgId
  )
  if (!requester || requester.active !== true || requester.actorId !== approval.requestedByActorId) {
    fail('crm_search_approval_requester_unavailable')
  }
  return dependencies.insert ? dependencies.insert(approval) : persistApproval(approval)
}

export async function importCrmSearchApprovalBootstrap(
  value: unknown,
  actor: CrmSearchAdminActor,
  dependencies: {
    insert?: (approval: CrmSearchApprovalDraft) => Promise<{ approvalId: string }>
    loadActiveRequester?: typeof loadActiveApprovalRequester
  } = {}
) {
  const candidate = requireVerifiedCrmSearchBootstrapApproval(value)
  const requestedByActorId = identifier(candidate.requestedByActorId)
  const requester = await (dependencies.loadActiveRequester ?? loadActiveApprovalRequester)(
    requestedByActorId,
    actor.orgId
  )
  if (!requester || requester.active !== true || requester.actorId !== requestedByActorId) {
    fail('crm_search_approval_requester_unavailable')
  }
  return await importCrmSearchApproval({
    actor,
    verifiedApproval: candidate as CrmSearchApprovalDraft,
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
  if (input.type === 'backfill') {
    return await executeCrmSearchBackfill({
      ...input,
      organisationScopeId: String(input.organisationScopeId),
      clientId: String(input.clientId),
      candidateSchemaVersion: String(input.candidateSchemaVersion),
      expectedPolicyRevision: Number(input.expectedPolicyRevision),
      approvalId: String(input.approvalId),
      requestedByActorId: String(input.requestedByActorId),
      reason: String(input.reason),
      limit: Number(input.limit),
      requestedAt: typeof input.requestedAt === 'string'
        ? input.requestedAt
        : new Date().toISOString(),
      confirmationKeyring: input.confirmationKeyring as never
    })
  }
  if (input.type === 'reconcile') {
    return await executeCrmSearchReconciliationSchedule({
      organisationScopeId: String(input.organisationScopeId),
      expectedControlRevision: Number(input.expectedControlRevision),
      requestedByActorId: String(input.requestedByActorId),
      reason: String(input.reason),
      limit: 25
    })
  }
  fail('crm_search_invalid_command')
}

export async function requestCrmSearchDeadLetterRecoveryRecord(
  input: Record<string, unknown>,
  dependencies: { transactionWithoutRetry?: typeof transactionWithoutRetry } = {}
) {
  const nextState = input.action === 'transport_retry'
    ? 'transport_retry_requested'
    : 'confirmation_reconcile_requested'
  const runTransaction = dependencies.transactionWithoutRetry ?? transactionWithoutRetry
  return await runTransaction(async (transaction) => {
    const terminal = await transactionRow(transaction, `
      SELECT dead_letter.id::TEXT AS id,
             dead_letter.operation_id::TEXT AS operation_id,
             dead_letter.origin, dead_letter.resolution_state,
             to_char(dead_letter.updated_at AT TIME ZONE 'UTC',
               'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS revision,
             operation.lease_generation::INT AS generation,
             operation.source_revision::INT AS source_revision,
             operation.source_event_sequence::INT AS source_event_sequence,
             operation.desired_action, operation.vector_id, operation.namespace,
             operation.content_hash, operation.confirmation_tag,
             operation.confirmation_key_version
        FROM crm_search_dead_letters dead_letter
        JOIN crm_search_operations operation ON operation.id = dead_letter.operation_id
       WHERE dead_letter.id = $1::UUID
         AND dead_letter.organisation_scope_id = $2::UUID
         AND dead_letter.origin = $3
         AND dead_letter.resolution_state = 'open'
         AND dead_letter.updated_at = $4::TIMESTAMPTZ
         AND operation.lease_generation = $5::BIGINT
         AND operation.state = 'terminal_dead_letter'
       FOR UPDATE OF dead_letter, operation
    `, [input.deadLetterId, input.organisationScopeId, input.origin,
      input.expectedRevision, input.expectedGeneration])
    if (!terminal || terminal.id !== input.deadLetterId
      || terminal.origin !== input.origin
      || Number(terminal.generation) !== input.expectedGeneration) {
      fail('crm_search_dead_letter_changed')
    }
    const replacement = await transactionRow(transaction, `
      SELECT crm_search_replace_terminal_operation(
        $1::UUID,$2::BIGINT,$3::BIGINT,$4,$5,$6,$7,$8,$9,$10::UUID,$11
      )::TEXT AS replacement_operation_id
    `, [terminal.operation_id, terminal.source_revision, terminal.source_event_sequence,
      terminal.desired_action, terminal.vector_id, terminal.namespace, terminal.content_hash,
      terminal.confirmation_tag, terminal.confirmation_key_version, input.actorId, input.reason])
    if (!replacement || typeof replacement.replacement_operation_id !== 'string') {
      fail('crm_search_dead_letter_changed')
    }
    const replacementId = identifier(replacement.replacement_operation_id)
    return {
      recoveryId: replacementId,
      operationId: replacementId,
      status: nextState
    }
  })
}

export async function listCrmSearchApprovals(organisationScopeId: string) {
  const rows = await queryRowsFresh<Record<string, unknown>>(`
    SELECT approval.id::TEXT AS id, approval.approval_type AS "approvalType",
           approval.environment, approval.scope_kind AS "scopeKind",
           approval.organisation_scope_id::TEXT AS "organisationScopeId",
           approval.client_id::TEXT AS "clientId", approval.reason,
           approval.implementation_git_sha AS "implementationGitSha",
           approval.artifact_manifest_digest AS "artifactManifestDigest",
           approval.pages_bundle_digest AS "pagesBundleDigest",
           approval.worker_bundle_digest AS "workerBundleDigest",
           approval.binding_manifest_digest AS "bindingManifestDigest",
           approval.evidence_bundle_hash AS "evidenceBundleHash",
           approval.load_protocol_digest AS "loadProtocolDigest",
           approval.provider_contract_digest AS "providerContractDigest",
           approval.rate_card_id::TEXT AS "rateCardId",
           approval.maximum_cost_usd_micros::BIGINT AS "maximumCostUsdMicros",
           approval.active_vector_count::BIGINT AS "activeVectorCount",
           approval.candidate_vector_count::BIGINT AS "candidateVectorCount",
           approval.retiring_vector_count::BIGINT AS "retiringVectorCount",
           approval.sentinel_vector_count::BIGINT AS "sentinelVectorCount",
           approval.deletion_pending_vector_count::BIGINT AS "deletionPendingVectorCount",
           approval.forecast_vector_count::BIGINT AS "forecastVectorCount",
           approval.vector_capacity::BIGINT AS "vectorCapacity",
           approval.active_namespace_count::BIGINT AS "activeNamespaceCount",
           approval.candidate_namespace_count::BIGINT AS "candidateNamespaceCount",
           approval.retiring_namespace_count::BIGINT AS "retiringNamespaceCount",
           approval.sentinel_namespace_count::BIGINT AS "sentinelNamespaceCount",
           approval.deletion_pending_namespace_count::BIGINT AS "deletionPendingNamespaceCount",
           approval.forecast_namespace_count::BIGINT AS "forecastNamespaceCount",
           approval.namespace_capacity::BIGINT AS "namespaceCapacity",
           approval.expected_control_revision::BIGINT AS "expectedControlRevision",
           approval.expected_policy_revision::BIGINT AS "expectedPolicyRevision",
           approval.expected_deployment_approval_id::TEXT AS "expectedDeploymentApprovalId",
           approval.target_schema_version AS "targetSchemaVersion",
           approval.requested_action AS "requestedAction",
           approval.issued_at AS "issuedAt", approval.expires_at AS "expiresAt",
           approval.approved_by::TEXT AS "approvedBy",
           approval.requested_by::TEXT AS "requestedByActorId",
           approval.imported_provenance_hash AS "importedProvenanceHash",
           CASE WHEN revocation.id IS NULL THEN 0 ELSE 1 END AS revision,
           revocation.revoked_at AS "revokedAt", consumption.consumed_at AS "consumedAt"
      FROM crm_search_change_approvals approval
      LEFT JOIN crm_search_change_approval_revocations revocation ON revocation.approval_id = approval.id
      LEFT JOIN crm_search_change_approval_consumptions consumption ON consumption.approval_id = approval.id
     WHERE approval.organisation_scope_id = $1::UUID
     ORDER BY approval.issued_at DESC
     LIMIT 200
  `, [organisationScopeId])
  return rows.map((row) => {
    const integerFields = [
      'maximumCostUsdMicros', 'activeVectorCount', 'candidateVectorCount',
      'retiringVectorCount', 'sentinelVectorCount', 'deletionPendingVectorCount',
      'forecastVectorCount', 'vectorCapacity', 'activeNamespaceCount',
      'candidateNamespaceCount', 'retiringNamespaceCount', 'sentinelNamespaceCount',
      'deletionPendingNamespaceCount', 'forecastNamespaceCount', 'namespaceCapacity',
      'expectedControlRevision', 'expectedPolicyRevision'
    ] as const
    const normalized = { ...row }
    for (const field of integerFields) {
      if (row[field] === null || row[field] === undefined) continue
      const numeric = Number(row[field])
      if (!Number.isSafeInteger(numeric) || numeric < 0) fail('crm_search_approval_read_invalid')
      normalized[field] = numeric
    }
    const maximumCostUsdMicros = Number(normalized.maximumCostUsdMicros)
    const approvalRevision = Number(row.revision)
    if (!Number.isSafeInteger(maximumCostUsdMicros) || maximumCostUsdMicros < 0
      || !Number.isSafeInteger(approvalRevision) || approvalRevision < 0) {
      fail('crm_search_approval_read_invalid')
    }
    return { ...normalized, maximumCostUsdMicros, revision: approvalRevision }
  })
}
