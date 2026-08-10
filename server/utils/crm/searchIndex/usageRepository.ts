import {
  CRM_SEARCH_GLOBAL_STATES,
  CRM_SEARCH_MAX_INPUT_TOKENS,
  CRM_SEARCH_MODES,
  CRM_SEARCH_POLICY_STATES,
  CRM_SEARCH_PROVIDER_ACTIONS,
  CRM_SEARCH_SURFACES,
  CRM_SEARCH_VECTOR_DIMENSIONS,
  type CrmSearchRateCardArithmetic,
  type CrmSearchSchemaRole,
  type CrmSearchSurface
} from './contracts'
import {
  isCrmSearchProviderActionAllowed,
  resolveEffectiveCrmSearchMode,
  resolvePolicyStateMode
} from './policy'
import { calculateCrmSearchProviderReservation } from './usage'
import {
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  requireBoolean,
  requireEnum,
  requireOptionalUuid,
  requireSafeInteger,
  requireSchemaVersion,
  requireString,
  requireTimestamp,
  requireUuid,
  type CrmSearchTransactionWithoutRetry
} from './repository'

const invalidCode = 'crm_search_invalid_usage_reservation'
const budgetCode = 'crm_search_budget_exhausted'
const usageKinds = ['query', 'indexing'] as const
const providers = ['workers_ai', 'vectorize'] as const
const usageActions = ['query', ...CRM_SEARCH_PROVIDER_ACTIONS] as const
const reservationStates = ['reserved', 'released_no_call', 'charged', 'late_charged'] as const
const completions = ['completed', 'failed', 'abandoned', 'late_discarded', 'released_no_call'] as const

interface UsageReservationRow extends Record<string, unknown> {
  id: unknown
  organisation_scope_id: unknown
  client_id: unknown
  usage_kind: unknown
  correlation_id: unknown
  operation_id: unknown
  control_revision: unknown
  policy_revision: unknown
  rate_card_id: unknown
  rate_card_revision: unknown
  reserved_provider_calls: unknown
  reserved_model_input_tokens: unknown
  reserved_query_dimensions: unknown
  reserved_inserted_dimensions: unknown
  reserved_stored_dimensions: unknown
  reserved_usd_micros: unknown
  state: unknown
  provider_call_sent: unknown
  completion_class: unknown
}

export interface CrmSearchUsageReservation {
  id: string
  organisationScopeId: string
  clientId: string
  usageKind: typeof usageKinds[number]
  correlationId: string
  operationId: string | null
  controlRevision: number
  policyRevision: number
  rateCardId: string
  rateCardRevision: string
  reservedProviderCalls: number
  reservedModelInputTokens: number
  reservedQueryDimensions: number
  reservedInsertedDimensions: number
  reservedStoredDimensions: number
  reservedUsdMicros: number
  state: typeof reservationStates[number]
  providerCallSent: boolean | null
  completionClass: typeof completions[number] | null
}

export interface ReserveCrmSearchUsageInput {
  organisationScopeId: string
  clientId: string
  correlationId: string
  operationId: string | null
  usageKind: typeof usageKinds[number]
  provider: typeof providers[number]
  providerAction: typeof usageActions[number]
  surface: CrmSearchSurface | null
  schemaVersion: string | null
  teardownId: string | null
  reservationAt: string
  providerCalls: number
  modelInputTokens: number
  queryDimensions: number
  insertedDimensions: number
  storedDimensions: number
}

export interface UsageRepositoryDependencies {
  transactionWithoutRetry?: CrmSearchTransactionWithoutRetry
}

interface ValidatedReservationInput extends ReserveCrmSearchUsageInput {
  usageDate: string
}

interface PricedReservationInput extends ValidatedReservationInput {
  usdMicros: number
  rateCardRevision: string
}

const reservationInputKeys = new Set<keyof ReserveCrmSearchUsageInput>([
  'organisationScopeId', 'clientId', 'correlationId', 'operationId', 'usageKind',
  'provider', 'providerAction', 'surface', 'schemaVersion', 'teardownId',
  'reservationAt', 'providerCalls', 'modelInputTokens', 'queryDimensions',
  'insertedDimensions', 'storedDimensions'
])

function optionalSchemaVersion(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return requireSchemaVersion(value, invalidCode)
}

function validateReservationInput(input: ReserveCrmSearchUsageInput): ValidatedReservationInput {
  if (!input || typeof input !== 'object'
    || Object.keys(input).some(key => !reservationInputKeys.has(key as keyof ReserveCrmSearchUsageInput))
    || Object.keys(input).length !== reservationInputKeys.size) {
    throw crmSearchRepositoryError(invalidCode)
  }
  const validated: ValidatedReservationInput = {
    organisationScopeId: requireUuid(input.organisationScopeId, invalidCode),
    clientId: requireUuid(input.clientId, invalidCode),
    correlationId: requireUuid(input.correlationId, invalidCode),
    operationId: requireOptionalUuid(input.operationId, invalidCode),
    usageKind: requireEnum(input.usageKind, usageKinds, invalidCode),
    provider: requireEnum(input.provider, providers, invalidCode),
    providerAction: requireEnum(input.providerAction, usageActions, invalidCode),
    surface: input.surface === null ? null : requireEnum(input.surface, CRM_SEARCH_SURFACES, invalidCode),
    schemaVersion: optionalSchemaVersion(input.schemaVersion),
    teardownId: requireOptionalUuid(input.teardownId, invalidCode),
    reservationAt: requireTimestamp(input.reservationAt, invalidCode),
    providerCalls: requireSafeInteger(input.providerCalls, invalidCode, { minimum: 1, maximum: 1000 }),
    modelInputTokens: requireSafeInteger(input.modelInputTokens, invalidCode, { maximum: 512 }),
    queryDimensions: requireSafeInteger(input.queryDimensions, invalidCode),
    insertedDimensions: requireSafeInteger(input.insertedDimensions, invalidCode),
    storedDimensions: requireSafeInteger(input.storedDimensions, invalidCode),
    usageDate: input.reservationAt.slice(0, 10)
  }
  const queryShape = validated.usageKind === 'query'
    && validated.providerAction === 'query'
    && validated.surface !== null
    && validated.schemaVersion === null
    && validated.teardownId === null
    && validated.operationId === null
    && validated.insertedDimensions === 0
    && validated.storedDimensions === 0
  const indexingShape = validated.usageKind === 'indexing'
    && validated.provider === 'vectorize'
    && validated.providerAction !== 'query'
    && validated.surface === null
    && validated.schemaVersion !== null
    && validated.operationId !== null
    && validated.queryDimensions === 0
    && (validated.teardownId === null || validated.providerAction === 'delete')
  if (!queryShape && !indexingShape) throw crmSearchRepositoryError(invalidCode)

  if (validated.provider === 'workers_ai'
    && (!queryShape
      || validated.providerCalls !== 1
      || validated.modelInputTokens !== CRM_SEARCH_MAX_INPUT_TOKENS
      || validated.queryDimensions !== 0)) {
    throw crmSearchRepositoryError(invalidCode)
  }
  if (validated.provider === 'vectorize'
    && (validated.modelInputTokens !== 0
      || (validated.providerAction === 'delete' && validated.insertedDimensions !== 0))) {
    throw crmSearchRepositoryError(invalidCode)
  }
  return validated
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  return requireBoolean(value, invalidCode)
}

function mapReservation(row: UsageReservationRow): CrmSearchUsageReservation {
  return {
    id: requireUuid(row.id, invalidCode),
    organisationScopeId: requireUuid(row.organisation_scope_id, invalidCode),
    clientId: requireUuid(row.client_id, invalidCode),
    usageKind: requireEnum(row.usage_kind, usageKinds, invalidCode),
    correlationId: requireUuid(row.correlation_id, invalidCode),
    operationId: requireOptionalUuid(row.operation_id, invalidCode),
    controlRevision: requireSafeInteger(row.control_revision, invalidCode),
    policyRevision: requireSafeInteger(row.policy_revision, invalidCode),
    rateCardId: requireUuid(row.rate_card_id, invalidCode),
    rateCardRevision: requireString(row.rate_card_revision, invalidCode, {
      maximumLength: 120,
      pattern: /^[a-z0-9][a-z0-9._:-]{2,119}$/
    }),
    reservedProviderCalls: requireSafeInteger(row.reserved_provider_calls, invalidCode),
    reservedModelInputTokens: requireSafeInteger(row.reserved_model_input_tokens, invalidCode, { maximum: 512 }),
    reservedQueryDimensions: requireSafeInteger(row.reserved_query_dimensions, invalidCode),
    reservedInsertedDimensions: requireSafeInteger(row.reserved_inserted_dimensions, invalidCode),
    reservedStoredDimensions: requireSafeInteger(row.reserved_stored_dimensions, invalidCode),
    reservedUsdMicros: requireSafeInteger(row.reserved_usd_micros, invalidCode),
    state: requireEnum(row.state, reservationStates, invalidCode),
    providerCallSent: nullableBoolean(row.provider_call_sent),
    completionClass: row.completion_class === null
      ? null
      : requireEnum(row.completion_class, completions, invalidCode)
  }
}

function readAmount(row: Record<string, unknown>, key: string): number {
  return requireSafeInteger(row[key], invalidCode)
}

function checkedTokenCap(providerCalls: number): number {
  const result = BigInt(providerCalls) * BigInt(CRM_SEARCH_MAX_INPUT_TOKENS)
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw crmSearchRepositoryError(invalidCode)
  return Number(result)
}

function requireRate(value: unknown): number {
  if (typeof value === 'number') return requireSafeInteger(value, invalidCode)
  const raw = requireString(value, invalidCode, {
    maximumLength: 27,
    pattern: /^(?:0|[1-9][0-9]*)(?:\.0{1,6})?$/
  })
  const integer = raw.split('.')[0]!
  return requireSafeInteger(integer, invalidCode)
}

function requireSchemaRole(
  row: Record<string, unknown>,
  schemaVersion: string
): CrmSearchSchemaRole {
  const active = row.policy_active_schema_version === null
    ? null
    : requireSchemaVersion(row.policy_active_schema_version, invalidCode)
  const candidate = row.policy_candidate_schema_version === null
    ? null
    : requireSchemaVersion(row.policy_candidate_schema_version, invalidCode)
  if (!Array.isArray(row.policy_retiring_schema_versions)
    || !row.policy_retiring_schema_versions.every(value => typeof value === 'string')) {
    throw crmSearchRepositoryError(invalidCode)
  }
  const retiring = (row.policy_retiring_schema_versions as string[])
    .map(value => requireSchemaVersion(value, invalidCode))
  if (schemaVersion === active) return 'active'
  if (schemaVersion === candidate) return 'candidate'
  if (retiring.includes(schemaVersion)) return 'retiring'
  throw crmSearchRepositoryError(invalidCode)
}

function calculatePricedReservation(
  input: ValidatedReservationInput,
  row: Record<string, unknown>
): PricedReservationInput {
  const rateCard: CrmSearchRateCardArithmetic = {
    revision: requireString(row.rate_card_revision, invalidCode, {
      maximumLength: 120,
      pattern: /^[a-z0-9][a-z0-9._:-]{2,119}$/
    }),
    modelId: requireString(row.rate_card_model_id, invalidCode, { maximumLength: 240 }),
    validFrom: requireTimestamp(row.rate_card_valid_from, invalidCode),
    validUntil: requireTimestamp(row.rate_card_valid_until, invalidCode),
    revokedAt: row.rate_card_revoked_at === null
      ? null
      : requireTimestamp(row.rate_card_revoked_at, invalidCode),
    modelInputUsdMicrosPerMillionTokens: requireRate(
      row.model_input_usd_micros_per_million_tokens
    ),
    queriedDimensionUsdMicrosPerMillion: requireRate(
      row.queried_dimension_usd_micros_per_million
    ),
    insertedDimensionUsdMicrosPerMillion: requireRate(
      row.inserted_dimension_usd_micros_per_million
    ),
    storedDimensionUsdMicrosPerMillionMonth: requireRate(
      row.stored_dimension_usd_micros_per_million_month
    )
  }
  if (input.queryDimensions % CRM_SEARCH_VECTOR_DIMENSIONS !== 0
    || input.insertedDimensions % CRM_SEARCH_VECTOR_DIMENSIONS !== 0
    || input.storedDimensions % CRM_SEARCH_VECTOR_DIMENSIONS !== 0) {
    throw crmSearchRepositoryError(invalidCode)
  }
  try {
    const reservation = calculateCrmSearchProviderReservation({
      workersAiInvocations: input.provider === 'workers_ai' ? input.providerCalls : 0,
      vectorizeQueryCalls: input.provider === 'vectorize' && input.providerAction === 'query'
        ? input.providerCalls
        : 0,
      vectorizeMutationCalls: input.provider === 'vectorize' && input.providerAction !== 'query'
        ? input.providerCalls
        : 0,
      queryVectors: input.queryDimensions / CRM_SEARCH_VECTOR_DIMENSIONS,
      insertedVectors: input.insertedDimensions / CRM_SEARCH_VECTOR_DIMENSIONS,
      storedVectors: input.storedDimensions / CRM_SEARCH_VECTOR_DIMENSIONS,
      dimensions: CRM_SEARCH_VECTOR_DIMENSIONS,
      topK: 1,
      reservationAt: input.reservationAt,
      rateCard
    })
    if (reservation.providerCalls !== input.providerCalls
      || reservation.modelInputTokens !== input.modelInputTokens
      || reservation.queryDimensions !== input.queryDimensions
      || reservation.insertedDimensions !== input.insertedDimensions
      || reservation.storedDimensions !== input.storedDimensions) {
      throw crmSearchRepositoryError(invalidCode)
    }
    return {
      ...input,
      usdMicros: reservation.cost.totalUsdMicros,
      rateCardRevision: reservation.rateCardRevision
    }
  } catch {
    throw crmSearchRepositoryError(invalidCode)
  }
}

interface ReservationAuthority {
  input: PricedReservationInput
  controlRevision: number
  policyRevision: number
  rateCardId: string
  globalCaps: readonly number[]
  clientCaps: readonly number[]
}

function requireReservationAuthority(
  row: Record<string, unknown>,
  input: ValidatedReservationInput
): ReservationAuthority {
  const globalState = requireEnum(row.global_state, CRM_SEARCH_GLOBAL_STATES, invalidCode)
  const globalMaximum = requireEnum(row.global_maximum_mode, CRM_SEARCH_MODES, invalidCode)
  const indexingReady = requireBoolean(row.indexing_ready, invalidCode)
  const controlRevision = requireSafeInteger(row.control_revision, invalidCode)
  const rateCardId = requireUuid(row.rate_card_id, invalidCode)
  let policyRevision: number

  if (input.teardownId !== null) {
    if ((globalState !== 'enabled' && globalState !== 'delete_only')
      || (globalState === 'delete_only' && (globalMaximum !== 'off' || indexingReady))) {
      throw crmSearchRepositoryError(invalidCode)
    }
    policyRevision = requireSafeInteger(row.policy_revision, invalidCode)
    if (requireUuid(row.teardown_id, invalidCode) !== input.teardownId
      || !['deleting', 'provider_pending'].includes(String(row.teardown_state))
      || !['pending', 'partially_confirmed'].includes(String(row.provider_deletion_state))
      || row.operation_desired_action !== 'delete'
      || row.operation_schema_version !== input.schemaVersion) {
      throw crmSearchRepositoryError(invalidCode)
    }
  } else {
    if (globalState !== 'enabled') throw crmSearchRepositoryError(invalidCode)
    const policyState = requireEnum(row.policy_state, CRM_SEARCH_POLICY_STATES, invalidCode)
    const persistedMode = requireEnum(row.policy_effective_mode, CRM_SEARCH_MODES, invalidCode)
    const indexingEnabled = requireBoolean(row.policy_indexing_enabled, invalidCode)
    policyRevision = requireSafeInteger(row.policy_revision, invalidCode)
    if (persistedMode !== resolvePolicyStateMode(policyState) || !indexingEnabled) {
      throw crmSearchRepositoryError(invalidCode)
    }
    if (input.usageKind === 'query') {
      if (!indexingReady
        || row.schema_metadata_index_state !== 'ready'
        || row.schema_sentinel_state !== 'confirmed_absent'
        || resolveEffectiveCrmSearchMode({
          globalState,
          globalMaximum,
          policyMode: persistedMode,
          surface: input.surface,
          infrastructureReady: true
        }) === 'off') {
        throw crmSearchRepositoryError(invalidCode)
      }
    } else {
      const schemaVersion = input.schemaVersion!
      const schemaRole = requireSchemaRole(row, schemaVersion)
      const schemaReady = input.providerAction === 'delete'
        || (row.schema_metadata_index_state === 'ready'
          && row.schema_sentinel_state === 'confirmed_absent')
      if (!indexingReady
        || row.operation_desired_action !== input.providerAction
        || row.operation_schema_version !== schemaVersion
        || !schemaReady
        || !isCrmSearchProviderActionAllowed({
          globalState,
          policyState,
          action: input.providerAction,
          schemaRole,
          infrastructureReady: true,
          teardownAuthorized: false
        })) {
        throw crmSearchRepositoryError(invalidCode)
      }
    }
  }

  const cap = (key: string) => requireSafeInteger(row[key], invalidCode)
  const globalCaps = [cap('global_max_provider_calls'), cap('global_max_query_dimensions'),
    cap('global_max_inserted_dimensions'), cap('global_max_stored_dimensions'),
    cap('global_budget_usd_micros')]
  const clientCaps = [cap('client_max_provider_calls'), cap('client_max_query_dimensions'),
    cap('client_max_inserted_dimensions'), cap('client_max_stored_dimensions'),
    cap('client_budget_usd_micros')]
  return {
    input: calculatePricedReservation(input, row),
    controlRevision,
    policyRevision,
    rateCardId,
    globalCaps,
    clientCaps
  }
}

function proveDailyCapacity(row: Record<string, unknown>, input: PricedReservationInput): boolean {
  const additions = {
    provider_calls: input.providerCalls,
    model_input_tokens: input.modelInputTokens,
    query_dimensions: input.queryDimensions,
    inserted_dimensions: input.insertedDimensions,
    usd_micros: input.usdMicros
  }
  for (const [meter, addition] of Object.entries(additions)) {
    const reserved = readAmount(row, `reserved_${meter}`)
    const capKey = meter === 'usd_micros' ? 'cap_charged_usd_micros' : `cap_${meter}`
    const cap = readAmount(row, capKey)
    if (!Number.isSafeInteger(reserved + addition) || reserved + addition > cap) return false
  }
  const stored = readAmount(row, 'stored_dimension_high_watermark')
  const storedCap = readAmount(row, 'cap_stored_dimensions')
  return input.storedDimensions <= storedCap && stored <= storedCap
}

function dailyRowMatchesAuthority(
  row: Record<string, unknown>,
  scope: 'global' | 'client',
  clientId: string,
  caps: readonly number[],
  tokenCap: number,
  rateCardId: string
): boolean {
  const expectedClientId = scope === 'global' ? null : clientId
  try {
    return row.usage_scope === scope
      && row.client_id === expectedClientId
      && requireUuid(row.rate_card_id, invalidCode) === rateCardId
      && readAmount(row, 'cap_provider_calls') === caps[0]
      && readAmount(row, 'cap_model_input_tokens') === tokenCap
      && readAmount(row, 'cap_query_dimensions') === caps[1]
      && readAmount(row, 'cap_inserted_dimensions') === caps[2]
      && readAmount(row, 'cap_stored_dimensions') === caps[3]
      && readAmount(row, 'cap_charged_usd_micros') === caps[4]
  } catch {
    return false
  }
}

export async function reserveCrmSearchUsage(
  rawInput: ReserveCrmSearchUsageInput,
  dependencies: UsageRepositoryDependencies = {}
): Promise<CrmSearchUsageReservation> {
  const input = validateReservationInput(rawInput)
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  return run(async (transaction) => {
    await transaction.query(`
      SELECT pg_catalog.pg_advisory_xact_lock_shared(
        crm_search_client_advisory_lock_key($1, $2)
      )
    `, [input.organisationScopeId, input.clientId])

    const standardAuthoritySql = `
      SELECT
        control.state AS global_state,
        control.maximum_mode AS global_maximum_mode,
        control.indexing_ready,
        control.revision AS control_revision,
        policy.lifecycle_state AS policy_state,
        policy.effective_mode AS policy_effective_mode,
        policy.indexing_enabled AS policy_indexing_enabled,
        policy.revision AS policy_revision,
        policy.active_schema_version AS policy_active_schema_version,
        policy.candidate_schema_version AS policy_candidate_schema_version,
        policy.retiring_schema_versions AS policy_retiring_schema_versions,
        schema.metadata_index_state AS schema_metadata_index_state,
        schema.sentinel_state AS schema_sentinel_state,
        operation.desired_action AS operation_desired_action,
        operation.schema_version AS operation_schema_version,
        CASE WHEN $3 = 'query' THEN control.daily_query_budget_usd_micros
             ELSE control.daily_indexing_budget_usd_micros END AS global_budget_usd_micros,
        CASE WHEN $3 = 'query' THEN policy.daily_query_budget_usd_micros
             ELSE policy.daily_indexing_budget_usd_micros END AS client_budget_usd_micros,
        CASE WHEN $3 = 'query' THEN control.max_query_provider_calls
             ELSE control.max_indexing_provider_calls END AS global_max_provider_calls,
        CASE WHEN $3 = 'query' THEN policy.max_query_provider_calls
             ELSE policy.max_indexing_provider_calls END AS client_max_provider_calls,
        control.max_query_dimensions AS global_max_query_dimensions,
        policy.max_query_dimensions AS client_max_query_dimensions,
        control.max_inserted_dimensions AS global_max_inserted_dimensions,
        policy.max_inserted_dimensions AS client_max_inserted_dimensions,
        control.max_stored_dimensions AS global_max_stored_dimensions,
        policy.max_stored_dimensions AS client_max_stored_dimensions,
        rate_card.id AS rate_card_id,
        rate_card.revision AS rate_card_revision,
        rate_card.model_id AS rate_card_model_id,
        rate_card.model_input_usd_micros_per_million_tokens,
        rate_card.queried_dimension_usd_micros_per_million,
        rate_card.inserted_dimension_usd_micros_per_million,
        rate_card.stored_dimension_usd_micros_per_million_month,
        rate_card.valid_from AS rate_card_valid_from,
        rate_card.valid_until AS rate_card_valid_until,
        revocation.revoked_at AS rate_card_revoked_at
      FROM crm_search_global_control control
      JOIN crm_search_policies policy
        ON policy.organisation_scope_id = control.organisation_scope_id
       AND policy.client_id = $2
      JOIN crm_search_schema_versions schema
        ON schema.organisation_scope_id = control.organisation_scope_id
       AND schema.schema_version = CASE WHEN $3 = 'query'
         THEN policy.active_schema_version ELSE $6 END
      ${input.usageKind === 'indexing' ? 'JOIN' : 'LEFT JOIN'} crm_search_operations operation
        ON operation.id = $5
       AND operation.organisation_scope_id = control.organisation_scope_id
       AND operation.client_id = policy.client_id
      JOIN crm_search_rate_cards rate_card
        ON rate_card.id = policy.rate_card_id
       AND rate_card.id = control.rate_card_id
       AND rate_card.organisation_scope_id = control.organisation_scope_id
      LEFT JOIN crm_search_rate_card_revocations revocation
        ON revocation.rate_card_id = rate_card.id
      WHERE control.organisation_scope_id = $1
        AND rate_card.valid_from <= $4::TIMESTAMPTZ
        AND rate_card.valid_until > $4::TIMESTAMPTZ
      FOR SHARE OF control, policy, schema, rate_card${input.usageKind === 'indexing' ? ', operation' : ''}
    `
    const teardownAuthoritySql = `
      SELECT
        control.state AS global_state,
        control.maximum_mode AS global_maximum_mode,
        control.indexing_ready,
        control.revision AS control_revision,
        NULL::TEXT AS policy_state,
        NULL::TEXT AS policy_effective_mode,
        NULL::BOOLEAN AS policy_indexing_enabled,
        teardown.policy_revision,
        NULL::TEXT AS policy_active_schema_version,
        NULL::TEXT AS policy_candidate_schema_version,
        ARRAY[]::TEXT[] AS policy_retiring_schema_versions,
        NULL::TEXT AS schema_metadata_index_state,
        NULL::TEXT AS schema_sentinel_state,
        teardown.id AS teardown_id,
        teardown.state AS teardown_state,
        teardown.provider_deletion_state,
        operation.desired_action AS operation_desired_action,
        operation.schema_version AS operation_schema_version,
        control.daily_indexing_budget_usd_micros AS global_budget_usd_micros,
        control.daily_indexing_budget_usd_micros AS client_budget_usd_micros,
        control.max_indexing_provider_calls AS global_max_provider_calls,
        control.max_indexing_provider_calls AS client_max_provider_calls,
        control.max_query_dimensions AS global_max_query_dimensions,
        control.max_query_dimensions AS client_max_query_dimensions,
        control.max_inserted_dimensions AS global_max_inserted_dimensions,
        control.max_inserted_dimensions AS client_max_inserted_dimensions,
        control.max_stored_dimensions AS global_max_stored_dimensions,
        control.max_stored_dimensions AS client_max_stored_dimensions,
        rate_card.id AS rate_card_id,
        rate_card.revision AS rate_card_revision,
        rate_card.model_id AS rate_card_model_id,
        rate_card.model_input_usd_micros_per_million_tokens,
        rate_card.queried_dimension_usd_micros_per_million,
        rate_card.inserted_dimension_usd_micros_per_million,
        rate_card.stored_dimension_usd_micros_per_million_month,
        rate_card.valid_from AS rate_card_valid_from,
        rate_card.valid_until AS rate_card_valid_until,
        revocation.revoked_at AS rate_card_revoked_at
      FROM crm_search_global_control control
      JOIN crm_search_client_teardowns teardown
        ON teardown.id = $7
       AND teardown.organisation_scope_id = control.organisation_scope_id
       AND teardown.client_id = $2
      JOIN crm_search_operations operation
        ON operation.id = $5
       AND operation.organisation_scope_id = control.organisation_scope_id
       AND operation.client_id = teardown.client_id
       AND operation.schema_version = $6
      JOIN crm_search_teardown_vectors vector
        ON vector.teardown_id = teardown.id
       AND vector.vector_id = operation.vector_id
       AND vector.schema_version = operation.schema_version
       AND vector.deletion_state IN ('pending', 'provider_pending', 'failed')
      JOIN crm_search_rate_cards rate_card
        ON rate_card.id = control.rate_card_id
       AND rate_card.organisation_scope_id = control.organisation_scope_id
      LEFT JOIN crm_search_rate_card_revocations revocation
        ON revocation.rate_card_id = rate_card.id
      WHERE control.organisation_scope_id = $1
        AND rate_card.valid_from <= $4::TIMESTAMPTZ
        AND rate_card.valid_until > $4::TIMESTAMPTZ
      FOR SHARE OF control, teardown, operation, vector, rate_card
    `
    const authorityParameters = [input.organisationScopeId, input.clientId, input.usageKind,
      input.reservationAt, input.operationId, input.schemaVersion]
    if (input.teardownId !== null) authorityParameters.push(input.teardownId)
    const authority = firstRow(await transaction.query(
      input.teardownId === null ? standardAuthoritySql : teardownAuthoritySql,
      authorityParameters
    ))
    if (!authority) throw crmSearchRepositoryError(invalidCode)
    const proven = requireReservationAuthority(authority, input)
    const pricedInput = proven.input
    const { controlRevision, policyRevision, rateCardId, globalCaps, clientCaps } = proven
    const globalTokenCap = checkedTokenCap(globalCaps[0]!)
    const clientTokenCap = checkedTokenCap(clientCaps[0]!)

    await transaction.query(`
      INSERT INTO crm_search_usage_daily (
        usage_date, organisation_scope_id, usage_scope, client_id, usage_kind,
        cap_provider_calls, cap_model_input_tokens, cap_query_dimensions,
        cap_inserted_dimensions, cap_stored_dimensions, cap_charged_usd_micros, rate_card_id
      ) VALUES
        ($1, $2, 'global', NULL, $3, $4, $5, $6, $7, $8, $9, $10),
        ($1, $2, 'client', $11, $3, $12, $13, $14, $15, $16, $17, $10)
      ON CONFLICT DO NOTHING
    `, [input.usageDate, input.organisationScopeId, input.usageKind,
      globalCaps[0], globalTokenCap, globalCaps[1], globalCaps[2], globalCaps[3], globalCaps[4],
      rateCardId, input.clientId,
      clientCaps[0], clientTokenCap, clientCaps[1], clientCaps[2], clientCaps[3], clientCaps[4]])

    const dailyRows = (await transaction.query(`
      SELECT * FROM crm_search_usage_daily
      WHERE usage_date = $1 AND organisation_scope_id = $2 AND usage_kind = $3
        AND ((usage_scope = 'global' AND client_id IS NULL)
          OR (usage_scope = 'client' AND client_id = $4))
      ORDER BY CASE usage_scope WHEN 'global' THEN 0 ELSE 1 END
      FOR UPDATE
    `, [input.usageDate, input.organisationScopeId, input.usageKind, input.clientId])).rows
    if (dailyRows.length !== 2
      || !dailyRowMatchesAuthority(
        dailyRows[0]!, 'global', input.clientId, globalCaps, globalTokenCap, rateCardId
      )
      || !dailyRowMatchesAuthority(
        dailyRows[1]!, 'client', input.clientId, clientCaps, clientTokenCap, rateCardId
      )
      || !dailyRows.every(row => proveDailyCapacity(row, pricedInput))) {
      throw crmSearchRepositoryError(budgetCode)
    }

    await transaction.query(`
      UPDATE crm_search_usage_daily
      SET reserved_provider_calls = reserved_provider_calls + $1,
          reserved_model_input_tokens = reserved_model_input_tokens + $2,
          reserved_query_dimensions = reserved_query_dimensions + $3,
          reserved_inserted_dimensions = reserved_inserted_dimensions + $4,
          stored_dimension_high_watermark = GREATEST(stored_dimension_high_watermark, $5),
          reserved_usd_micros = reserved_usd_micros + $6,
          updated_at = NOW()
      WHERE id = ANY($7::UUID[])
    `, [pricedInput.providerCalls, pricedInput.modelInputTokens, pricedInput.queryDimensions,
      pricedInput.insertedDimensions, pricedInput.storedDimensions, pricedInput.usdMicros,
      dailyRows.map(row => requireUuid(row.id, invalidCode))])

    const stored = firstRow<UsageReservationRow>(await transaction.query<UsageReservationRow>(`
      INSERT INTO crm_search_usage_reservations (
        organisation_scope_id, client_id, usage_kind, correlation_id, operation_id,
        control_revision, policy_revision, rate_card_id, rate_card_revision, reserved_provider_calls,
        reserved_model_input_tokens, reserved_query_dimensions, reserved_inserted_dimensions,
        reserved_stored_dimensions, reserved_usd_micros, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [input.organisationScopeId, input.clientId, input.usageKind, input.correlationId,
      input.operationId, controlRevision, policyRevision, rateCardId, pricedInput.rateCardRevision,
      pricedInput.providerCalls, pricedInput.modelInputTokens, pricedInput.queryDimensions,
      pricedInput.insertedDimensions, pricedInput.storedDimensions, pricedInput.usdMicros,
      input.reservationAt]))
    if (!stored) throw crmSearchRepositoryError(invalidCode)
    return mapReservation(stored)
  })
}

export interface SettleCrmSearchUsageInput {
  reservationId: string
  providerCallSent: boolean
  completion: typeof completions[number]
}

export async function settleCrmSearchUsage(
  input: SettleCrmSearchUsageInput,
  dependencies: UsageRepositoryDependencies = {}
): Promise<CrmSearchUsageReservation> {
  const reservationId = requireUuid(input.reservationId, invalidCode)
  if (typeof input.providerCallSent !== 'boolean') throw crmSearchRepositoryError(invalidCode)
  const completion = requireEnum(input.completion, completions, invalidCode)
  if ((completion === 'released_no_call') !== !input.providerCallSent) {
    throw crmSearchRepositoryError(invalidCode)
  }
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  return run(async (transaction) => {
    const locked = firstRow<UsageReservationRow>(await transaction.query<UsageReservationRow>(`
      SELECT * FROM crm_search_usage_reservations
      WHERE id = $1
      FOR UPDATE
    `, [reservationId]))
    if (!locked) throw crmSearchRepositoryError(invalidCode)
    const reservation = mapReservation(locked)
    if (reservation.state !== 'reserved') return reservation

    if (input.providerCallSent) {
      const dailyUpdate = await transaction.query(`
        UPDATE crm_search_usage_daily daily
        SET charged_provider_calls = charged_provider_calls + $1,
            charged_model_input_tokens = charged_model_input_tokens + $2,
            charged_query_dimensions = charged_query_dimensions + $3,
            charged_inserted_dimensions = charged_inserted_dimensions + $4,
            charged_usd_micros = charged_usd_micros + $5,
            late_billed_completions = late_billed_completions
              + CASE WHEN $6 = 'late_discarded' THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE usage_date = (SELECT created_at::DATE FROM crm_search_usage_reservations WHERE id = $7)
          AND organisation_scope_id = $8 AND usage_kind = $9
          AND (usage_scope = 'global' OR client_id = $10)
      `, [reservation.reservedProviderCalls, reservation.reservedModelInputTokens,
        reservation.reservedQueryDimensions, reservation.reservedInsertedDimensions,
        reservation.reservedUsdMicros, completion, reservationId,
        reservation.organisationScopeId, reservation.usageKind, reservation.clientId])
      if (dailyUpdate.rowCount !== 2) {
        throw crmSearchRepositoryError('crm_search_usage_settlement_conflict')
      }
    } else {
      const dailyUpdate = await transaction.query(`
        UPDATE crm_search_usage_daily daily
        SET reserved_provider_calls = reserved_provider_calls - $1,
            reserved_model_input_tokens = reserved_model_input_tokens - $2,
            reserved_query_dimensions = reserved_query_dimensions - $3,
            reserved_inserted_dimensions = reserved_inserted_dimensions - $4,
            reserved_usd_micros = reserved_usd_micros - $5,
            updated_at = NOW()
        WHERE usage_date = (SELECT created_at::DATE FROM crm_search_usage_reservations WHERE id = $6)
          AND organisation_scope_id = $7 AND usage_kind = $8
          AND (usage_scope = 'global' OR client_id = $9)
      `, [reservation.reservedProviderCalls, reservation.reservedModelInputTokens,
        reservation.reservedQueryDimensions, reservation.reservedInsertedDimensions,
        reservation.reservedUsdMicros, reservationId, reservation.organisationScopeId,
        reservation.usageKind, reservation.clientId])
      if (dailyUpdate.rowCount !== 2) {
        throw crmSearchRepositoryError('crm_search_usage_settlement_conflict')
      }
    }

    const state = !input.providerCallSent
      ? 'released_no_call'
      : completion === 'late_discarded'
        ? 'late_charged'
        : 'charged'
    const settledRow = firstRow<UsageReservationRow>(await transaction.query<UsageReservationRow>(`
      UPDATE crm_search_usage_reservations
      SET state = $2, provider_call_sent = $3, completion_class = $4,
          settled_at = NOW()
      WHERE id = $1 AND state = 'reserved'
      RETURNING *
    `, [reservationId, state, input.providerCallSent, completion]))
    if (!settledRow) throw crmSearchRepositoryError('crm_search_usage_settlement_conflict')
    return mapReservation(settledRow)
  })
}
