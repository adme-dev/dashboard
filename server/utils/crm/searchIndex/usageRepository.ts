import {
  CRM_SEARCH_MAX_INPUT_TOKENS,
  CRM_SEARCH_MODEL_ID
} from './contracts'
import {
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  requireBoolean,
  requireEnum,
  requireOptionalUuid,
  requireSafeInteger,
  requireString,
  requireTimestamp,
  requireUuid,
  type CrmSearchTransactionWithoutRetry
} from './repository'

const invalidCode = 'crm_search_invalid_usage_reservation'
const budgetCode = 'crm_search_budget_exhausted'
const usageKinds = ['query', 'indexing'] as const
const providers = ['workers_ai', 'vectorize'] as const
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
  reservationAt: string
  providerCalls: number
  modelInputTokens: number
  queryDimensions: number
  insertedDimensions: number
  storedDimensions: number
  usdMicros: number
  rateCardRevision: string
}

export interface UsageRepositoryDependencies {
  transactionWithoutRetry?: CrmSearchTransactionWithoutRetry
}

interface ValidatedReservationInput extends ReserveCrmSearchUsageInput {
  usageDate: string
}

function validateReservationInput(input: ReserveCrmSearchUsageInput): ValidatedReservationInput {
  const validated: ValidatedReservationInput = {
    organisationScopeId: requireUuid(input.organisationScopeId, invalidCode),
    clientId: requireUuid(input.clientId, invalidCode),
    correlationId: requireUuid(input.correlationId, invalidCode),
    operationId: requireOptionalUuid(input.operationId, invalidCode),
    usageKind: requireEnum(input.usageKind, usageKinds, invalidCode),
    provider: requireEnum(input.provider, providers, invalidCode),
    reservationAt: requireTimestamp(input.reservationAt, invalidCode),
    providerCalls: requireSafeInteger(input.providerCalls, invalidCode, { minimum: 1, maximum: 1000 }),
    modelInputTokens: requireSafeInteger(input.modelInputTokens, invalidCode, { maximum: 512 }),
    queryDimensions: requireSafeInteger(input.queryDimensions, invalidCode),
    insertedDimensions: requireSafeInteger(input.insertedDimensions, invalidCode),
    storedDimensions: requireSafeInteger(input.storedDimensions, invalidCode),
    usdMicros: requireSafeInteger(input.usdMicros, invalidCode),
    rateCardRevision: requireString(input.rateCardRevision, invalidCode, {
      maximumLength: 120,
      pattern: /^[a-z0-9][a-z0-9._:-]{2,119}$/
    }),
    usageDate: input.reservationAt.slice(0, 10)
  }
  if (validated.provider === 'workers_ai'
    && (validated.providerCalls !== 1
      || validated.modelInputTokens !== CRM_SEARCH_MAX_INPUT_TOKENS)) {
    throw crmSearchRepositoryError(invalidCode)
  }
  if (validated.provider === 'vectorize' && validated.modelInputTokens !== 0) {
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

function proveDailyCapacity(row: Record<string, unknown>, input: ValidatedReservationInput): boolean {
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
    const authority = firstRow(await transaction.query(`
      SELECT
        control.state AS global_state,
        control.indexing_ready,
        control.revision AS control_revision,
        policy.lifecycle_state AS policy_state,
        policy.revision AS policy_revision,
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
        rate_card.valid_from AS rate_card_valid_from,
        rate_card.valid_until AS rate_card_valid_until,
        revocation.revoked_at AS rate_card_revoked_at
      FROM crm_search_global_control control
      JOIN crm_search_policies policy
        ON policy.organisation_scope_id = control.organisation_scope_id
       AND policy.client_id = $2
      JOIN crm_search_rate_cards rate_card
        ON rate_card.id = policy.rate_card_id AND rate_card.id = control.rate_card_id
      LEFT JOIN crm_search_rate_card_revocations revocation
        ON revocation.rate_card_id = rate_card.id
      WHERE control.organisation_scope_id = $1
        AND rate_card.valid_from <= $4::TIMESTAMPTZ
        AND rate_card.valid_until > $4::TIMESTAMPTZ
      FOR SHARE OF control, policy, rate_card
    `, [input.organisationScopeId, input.clientId, input.usageKind, input.reservationAt]))
    if (!authority) throw crmSearchRepositoryError(invalidCode)
    const controlRevision = requireSafeInteger(authority.control_revision, invalidCode)
    const policyRevision = requireSafeInteger(authority.policy_revision, invalidCode)
    const rateCardId = requireUuid(authority.rate_card_id, invalidCode)
    const validFrom = requireTimestamp(authority.rate_card_valid_from, invalidCode)
    const validUntil = requireTimestamp(authority.rate_card_valid_until, invalidCode)
    const authorityValid = authority.global_state === 'enabled'
      && authority.indexing_ready === true
      && ['indexing', 'shadow', 'assist'].includes(String(authority.policy_state))
      && authority.rate_card_revision === input.rateCardRevision
      && authority.rate_card_model_id === CRM_SEARCH_MODEL_ID
      && authority.rate_card_revoked_at === null
      && input.reservationAt >= validFrom
      && input.reservationAt < validUntil
    if (!authorityValid) throw crmSearchRepositoryError(invalidCode)

    const cap = (key: string) => requireSafeInteger(authority[key], invalidCode)
    const globalCaps = [cap('global_max_provider_calls'), cap('global_max_query_dimensions'),
      cap('global_max_inserted_dimensions'), cap('global_max_stored_dimensions'),
      cap('global_budget_usd_micros')]
    const clientCaps = [cap('client_max_provider_calls'), cap('client_max_query_dimensions'),
      cap('client_max_inserted_dimensions'), cap('client_max_stored_dimensions'),
      cap('client_budget_usd_micros')]
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
      || !dailyRows.every(row => proveDailyCapacity(row, input))) {
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
    `, [input.providerCalls, input.modelInputTokens, input.queryDimensions,
      input.insertedDimensions, input.storedDimensions, input.usdMicros,
      dailyRows.map(row => requireUuid(row.id, invalidCode))])

    const stored = firstRow<UsageReservationRow>(await transaction.query<UsageReservationRow>(`
      INSERT INTO crm_search_usage_reservations (
        organisation_scope_id, client_id, usage_kind, correlation_id, operation_id,
        control_revision, policy_revision, rate_card_id, reserved_provider_calls,
        reserved_model_input_tokens, reserved_query_dimensions, reserved_inserted_dimensions,
        reserved_stored_dimensions, reserved_usd_micros, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [input.organisationScopeId, input.clientId, input.usageKind, input.correlationId,
      input.operationId, controlRevision, policyRevision, rateCardId, input.providerCalls,
      input.modelInputTokens, input.queryDimensions, input.insertedDimensions,
      input.storedDimensions, input.usdMicros, input.reservationAt]))
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
