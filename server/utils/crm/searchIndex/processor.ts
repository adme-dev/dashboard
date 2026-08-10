import {
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_MAX_INPUT_TOKENS,
  CRM_SEARCH_VECTOR_DIMENSIONS,
  type CrmSearchEntityType,
  type CrmSearchExactTokenizer
} from './contracts'
import { buildCrmSearchDocument } from './documents'
import {
  admitCrmSearchOperation,
  claimCrmSearchOperation,
  convertCrmSearchOperationToDelete,
  markCrmSearchProviderAttemptAmbiguous,
  markCrmSearchProviderAttemptSent,
  recordCrmSearchProviderAcceptance
} from './operationRepository'
import {
  createCrmSearchProvider,
  resolveCrmSearchProviderRuntime,
  type CrmSearchProviderRuntime
} from './provider'
import {
  affectedRows,
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  requireSafeInteger,
  requireUuid,
  type CrmSearchTransactionClient
} from './repository'
import { requireCrmSearchProviderAuthority } from './policyRepository'
import { reserveCrmSearchUsage, settleCrmSearchUsage } from './usageRepository'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const providerIdPattern = /^[A-Za-z0-9_-]{1,64}$/
const schemaPattern = /^crm-search-v[1-9][0-9]{0,5}$/
const digestPattern = /^[a-f0-9]{64}$/
const hmacPattern = /^hmac-sha256:[a-f0-9]{64}$/

interface CrmSearchProcessorOperation {
  id: string
  organisationScopeId: string
  clientId: string
  entityType: CrmSearchEntityType
  entityId: string
  schemaVersion: string
  sourceRevision: number
  sourceEventSequence: number
  desiredAction: 'upsert' | 'delete'
  vectorId: string
  namespace: string
  contentHash: string | null
  confirmationTag: string | null
  confirmationKeyVersion: string | null
  controlRevision: number
  state: string
  leaseToken: string
  leaseGeneration: number
}

interface CrmSearchCurrentSource {
  exists: boolean
  deleted: boolean
  clientId?: string
  revision: number
  eventSequence: number
  document?: {
    canonicalText: string
    providerInput: string
    contentHash: string
  }
}

interface CrmSearchProcessorContext {
  source: CrmSearchCurrentSource
  schemaRole: 'active' | 'candidate' | 'retiring'
  canonicalNamespace: string
  teardownId: string | null
  documentAlreadyCurrent: boolean
}

interface ProviderAdmission {
  providerAttemptId: string
  reservationId: string
  controlRevision: number
}

interface PriorProviderAttempt {
  status: string
  provider: 'workers_ai' | 'vectorize'
  providerCallSent: boolean
  reservationState: string
  providerAttemptId: string
  reservationId: string
}

export interface CrmSearchProviderCallGuardInput {
  organisationScopeId: string
  clientId: string
  provider: 'workers_ai' | 'vectorize'
  action: 'upsert' | 'delete'
  schemaVersion: string
  teardownId: string | null
}

export interface CrmSearchProcessorDependencies {
  correlationId: string
  claimOperation(operationId: string): Promise<CrmSearchProcessorOperation | null>
  loadCurrentContext(operation: CrmSearchProcessorOperation): Promise<CrmSearchProcessorContext>
  convertOperationToDelete(input: {
    operationId: string
    sourceRevision: number
    sourceEventSequence: number
    leaseToken: string
    leaseGeneration: number
  }): Promise<void>
  withProviderCallGuard<Result>(
    input: CrmSearchProviderCallGuardInput,
    callback: () => Promise<Result>
  ): Promise<Result>
  admitProviderCall(input: {
    operationId: string
    correlationId: string
    organisationScopeId: string
    clientId: string
    provider: 'workers_ai' | 'vectorize'
    action: 'upsert' | 'delete'
    schemaVersion: string
    teardownId: string | null
    modelInputTokens: number
    insertedDimensions: number
    storedDimensions: number
    leaseToken: string
    leaseGeneration: number
  }): Promise<ProviderAdmission>
  admitOperation(input: {
    operationId: string
    expectedState: 'processing' | 'retryable'
    expectedControlRevision: number
    leaseToken: string
    leaseGeneration: number
  }): Promise<void>
  settleProviderCall(input: {
    operationId: string
    provider: 'workers_ai' | 'vectorize'
    providerAttemptId: string
    reservationId: string
    providerCallSent: boolean
    completionClass: 'completed' | 'failed' | 'released_no_call'
  }): Promise<void>
  markProviderCallSent(input: {
    operationId: string
    provider: 'workers_ai' | 'vectorize'
    providerAttemptId: string
    reservationId: string
    leaseToken: string
    leaseGeneration: number
  }): Promise<void>
  recordProviderAcceptance(input: {
    operationId: string
    action: 'upsert' | 'delete'
    providerAttemptId: string
    reservationId: string
    mutationId: string
    controlRevision: number
    leaseToken: string
    leaseGeneration: number
  }): Promise<void>
  markCompleteNoop(input: CrmSearchProcessorOperation & { reason: 'document_current' }): Promise<void>
  markSuperseded(input: CrmSearchProcessorOperation & { reason: string }): Promise<void>
  returnToRetryable(input: {
    operationId: string
    leaseToken: string
    leaseGeneration: number
    errorClass: string
    providerCallSent: boolean
  }): Promise<void>
  markAmbiguousProviderOutcome(input: {
    operationId: string
    provider: 'workers_ai' | 'vectorize'
    providerAttemptId: string
    reservationId: string
    providerCallSent: true
  }): Promise<void>
  loadProviderAttempt(input: {
    operationId: string
    leaseToken: string
    leaseGeneration: number
  }): Promise<PriorProviderAttempt | null>
  markIndexed(input: unknown): Promise<void>
}

export type CrmSearchProcessorResult
  = | { status: 'complete' }
    | { status: 'accepted_provider_pending' }
    | { status: 'superseded' }

function fail(code: string): never {
  throw new Error(code)
}

function validOperation(value: CrmSearchProcessorOperation | null, operationId: string): value is CrmSearchProcessorOperation {
  if (!value || value.id !== operationId || !uuidPattern.test(value.id)
    || !uuidPattern.test(value.organisationScopeId) || !uuidPattern.test(value.clientId)
    || !CRM_SEARCH_ENTITY_TYPES.includes(value.entityType) || !uuidPattern.test(value.entityId)
    || !schemaPattern.test(value.schemaVersion)
    || !Number.isSafeInteger(value.sourceRevision) || value.sourceRevision < 1
    || !Number.isSafeInteger(value.sourceEventSequence) || value.sourceEventSequence < 1
    || !['upsert', 'delete'].includes(value.desiredAction)
    || !providerIdPattern.test(value.vectorId) || !providerIdPattern.test(value.namespace)
    || !Number.isSafeInteger(value.controlRevision)
    || !['processing', 'retryable', 'admitted'].includes(value.state)
    || !uuidPattern.test(value.leaseToken)
    || !Number.isSafeInteger(value.leaseGeneration) || value.leaseGeneration < 1) return false
  return value.desiredAction === 'upsert'
    ? typeof value.contentHash === 'string' && digestPattern.test(value.contentHash)
    && typeof value.confirmationTag === 'string' && hmacPattern.test(value.confirmationTag)
    && typeof value.confirmationKeyVersion === 'string'
    && value.confirmationKeyVersion.length >= 1 && value.confirmationKeyVersion.length <= 80
    : value.contentHash === null && value.confirmationTag === null
      && value.confirmationKeyVersion === null
}

function validContext(value: CrmSearchProcessorContext): boolean {
  const source = value?.source
  return !!source
    && typeof source.exists === 'boolean'
    && typeof source.deleted === 'boolean'
    && Number.isSafeInteger(source.revision) && source.revision >= 1
    && Number.isSafeInteger(source.eventSequence) && source.eventSequence >= 1
    && (source.clientId === undefined || uuidPattern.test(source.clientId))
    && ['active', 'candidate', 'retiring'].includes(value.schemaRole)
    && providerIdPattern.test(value.canonicalNamespace)
    && (value.teardownId === null || uuidPattern.test(value.teardownId))
    && typeof value.documentAlreadyCurrent === 'boolean'
}

function errorClass(error: unknown): string {
  const code = error && typeof error === 'object' && typeof (error as Record<string, unknown>).code === 'string'
    ? String((error as Record<string, unknown>).code)
    : error instanceof Error ? error.message : 'provider_failure'
  return code.replace(/^crm_search_/, '').replace(/[^a-z0-9_]/g, '_').slice(0, 120)
    || 'provider_failure'
}

function validateAdmission(value: ProviderAdmission): ProviderAdmission {
  if (!value || typeof value.providerAttemptId !== 'string' || value.providerAttemptId.length < 1
    || value.providerAttemptId.length > 256 || !uuidPattern.test(value.reservationId)
    || !Number.isSafeInteger(value.controlRevision)) fail('crm_search_provider_admission_invalid')
  return value
}

async function retryable(
  operation: CrmSearchProcessorOperation,
  error: unknown,
  providerCallSent: boolean,
  dependencies: CrmSearchProcessorDependencies
): Promise<never> {
  await dependencies.returnToRetryable({
    operationId: operation.id,
    leaseToken: operation.leaseToken,
    leaseGeneration: operation.leaseGeneration,
    errorClass: errorClass(error),
    providerCallSent
  })
  throw error
}

async function settle(
  operation: CrmSearchProcessorOperation,
  provider: 'workers_ai' | 'vectorize',
  admission: ProviderAdmission,
  completionClass: 'completed' | 'failed',
  dependencies: CrmSearchProcessorDependencies
): Promise<void> {
  await dependencies.settleProviderCall({
    operationId: operation.id,
    provider,
    providerAttemptId: admission.providerAttemptId,
    reservationId: admission.reservationId,
    providerCallSent: true,
    completionClass
  })
}

async function release(
  operation: CrmSearchProcessorOperation,
  provider: 'workers_ai' | 'vectorize',
  admission: ProviderAdmission,
  dependencies: CrmSearchProcessorDependencies
): Promise<void> {
  await dependencies.settleProviderCall({
    operationId: operation.id,
    provider,
    providerAttemptId: admission.providerAttemptId,
    reservationId: admission.reservationId,
    providerCallSent: false,
    completionClass: 'released_no_call'
  })
}

async function guardedProviderCall<Result>(
  operation: CrmSearchProcessorOperation,
  input: Omit<CrmSearchProviderCallGuardInput, 'organisationScopeId' | 'clientId' | 'schemaVersion'>,
  dependencies: CrmSearchProcessorDependencies,
  callback: () => Promise<Result>
): Promise<Result> {
  let callbackStarted = false
  try {
    return await dependencies.withProviderCallGuard({
      organisationScopeId: operation.organisationScopeId,
      clientId: operation.clientId,
      schemaVersion: operation.schemaVersion,
      ...input
    }, async () => {
      callbackStarted = true
      return callback()
    })
  } catch (error) {
    if (callbackStarted) throw error
    return retryable(operation, error, false, dependencies)
  }
}

export async function processCrmSearchOperation(
  operationId: string,
  runtime: CrmSearchProviderRuntime,
  dependencies: CrmSearchProcessorDependencies
): Promise<CrmSearchProcessorResult> {
  if (!uuidPattern.test(operationId) || !uuidPattern.test(dependencies?.correlationId)) {
    fail('crm_search_invalid_operation')
  }
  const claimedOperation = await dependencies.claimOperation(operationId)
  if (!validOperation(claimedOperation, operationId)) fail('crm_search_operation_unavailable')
  let operation = claimedOperation

  const priorAttempt = await dependencies.loadProviderAttempt({
    operationId,
    leaseToken: operation.leaseToken,
    leaseGeneration: operation.leaseGeneration
  })
  if (priorAttempt?.provider === 'vectorize'
    && priorAttempt.providerCallSent === true
    && ['ambiguous', 'accepted', 'charged'].includes(priorAttempt.status)) {
    return { status: 'accepted_provider_pending' }
  }
  if (priorAttempt?.provider === 'workers_ai' && priorAttempt.providerCallSent === true
    && ['sent', 'ambiguous'].includes(priorAttempt.status)) {
    if (typeof priorAttempt.providerAttemptId !== 'string'
      || typeof priorAttempt.reservationId !== 'string') {
      fail('crm_search_provider_attempt_invalid')
    }
    if (priorAttempt.status === 'sent') {
      await dependencies.markAmbiguousProviderOutcome({
        operationId,
        provider: 'workers_ai',
        providerAttemptId: priorAttempt.providerAttemptId,
        reservationId: priorAttempt.reservationId,
        providerCallSent: true
      })
    }
    await dependencies.settleProviderCall({
      operationId,
      provider: 'workers_ai',
      providerAttemptId: priorAttempt.providerAttemptId,
      reservationId: priorAttempt.reservationId,
      providerCallSent: true,
      completionClass: 'failed'
    })
    return retryable(
      operation,
      new Error('crm_search_workers_ai_attempt_ambiguous'),
      true,
      dependencies
    )
  }

  const context = await dependencies.loadCurrentContext(operation)
  if (!validContext(context) || context.canonicalNamespace !== operation.namespace) {
    return retryable(operation, new Error('crm_search_current_context_invalid'), false, dependencies)
  }
  const sourceMoved = !!context.source.clientId && context.source.clientId !== operation.clientId
  const requiresDelete = sourceMoved || !context.source.exists || context.source.deleted
  if (requiresDelete && operation.desiredAction === 'upsert') {
    try {
      await dependencies.convertOperationToDelete({
        operationId: operation.id,
        sourceRevision: operation.sourceRevision,
        sourceEventSequence: operation.sourceEventSequence,
        leaseToken: operation.leaseToken,
        leaseGeneration: operation.leaseGeneration
      })
      operation = {
        ...operation,
        desiredAction: 'delete',
        contentHash: null,
        confirmationTag: null,
        confirmationKeyVersion: null
      }
    } catch (error) {
      return retryable(operation, error, false, dependencies)
    }
  }
  if (!requiresDelete && context.schemaRole === 'retiring') {
    await dependencies.markSuperseded({ ...operation, reason: 'schema_retiring' })
    return { status: 'superseded' }
  }
  if (!requiresDelete && (context.source.revision > operation.sourceRevision
    || context.source.eventSequence > operation.sourceEventSequence)) {
    await dependencies.markSuperseded({ ...operation, reason: 'newer_source_intent' })
    return { status: 'superseded' }
  }
  const action: 'upsert' | 'delete' = requiresDelete ? 'delete' : operation.desiredAction
  if (action === 'upsert' && context.documentAlreadyCurrent) {
    await dependencies.markCompleteNoop({ ...operation, reason: 'document_current' })
    return { status: 'complete' }
  }

  const provider = createCrmSearchProvider(runtime)
  let embedding: number[] | null = null
  if (action === 'upsert') {
    const document = context.source.document
    if (!document || typeof document.providerInput !== 'string'
      || !digestPattern.test(document.contentHash)
      || document.contentHash !== operation.contentHash) {
      return retryable(operation, new Error('crm_search_document_changed'), false, dependencies)
    }
    embedding = await guardedProviderCall(operation, {
      provider: 'workers_ai',
      action,
      teardownId: null
    }, dependencies, async () => {
      let admission: ProviderAdmission
      try {
        admission = validateAdmission(await dependencies.admitProviderCall({
          operationId,
          correlationId: dependencies.correlationId,
          organisationScopeId: operation.organisationScopeId,
          clientId: operation.clientId,
          provider: 'workers_ai',
          action,
          schemaVersion: operation.schemaVersion,
          teardownId: null,
          modelInputTokens: CRM_SEARCH_MAX_INPUT_TOKENS,
          insertedDimensions: 0,
          storedDimensions: 0,
          leaseToken: operation.leaseToken,
          leaseGeneration: operation.leaseGeneration
        }))
      } catch (error) {
        return retryable(operation, error, false, dependencies)
      }
      try {
        await dependencies.markProviderCallSent({
          operationId,
          provider: 'workers_ai',
          providerAttemptId: admission.providerAttemptId,
          reservationId: admission.reservationId,
          leaseToken: operation.leaseToken,
          leaseGeneration: operation.leaseGeneration
        })
      } catch (error) {
        await release(operation, 'workers_ai', admission, dependencies)
        return retryable(operation, error, false, dependencies)
      }
      let providerEmbedding: number[]
      try {
        providerEmbedding = await provider.embedDocument(document.providerInput)
      } catch (error) {
        try {
          await dependencies.markAmbiguousProviderOutcome({
            operationId,
            provider: 'workers_ai',
            providerAttemptId: admission.providerAttemptId,
            reservationId: admission.reservationId,
            providerCallSent: true
          })
        } catch {
          return retryable(operation, error, true, dependencies)
        }
        await settle(operation, 'workers_ai', admission, 'failed', dependencies)
        return retryable(operation, error, true, dependencies)
      }
      try {
        await settle(operation, 'workers_ai', admission, 'completed', dependencies)
      } catch {
        await dependencies.markAmbiguousProviderOutcome({
          operationId,
          provider: 'workers_ai',
          providerAttemptId: admission.providerAttemptId,
          reservationId: admission.reservationId,
          providerCallSent: true
        })
        // The embedding remains in this invocation; the prior call is retained as
        // charged and is not replayed before the next provider admission.
      }
      return providerEmbedding
    })
  }

  return guardedProviderCall(operation, {
    provider: 'vectorize',
    action,
    teardownId: action === 'delete' ? context.teardownId : null
  }, dependencies, async () => {
    let vectorAdmission: ProviderAdmission
    try {
      vectorAdmission = validateAdmission(await dependencies.admitProviderCall({
        operationId,
        correlationId: dependencies.correlationId,
        organisationScopeId: operation.organisationScopeId,
        clientId: operation.clientId,
        provider: 'vectorize',
        action,
        schemaVersion: operation.schemaVersion,
        teardownId: action === 'delete' ? context.teardownId : null,
        modelInputTokens: 0,
        insertedDimensions: action === 'upsert' ? CRM_SEARCH_VECTOR_DIMENSIONS : 0,
        storedDimensions: action === 'upsert' ? CRM_SEARCH_VECTOR_DIMENSIONS : 0,
        leaseToken: operation.leaseToken,
        leaseGeneration: operation.leaseGeneration
      }))
    } catch (error) {
      return retryable(operation, error, false, dependencies)
    }
    try {
      await dependencies.admitOperation({
        operationId,
        expectedState: operation.state === 'retryable' ? 'retryable' : 'processing',
        expectedControlRevision: vectorAdmission.controlRevision,
        leaseToken: operation.leaseToken,
        leaseGeneration: operation.leaseGeneration
      })
    } catch (error) {
      await release(operation, 'vectorize', vectorAdmission, dependencies)
      return retryable(operation, error, false, dependencies)
    }
    try {
      await dependencies.markProviderCallSent({
        operationId,
        provider: 'vectorize',
        providerAttemptId: vectorAdmission.providerAttemptId,
        reservationId: vectorAdmission.reservationId,
        leaseToken: operation.leaseToken,
        leaseGeneration: operation.leaseGeneration
      })
    } catch (error) {
      await release(operation, 'vectorize', vectorAdmission, dependencies)
      return retryable(operation, error, false, dependencies)
    }

    let mutationId: string
    try {
      const result = action === 'upsert'
        ? await provider.upsertVector({
            id: operation.vectorId,
            namespace: operation.namespace,
            values: embedding!,
            metadata: {
              entityType: operation.entityType,
              schemaVersion: operation.schemaVersion,
              sourceRevision: operation.sourceRevision,
              confirmationTag: operation.confirmationTag!,
              confirmationKeyVersion: operation.confirmationKeyVersion!
            }
          })
        : await provider.deleteVector(operation.vectorId)
      mutationId = result.mutationId
    } catch {
      await dependencies.markAmbiguousProviderOutcome({
        operationId,
        provider: 'vectorize',
        providerAttemptId: vectorAdmission.providerAttemptId,
        reservationId: vectorAdmission.reservationId,
        providerCallSent: true
      })
      await settle(operation, 'vectorize', vectorAdmission, 'failed', dependencies)
      return { status: 'accepted_provider_pending' }
    }
    try {
      await dependencies.recordProviderAcceptance({
        operationId,
        action,
        providerAttemptId: vectorAdmission.providerAttemptId,
        reservationId: vectorAdmission.reservationId,
        mutationId,
        controlRevision: vectorAdmission.controlRevision,
        leaseToken: operation.leaseToken,
        leaseGeneration: operation.leaseGeneration
      })
    } catch {
      await dependencies.markAmbiguousProviderOutcome({
        operationId,
        provider: 'vectorize',
        providerAttemptId: vectorAdmission.providerAttemptId,
        reservationId: vectorAdmission.reservationId,
        providerCallSent: true
      })
    }
    await settle(operation, 'vectorize', vectorAdmission, 'completed', dependencies)
    return { status: 'accepted_provider_pending' }
  })
}

export interface CrmSearchProcessRequestInput {
  operationId: string
  correlationId: string
  protocolVersion: 1
}

export interface CrmSearchDefaultProcessorOptions {
  tokenizer?: CrmSearchExactTokenizer | null
  now?: () => string
  leaseSeconds?: number
}

function resolveExactTokenizer(event: unknown): CrmSearchExactTokenizer | null {
  if (!event || typeof event !== 'object') return null
  const context = (event as Record<string, unknown>).context
  if (!context || typeof context !== 'object') return null
  const tokenizer = (context as Record<string, unknown>).crmSearchExactTokenizer
  if (!tokenizer || typeof tokenizer !== 'object'
    || typeof (tokenizer as Record<string, unknown>).revision !== 'string'
    || typeof (tokenizer as Record<string, unknown>).encode !== 'function') return null
  return tokenizer as CrmSearchExactTokenizer
}

export async function reserveCrmSearchProcessRequest(
  input: CrmSearchProcessRequestInput,
  dependencies: { queryOneFresh?: typeof crmSearchRepositoryDependencies.queryOneFresh } = {}
): Promise<
  | { status: 'reserved' }
  | { status: 'in_progress' }
  | { status: 'replay', outcome: CrmSearchProcessorResult }
> {
  const operationId = requireUuid(input.operationId, 'crm_search_invalid_process_request')
  requireUuid(input.correlationId, 'crm_search_invalid_process_request')
  if (input.protocolVersion !== 1) throw crmSearchRepositoryError('crm_search_invalid_process_request')
  const read = dependencies.queryOneFresh ?? crmSearchRepositoryDependencies.queryOneFresh
  const row = await read(`
    SELECT state, lease_expires_at
    FROM crm_search_operations
    WHERE id = $1
  `, [operationId])
  if (!row) return { status: 'in_progress' }
  if (row.state === 'confirmed') return { status: 'replay', outcome: { status: 'complete' } }
  if (row.state === 'superseded' || row.state === 'terminal_dead_letter') {
    return { status: 'replay', outcome: { status: 'superseded' } }
  }
  if (row.state === 'provider_pending') {
    return { status: 'replay', outcome: { status: 'accepted_provider_pending' } }
  }
  if (['processing', 'admitted'].includes(String(row.state))
    && row.lease_expires_at !== null
    && Date.parse(String(row.lease_expires_at)) > Date.now()) return { status: 'in_progress' }
  return ['pending_transport', 'queued', 'retryable'].includes(String(row.state))
    ? { status: 'reserved' }
    : { status: 'in_progress' }
}

function sourceProjectionSql(entityType: CrmSearchEntityType): string {
  if (entityType === 'person') return `
    SELECT client_id, search_revision, deleted_at,
           first_name, last_name, job_title, department, lifecycle_stage
    FROM crm_people WHERE id = $1
  `
  if (entityType === 'company') return `
    SELECT client_id, search_revision, deleted_at, name, domain, lifecycle_stage
    FROM crm_companies WHERE id = $1
  `
  return `
    SELECT client_id, search_revision, deleted_at, name, status, source
    FROM crm_opportunities WHERE id = $1
  `
}

function sourceFields(entityType: CrmSearchEntityType, row: Record<string, unknown>) {
  if (entityType === 'person') return {
    first_name: row.first_name, last_name: row.last_name, job_title: row.job_title,
    department: row.department, lifecycle_stage: row.lifecycle_stage
  }
  if (entityType === 'company') return {
    name: row.name, domain: row.domain, lifecycle_stage: row.lifecycle_stage
  }
  return { name: row.name, status: row.status, source: row.source }
}

export async function withCrmSearchProviderCallGuard<Result>(
  input: CrmSearchProviderCallGuardInput,
  callback: () => Promise<Result>,
  dependencies: {
    transactionWithoutRetry?: typeof crmSearchRepositoryDependencies.transactionWithoutRetry
  } = {}
): Promise<Result> {
  if (!input || !uuidPattern.test(input.organisationScopeId)
    || !uuidPattern.test(input.clientId)
    || !['workers_ai', 'vectorize'].includes(input.provider)
    || !['upsert', 'delete'].includes(input.action)
    || (input.provider === 'workers_ai' && input.action !== 'upsert')
    || !schemaPattern.test(input.schemaVersion)
    || (input.teardownId !== null && !uuidPattern.test(input.teardownId))
    || typeof callback !== 'function') {
    throw crmSearchRepositoryError('crm_search_provider_disabled')
  }
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  return run(async (transaction) => {
    await requireCrmSearchProviderAuthority({
      organisationScopeId: input.organisationScopeId,
      clientId: input.clientId,
      action: input.action,
      schemaVersion: input.schemaVersion,
      infrastructureReady: true,
      ...(input.teardownId === null ? {} : { teardownId: input.teardownId })
    }, transaction)
    return callback()
  })
}

export function createDefaultCrmSearchProcessorDependencies(
  correlationId: string,
  options: CrmSearchDefaultProcessorOptions = {}
): CrmSearchProcessorDependencies {
  const canonicalCorrelationId = requireUuid(correlationId, 'crm_search_invalid_process_request')
  const now = options.now ?? (() => new Date().toISOString())
  const leaseSeconds = options.leaseSeconds ?? 60
  const tokenizer = options.tokenizer ?? null
  return {
    correlationId: canonicalCorrelationId,
    async claimOperation(operationId) {
      const claimed = await claimCrmSearchOperation({ operationId, leaseSeconds, now: now() })
      if (!claimed?.leaseToken) return null
      return {
        ...claimed,
        leaseToken: claimed.leaseToken
      }
    },
    async loadCurrentContext(operation) {
      return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
        await transaction.query(`
          SELECT pg_catalog.pg_advisory_xact_lock_shared(
            crm_search_client_advisory_lock_key($1, $2)
          )
        `, [operation.organisationScopeId, operation.clientId])
        const authority = firstRow(await transaction.query(`
          SELECT namespace.namespace,
                 policy.active_schema_version,
                 policy.candidate_schema_version,
                 policy.retiring_schema_versions,
                 schema.tokenizer_revision,
                 teardown.id AS teardown_id,
                 document.source_revision AS document_source_revision,
                 document.source_event_sequence AS document_source_event_sequence,
                 document.content_hash AS document_content_hash,
                 document.confirmation_state AS document_confirmation_state
          FROM crm_search_namespaces namespace
          LEFT JOIN crm_search_policies policy
            ON policy.organisation_scope_id = namespace.organisation_scope_id
           AND policy.client_id = namespace.client_id
          LEFT JOIN crm_search_schema_versions schema
            ON schema.organisation_scope_id = namespace.organisation_scope_id
           AND schema.schema_version = $3
          LEFT JOIN crm_search_client_teardowns teardown
            ON teardown.organisation_scope_id = namespace.organisation_scope_id
           AND teardown.client_id = namespace.client_id
           AND teardown.state IN ('pending', 'deleting', 'provider_pending', 'failed')
          LEFT JOIN crm_search_documents document
            ON document.organisation_scope_id = namespace.organisation_scope_id
           AND document.client_id = namespace.client_id
           AND document.entity_type = $4
           AND document.entity_id = $5
           AND document.schema_version = $3
          WHERE namespace.organisation_scope_id = $1
            AND namespace.client_id = $2
        `, [operation.organisationScopeId, operation.clientId, operation.schemaVersion,
          operation.entityType, operation.entityId]))
        if (!authority || typeof authority.namespace !== 'string') {
          throw crmSearchRepositoryError('crm_search_current_context_invalid')
        }
        const source = firstRow(await transaction.query(
          sourceProjectionSql(operation.entityType),
          [operation.entityId]
        ))
        const dirty = firstRow(await transaction.query(`
          SELECT event_sequence
          FROM crm_search_source_dirty
          WHERE organisation_scope_id = $1 AND client_id = $2
            AND entity_type = $3 AND entity_id = $4
        `, [operation.organisationScopeId, operation.clientId,
          operation.entityType, operation.entityId]))
        const revision = source
          ? requireSafeInteger(source.search_revision, 'crm_search_current_context_invalid', { minimum: 1 })
          : operation.sourceRevision
        const eventSequence = dirty
          ? requireSafeInteger(dirty.event_sequence, 'crm_search_current_context_invalid', { minimum: 1 })
          : operation.sourceEventSequence
        let document: CrmSearchCurrentSource['document']
        if (source && source.deleted_at === null && tokenizer) {
          const expectedTokenizerRevision = String(authority.tokenizer_revision ?? '')
          document = await buildCrmSearchDocument({
            entityType: operation.entityType,
            source: sourceFields(operation.entityType, source)
          }, { tokenizer, expectedTokenizerRevision })
        }
        const active = authority.active_schema_version === operation.schemaVersion
        const candidate = authority.candidate_schema_version === operation.schemaVersion
        const retiring = Array.isArray(authority.retiring_schema_versions)
          && authority.retiring_schema_versions.includes(operation.schemaVersion)
        const schemaRole = active
          ? 'active'
          : candidate
            ? 'candidate'
            : retiring
              ? 'retiring'
              : authority.teardown_id ? 'retiring' : null
        if (!schemaRole) throw crmSearchRepositoryError('crm_search_current_context_invalid')
        return {
          source: {
            exists: !!source,
            deleted: !source || source.deleted_at !== null,
            ...(source ? { clientId: requireUuid(source.client_id, 'crm_search_current_context_invalid') } : {}),
            revision,
            eventSequence,
            ...(document ? { document } : {})
          },
          schemaRole,
          canonicalNamespace: String(authority.namespace),
          teardownId: authority.teardown_id === null
            ? null
            : requireUuid(authority.teardown_id, 'crm_search_current_context_invalid'),
          documentAlreadyCurrent: !!document
            && authority.document_confirmation_state === 'indexed'
            && Number(authority.document_source_revision) === revision
            && Number(authority.document_source_event_sequence) === eventSequence
            && authority.document_content_hash === document.contentHash
        }
      })
    },
    async convertOperationToDelete(input) {
      await convertCrmSearchOperationToDelete(input)
    },
    async withProviderCallGuard(input, callback) {
      return withCrmSearchProviderCallGuard(input, callback)
    },
    async admitProviderCall(input) {
      const sequenceRow = await crmSearchRepositoryDependencies.queryOneFresh(`
        SELECT COALESCE(MAX(attempt_sequence), 0) + 1 AS next_sequence
        FROM crm_search_provider_attempts
        WHERE operation_id = $1 AND provider = $2
      `, [input.operationId, input.provider])
      const providerAttemptSequence = requireSafeInteger(
        sequenceRow?.next_sequence,
        'crm_search_provider_admission_invalid',
        { minimum: 1, maximum: 1000 }
      )
      const reservation = await reserveCrmSearchUsage({
        organisationScopeId: input.organisationScopeId,
        clientId: input.clientId,
        correlationId: input.correlationId,
        operationId: input.operationId,
        usageKind: 'indexing',
        provider: input.provider,
        providerAction: input.action,
        surface: null,
        schemaVersion: input.schemaVersion,
        teardownId: input.teardownId,
        reservationAt: now(),
        providerCalls: 1,
        modelInputTokens: input.modelInputTokens,
        queryDimensions: 0,
        insertedDimensions: input.insertedDimensions,
        storedDimensions: input.storedDimensions,
        providerAttemptId: crypto.randomUUID(),
        providerAttemptSequence,
        expectedLeaseGeneration: input.leaseGeneration
      })
      return {
        providerAttemptId: reservation.providerAttemptId,
        reservationId: reservation.id,
        controlRevision: reservation.controlRevision
      }
    },
    async admitOperation(input) {
      await crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
        await admitCrmSearchOperation(input, transaction)
      })
    },
    async markProviderCallSent(input) {
      await markCrmSearchProviderAttemptSent({
        operationId: input.operationId,
        providerAttemptId: input.providerAttemptId,
        leaseToken: input.leaseToken,
        leaseGeneration: input.leaseGeneration
      })
    },
    async settleProviderCall(input) {
      await settleCrmSearchUsage({
        reservationId: input.reservationId,
        providerCallSent: input.providerCallSent,
        completion: input.completionClass
      })
    },
    async recordProviderAcceptance(input) {
      await recordCrmSearchProviderAcceptance(input)
    },
    async markCompleteNoop(input) {
      await finishOperation({
        operationId: input.id,
        leaseToken: input.leaseToken,
        leaseGeneration: input.leaseGeneration
      }, 'superseded', null)
    },
    async markSuperseded(input) {
      await finishOperation({
        operationId: input.id,
        leaseToken: input.leaseToken,
        leaseGeneration: input.leaseGeneration
      }, 'superseded', input.reason)
    },
    async returnToRetryable(input) {
      await finishOperation(input, 'retryable', input.errorClass)
    },
    async markAmbiguousProviderOutcome(input) {
      const claimed = await crmSearchRepositoryDependencies.queryOneFresh(`
        SELECT lease_token, lease_generation
        FROM crm_search_operations WHERE id = $1
      `, [input.operationId])
      if (!claimed) throw crmSearchRepositoryError('crm_search_provider_attempt_changed')
      await markCrmSearchProviderAttemptAmbiguous({
        operationId: input.operationId,
        providerAttemptId: input.providerAttemptId,
        reservationId: input.reservationId,
        leaseToken: requireUuid(claimed.lease_token, 'crm_search_provider_attempt_changed'),
        leaseGeneration: requireSafeInteger(claimed.lease_generation,
          'crm_search_provider_attempt_changed', { minimum: 1 })
      })
    },
    async loadProviderAttempt(input) {
      const row = await crmSearchRepositoryDependencies.queryOneFresh(`
        SELECT attempt.id AS provider_attempt_id, attempt.provider, attempt.state,
               attempt.provider_call_sent, reservation.id AS reservation_id,
               reservation.state AS reservation_state
        FROM crm_search_provider_attempts attempt
        JOIN crm_search_usage_reservations reservation
          ON reservation.provider_attempt_id = attempt.id
        JOIN crm_search_operations operation ON operation.id = attempt.operation_id
        WHERE attempt.operation_id = $1
          AND operation.lease_token = $2
          AND operation.lease_generation = $3
          AND attempt.state IN ('sent', 'accepted', 'ambiguous')
        ORDER BY attempt.created_at DESC, attempt.id DESC
        LIMIT 1
      `, [input.operationId, input.leaseToken, input.leaseGeneration])
      if (!row) return null
      return {
        status: String(row.state),
        provider: row.provider === 'workers_ai' ? 'workers_ai' : 'vectorize',
        providerCallSent: row.provider_call_sent === true,
        reservationState: String(row.reservation_state),
        providerAttemptId: requireUuid(row.provider_attempt_id, 'crm_search_provider_attempt_changed'),
        reservationId: requireUuid(row.reservation_id, 'crm_search_provider_attempt_changed')
      }
    },
    async markIndexed() {
      throw crmSearchRepositoryError('crm_search_reconciliation_only')
    }
  }
}

async function finishOperation(
  input: { operationId: string, leaseToken: string, leaseGeneration: number },
  state: 'retryable' | 'superseded',
  errorClass: string | null
): Promise<void> {
  await crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction: CrmSearchTransactionClient) => {
    const changed = await transaction.query(`
      UPDATE crm_search_operations
      SET state = $5, error_class = $6, next_attempt_at = NOW(),
          lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
      WHERE id = $1 AND lease_token = $2 AND lease_generation = $3
        AND state IN ('processing', 'admitted')
        AND $4::BOOLEAN = TRUE
    `, [input.operationId, input.leaseToken, input.leaseGeneration, true, state, errorClass])
    if (affectedRows(changed) !== 1) throw crmSearchRepositoryError('crm_search_operation_changed')
  })
}

export async function processCrmSearchOperationRequest(
  input: CrmSearchProcessRequestInput,
  event: unknown,
  options: CrmSearchDefaultProcessorOptions = {}
): Promise<CrmSearchProcessorResult> {
  const runtime = resolveCrmSearchProviderRuntime(event)
  if (!runtime) throw crmSearchRepositoryError('crm_search_provider_unavailable')
  const dependencies = createDefaultCrmSearchProcessorDependencies(input.correlationId, {
    ...options,
    tokenizer: options.tokenizer ?? resolveExactTokenizer(event)
  })
  return processCrmSearchOperation(input.operationId, runtime, dependencies)
}
