import { CRM_SEARCH_ENTITY_TYPES, type CrmSearchEntityType } from './contracts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const providerIdPattern = /^[A-Za-z0-9_-]{1,64}$/
const schemaPattern = /^crm-search-v[1-9][0-9]{0,5}$/

interface CrmSearchTeardownVector {
  entityType: CrmSearchEntityType
  entityId: string
  schemaVersion: string
  vectorId: string
  namespace: string
  sourceRevision: number
  deletionState: string
  confirmedAbsentAt?: string
}

interface CrmSearchTeardownSnapshot {
  id: string
  organisationScopeId: string
  clientId: string
  policyRevision: number
  namespace: string
  state: string
  providerDeletionState: string
  vectors: CrmSearchTeardownVector[]
}

export interface RequestCrmSearchClientTeardownInput {
  organisationScopeId: string
  clientId: string
  teardownId: string
  limit: number
  requestedAt: string
}

export interface RequestCrmSearchClientTeardownDependencies {
  loadGlobalControl(input: { organisationScopeId: string }): Promise<{ state: string, revision: number } | null>
  loadDurableTeardownSnapshot(input: RequestCrmSearchClientTeardownInput): Promise<CrmSearchTeardownSnapshot | null>
  createDeleteOperation(input: RequestCrmSearchClientTeardownInput & CrmSearchTeardownVector & {
    teardownId: string
    desiredAction: 'delete'
    contentHash: null
    controlRevision: number
  }): Promise<boolean>
  markTeardownDeleting(input: {
    teardownId: string
    expectedState: string
    controlRevision: number
    requestedAt: string
  }): Promise<boolean>
}

export interface FinalizeCrmSearchClientTeardownDependencies {
  loadTeardownProgress(input: { teardownId: string }): Promise<CrmSearchTeardownSnapshot | null>
  markTeardownConfirmed(input: {
    teardownId: string
    expectedState: string
    confirmedAt: string
  }): Promise<boolean>
  markNamespaceProviderEmpty(input: {
    organisationScopeId: string
    clientId: string
    namespace: string
    teardownId: string
    confirmedAt: string
  }): Promise<boolean>
}

function fail(): never {
  throw new Error('crm_search_teardown_not_authorized')
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function validVector(value: CrmSearchTeardownVector, namespace: string): boolean {
  return !!value
    && CRM_SEARCH_ENTITY_TYPES.includes(value.entityType)
    && uuidPattern.test(value.entityId)
    && schemaPattern.test(value.schemaVersion)
    && providerIdPattern.test(value.vectorId)
    && value.namespace === namespace
    && Number.isSafeInteger(value.sourceRevision)
    && value.sourceRevision >= 1
    && ['pending', 'provider_pending', 'confirmed_absent', 'failed'].includes(value.deletionState)
}

function validSnapshot(
  value: CrmSearchTeardownSnapshot | null,
  input?: RequestCrmSearchClientTeardownInput
): value is CrmSearchTeardownSnapshot {
  return !!value
    && uuidPattern.test(value.id)
    && uuidPattern.test(value.organisationScopeId)
    && uuidPattern.test(value.clientId)
    && providerIdPattern.test(value.namespace)
    && Number.isSafeInteger(value.policyRevision)
    && value.policyRevision >= 0
    && Array.isArray(value.vectors)
    && value.vectors.every(vector => validVector(vector, value.namespace))
    && (!input || (value.id === input.teardownId
      && value.organisationScopeId === input.organisationScopeId
      && value.clientId === input.clientId))
}

export async function requestCrmSearchClientTeardown(
  input: RequestCrmSearchClientTeardownInput,
  dependencies: RequestCrmSearchClientTeardownDependencies
): Promise<{
  teardownId: string
  vectorsScanned: number
  deleteOperationsCreated: number
  complete: false
}> {
  if (!input || !uuidPattern.test(input.organisationScopeId)
    || !uuidPattern.test(input.clientId) || !uuidPattern.test(input.teardownId)
    || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100
    || !isTimestamp(input.requestedAt)) fail()
  const control = await dependencies.loadGlobalControl({
    organisationScopeId: input.organisationScopeId
  })
  if (!control || !['enabled', 'delete_only'].includes(control.state)
    || !Number.isSafeInteger(control.revision)) fail()
  const snapshot = await dependencies.loadDurableTeardownSnapshot({ ...input })
  if (!validSnapshot(snapshot, input)
    || !['pending', 'deleting', 'provider_pending', 'failed'].includes(snapshot.state)) fail()
  const work = snapshot.vectors
    .filter(vector => vector.deletionState !== 'confirmed_absent')
    .slice(0, input.limit)
  let deleteOperationsCreated = 0
  for (const vector of work) {
    if (await dependencies.createDeleteOperation({
      ...input,
      ...vector,
      teardownId: snapshot.id,
      desiredAction: 'delete',
      contentHash: null,
      controlRevision: control.revision
    })) deleteOperationsCreated += 1
  }
  if (work.length > 0) {
    const changed = await dependencies.markTeardownDeleting({
      teardownId: snapshot.id,
      expectedState: snapshot.state,
      controlRevision: control.revision,
      requestedAt: input.requestedAt
    })
    if (changed !== true) fail()
  }
  return {
    teardownId: snapshot.id,
    vectorsScanned: work.length,
    deleteOperationsCreated,
    complete: false
  }
}

export async function finalizeCrmSearchClientTeardown(
  input: { teardownId: string, confirmedAt: string },
  dependencies: FinalizeCrmSearchClientTeardownDependencies
): Promise<{ teardownId: string, status: 'provider_pending' | 'confirmed_absent' }> {
  if (!input || !uuidPattern.test(input.teardownId) || !isTimestamp(input.confirmedAt)) fail()
  const snapshot = await dependencies.loadTeardownProgress({ teardownId: input.teardownId })
  if (!validSnapshot(snapshot) || snapshot.id !== input.teardownId) fail()
  const allAbsent = snapshot.vectors.every(vector => vector.deletionState === 'confirmed_absent'
    && isTimestamp(vector.confirmedAbsentAt))
  if (!allAbsent) return { teardownId: snapshot.id, status: 'provider_pending' }
  const marked = await dependencies.markTeardownConfirmed({
    teardownId: snapshot.id,
    expectedState: snapshot.state,
    confirmedAt: input.confirmedAt
  })
  if (marked !== true) fail()
  const emptied = await dependencies.markNamespaceProviderEmpty({
    organisationScopeId: snapshot.organisationScopeId,
    clientId: snapshot.clientId,
    namespace: snapshot.namespace,
    teardownId: snapshot.id,
    confirmedAt: input.confirmedAt
  })
  if (emptied !== true) fail()
  return { teardownId: snapshot.id, status: 'confirmed_absent' }
}
