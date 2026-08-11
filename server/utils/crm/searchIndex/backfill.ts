import {
  CRM_SEARCH_ENTITY_TYPES,
  type CrmSearchEntityType
} from './contracts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const providerIdPattern = /^[A-Za-z0-9_-]{1,64}$/
const schemaPattern = /^crm-search-v[1-9][0-9]{0,5}$/
const digestPattern = /^[a-f0-9]{64}$/

export interface ScheduleCrmSearchBackfillInput {
  organisationScopeId: string
  clientId: string
  candidateSchemaVersion: string
  expectedPolicyRevision: number
  approvalId: string
  limit: number
  requestedAt: string
}

interface BackfillAuthority {
  controlRevision: number
  policyRevision: number
  lifecycleState: string
  indexingEnabled: boolean
  activeSchemaVersion: string
  candidateSchemaVersion: string
  retiringSchemaVersions: string[]
  candidateMetadataIndexState: string
  candidateSentinelState: string
  namespace: string
  capacityReady: boolean
  approval: null | {
    id: string
    approvalType: string
    expectedPolicyRevision: number
    unexpired: boolean
    unrevoked: boolean
    maximumCostUsdMicros: number
  }
}

interface BackfillSource {
  entityType: CrmSearchEntityType
  entityId: string
  sourceRevision: number
  sourceEventSequence: number
  contentHash: string
}

export interface CrmSearchBackfillDependencies {
  loadBackfillAuthority(input: ScheduleCrmSearchBackfillInput): Promise<BackfillAuthority | null>
  listCurrentSources(input: {
    organisationScopeId: string
    clientId: string
    limit: number
  }): Promise<BackfillSource[]>
  createCandidateOperation(input: ScheduleCrmSearchBackfillInput & BackfillSource & {
    schemaVersion: string
    namespace: string
    desiredAction: 'upsert'
    controlRevision: number
  }): Promise<boolean>
  recordBackfillAudit(input: {
    organisationScopeId: string
    clientId: string
    approvalId: string
    candidateSchemaVersion: string
    expectedPolicyRevision: number
    controlRevision: number
    operationsCreated: number
    requestedAt: string
  }): Promise<boolean>
}

function fail(code: string): never {
  throw new Error(code)
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function validInput(input: ScheduleCrmSearchBackfillInput): boolean {
  return !!input
    && uuidPattern.test(input.organisationScopeId)
    && uuidPattern.test(input.clientId)
    && schemaPattern.test(input.candidateSchemaVersion)
    && Number.isSafeInteger(input.expectedPolicyRevision)
    && input.expectedPolicyRevision >= 0
    && uuidPattern.test(input.approvalId)
    && Number.isSafeInteger(input.limit)
    && input.limit >= 1
    && input.limit <= 100
    && validTimestamp(input.requestedAt)
}

function hasBackfillAuthority(
  authority: BackfillAuthority | null,
  input: ScheduleCrmSearchBackfillInput
): authority is BackfillAuthority {
  if (!authority || authority.lifecycleState !== 'indexing'
    || authority.indexingEnabled !== true
    || authority.policyRevision !== input.expectedPolicyRevision
    || authority.candidateSchemaVersion !== input.candidateSchemaVersion
    || authority.activeSchemaVersion === authority.candidateSchemaVersion
    || authority.candidateMetadataIndexState !== 'ready'
    || authority.candidateSentinelState !== 'confirmed_absent'
    || authority.capacityReady !== true
    || !providerIdPattern.test(authority.namespace)
    || !Number.isSafeInteger(authority.controlRevision)
    || !Array.isArray(authority.retiringSchemaVersions)
    || !authority.retiringSchemaVersions.every(value => schemaPattern.test(value))) return false
  const approval = authority.approval
  return !!approval
    && approval.id === input.approvalId
    && approval.approvalType === 'client_indexing'
    && approval.expectedPolicyRevision === input.expectedPolicyRevision
    && approval.unexpired === true
    && approval.unrevoked === true
    && Number.isSafeInteger(approval.maximumCostUsdMicros)
    && approval.maximumCostUsdMicros > 0
}

function requireSource(value: BackfillSource): BackfillSource {
  if (!value || !CRM_SEARCH_ENTITY_TYPES.includes(value.entityType)
    || !uuidPattern.test(value.entityId)
    || !Number.isSafeInteger(value.sourceRevision) || value.sourceRevision < 1
    || !Number.isSafeInteger(value.sourceEventSequence) || value.sourceEventSequence < 1
    || !digestPattern.test(value.contentHash)) fail('crm_search_invalid_backfill_source')
  return value
}

export async function scheduleCrmSearchBackfill(
  input: ScheduleCrmSearchBackfillInput,
  dependencies: CrmSearchBackfillDependencies
): Promise<{
  scanned: number
  operationsCreated: number
  candidateSchemaVersion: string
  complete: boolean
}> {
  if (!validInput(input) || !dependencies) fail('crm_search_backfill_not_authorized')
  const authority = await dependencies.loadBackfillAuthority({ ...input })
  if (authority?.retiringSchemaVersions?.length) {
    fail('crm_search_backfill_prior_retirement_pending')
  }
  if (!hasBackfillAuthority(authority, input)) fail('crm_search_backfill_not_authorized')

  const sources = await dependencies.listCurrentSources({
    organisationScopeId: input.organisationScopeId,
    clientId: input.clientId,
    limit: input.limit
  })
  if (!Array.isArray(sources) || sources.length > input.limit) {
    fail('crm_search_invalid_backfill_source')
  }
  let operationsCreated = 0
  for (const sourceValue of sources) {
    const source = requireSource(sourceValue)
    const created = await dependencies.createCandidateOperation({
      ...input,
      ...source,
      schemaVersion: input.candidateSchemaVersion,
      namespace: authority.namespace,
      desiredAction: 'upsert',
      controlRevision: authority.controlRevision
    })
    if (created === true) operationsCreated += 1
  }
  await dependencies.recordBackfillAudit({
    organisationScopeId: input.organisationScopeId,
    clientId: input.clientId,
    approvalId: input.approvalId,
    candidateSchemaVersion: input.candidateSchemaVersion,
    expectedPolicyRevision: input.expectedPolicyRevision,
    controlRevision: authority.controlRevision,
    operationsCreated,
    requestedAt: input.requestedAt
  })
  return {
    scanned: sources.length,
    operationsCreated,
    candidateSchemaVersion: input.candidateSchemaVersion,
    complete: sources.length < input.limit
  }
}
