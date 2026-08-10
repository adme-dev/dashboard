import {
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  requireSafeInteger,
  requireUuid
} from './repository'
import type { CrmSearchMalformedDeadLetterRecord } from '~~/shared/crmSearchIndexProtocol'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const classPattern = /^[a-z][a-z0-9_]{1,119}$/
const origins = ['cloudflare_transport', 'provider_confirmation'] as const
const actions = ['transport_retry', 'confirmation_reconcile'] as const

export type CrmSearchDeadLetterOrigin = typeof origins[number]
export type CrmSearchDeadLetterRecoveryAction = typeof actions[number]

export interface RecordCrmSearchDeadLetterInput {
  operationId: string
  correlationId: string
  origin: CrmSearchDeadLetterOrigin
  attempts: number
  errorClass: string
}

export interface RecordCrmSearchDeadLetterDependencies {
  persist(input: RecordCrmSearchDeadLetterInput): Promise<{
    id: string
    duplicate: boolean
  }>
}

export interface RequestCrmSearchDeadLetterRecoveryInput {
  deadLetterId: string
  expectedOrigin: CrmSearchDeadLetterOrigin
  action: CrmSearchDeadLetterRecoveryAction
  actorId: string
  reason: string
}

interface DeadLetterRecoveryRow {
  id: string
  operationId: string
  origin: CrmSearchDeadLetterOrigin
  resolutionState: string
}

export interface RequestCrmSearchDeadLetterRecoveryDependencies {
  loadForUpdate(input: {
    deadLetterId: string
    expectedOrigin: CrmSearchDeadLetterOrigin
  }): Promise<DeadLetterRecoveryRow | null>
  transitionRecovery(input: RequestCrmSearchDeadLetterRecoveryInput & {
    operationId: string
    origin: CrmSearchDeadLetterOrigin
  }): Promise<'transport_retry_requested' | 'confirmation_reconcile_requested'>
}

function fail(code: string): never {
  throw new Error(code)
}

function validReason(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length >= 10
    && value.trim().length <= 2000
    && !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return (codePoint <= 8) || codePoint === 11 || codePoint === 12
        || (codePoint >= 14 && codePoint <= 31) || codePoint === 127
    })
}

export async function recordCrmSearchDeadLetter(
  input: RecordCrmSearchDeadLetterInput,
  dependencies: RecordCrmSearchDeadLetterDependencies
): Promise<{ status: 'recorded' }> {
  if (!input || !uuidPattern.test(input.operationId) || !uuidPattern.test(input.correlationId)
    || !origins.includes(input.origin)
    || !Number.isSafeInteger(input.attempts) || input.attempts < 1 || input.attempts > 1000
    || !classPattern.test(input.errorClass)) fail('crm_search_invalid_dead_letter')
  const result = await dependencies.persist({
    operationId: input.operationId,
    correlationId: input.correlationId,
    origin: input.origin,
    attempts: input.attempts,
    errorClass: input.errorClass
  })
  if (!result || !uuidPattern.test(result.id) || typeof result.duplicate !== 'boolean') {
    fail('crm_search_invalid_dead_letter')
  }
  return { status: 'recorded' }
}

export async function requestCrmSearchDeadLetterRecovery(
  input: RequestCrmSearchDeadLetterRecoveryInput,
  dependencies: RequestCrmSearchDeadLetterRecoveryDependencies
): Promise<{ status: 'transport_retry_requested' | 'confirmation_reconcile_requested' }> {
  if (!input || !uuidPattern.test(input.deadLetterId) || !uuidPattern.test(input.actorId)
    || !origins.includes(input.expectedOrigin) || !actions.includes(input.action)
    || !validReason(input.reason)) fail('crm_search_invalid_dead_letter_recovery')
  const row = await dependencies.loadForUpdate({
    deadLetterId: input.deadLetterId,
    expectedOrigin: input.expectedOrigin
  })
  if (!row || row.id !== input.deadLetterId || !uuidPattern.test(row.operationId)
    || row.origin !== input.expectedOrigin || row.resolutionState !== 'open') {
    fail('crm_search_dead_letter_changed')
  }
  const requiredAction = row.origin === 'cloudflare_transport'
    ? 'transport_retry'
    : 'confirmation_reconcile'
  if (input.action !== requiredAction) fail('crm_search_dead_letter_action_mismatch')
  const status = await dependencies.transitionRecovery({
    ...input,
    operationId: row.operationId,
    origin: row.origin,
    reason: input.reason.trim()
  })
  const expectedStatus = row.origin === 'cloudflare_transport'
    ? 'transport_retry_requested'
    : 'confirmation_reconcile_requested'
  if (status !== expectedStatus) fail('crm_search_dead_letter_changed')
  return { status }
}

export interface CrmSearchDeadLetterRequestInput {
  operationId: string
  correlationId: string
  protocolVersion: 1
}

export async function reserveCrmSearchDeadLetterRequest(
  input: CrmSearchDeadLetterRequestInput,
  dependencies: { queryOneFresh?: typeof crmSearchRepositoryDependencies.queryOneFresh } = {}
): Promise<
  | { status: 'reserved' }
  | { status: 'in_progress' }
  | { status: 'replay', outcome: { status: 'recorded' } }
> {
  const operationId = requireUuid(input.operationId, 'crm_search_invalid_dead_letter')
  requireUuid(input.correlationId, 'crm_search_invalid_dead_letter')
  if (input.protocolVersion !== 1) fail('crm_search_invalid_dead_letter')
  const read = dependencies.queryOneFresh ?? crmSearchRepositoryDependencies.queryOneFresh
  const row = await read(`
    SELECT operation.id, dead_letter.origin
    FROM crm_search_operations operation
    LEFT JOIN crm_search_dead_letters dead_letter ON dead_letter.operation_id = operation.id
    WHERE operation.id = $1
  `, [operationId])
  if (!row) return { status: 'in_progress' }
  if (row.origin === 'cloudflare_transport') {
    return { status: 'replay', outcome: { status: 'recorded' } }
  }
  return row.origin === null ? { status: 'reserved' } : { status: 'in_progress' }
}

export async function recordCrmSearchTransportDeadLetter(
  input: CrmSearchDeadLetterRequestInput
): Promise<{ status: 'recorded' }> {
  const operationId = requireUuid(input.operationId, 'crm_search_invalid_dead_letter')
  const correlationId = requireUuid(input.correlationId, 'crm_search_invalid_dead_letter')
  if (input.protocolVersion !== 1) fail('crm_search_invalid_dead_letter')
  return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
    const operation = firstRow(await transaction.query(`
      SELECT organisation_scope_id, client_id, transport_attempt_count, error_class
      FROM crm_search_operations
      WHERE id = $1
      FOR UPDATE
    `, [operationId]))
    if (!operation) throw crmSearchRepositoryError('crm_search_invalid_dead_letter')
    const attempts = Math.max(1, requireSafeInteger(
      operation.transport_attempt_count,
      'crm_search_invalid_dead_letter',
      { maximum: 1000 }
    ))
    const rawErrorClass = typeof operation.error_class === 'string'
      && classPattern.test(operation.error_class)
      ? operation.error_class
      : 'transport_exhausted'
    return recordCrmSearchDeadLetter({
      operationId,
      correlationId,
      origin: 'cloudflare_transport',
      attempts,
      errorClass: rawErrorClass
    }, {
      async persist(deadLetter) {
        const row = firstRow(await transaction.query(`
          INSERT INTO crm_search_dead_letters (
            organisation_scope_id, client_id, operation_id, origin,
            attempts, error_class, first_failed_at, last_failed_at
          ) VALUES ($1, $2, $3, 'cloudflare_transport', $4, $5, NOW(), NOW())
          ON CONFLICT (operation_id) DO UPDATE
          SET attempts = GREATEST(crm_search_dead_letters.attempts, EXCLUDED.attempts),
              last_failed_at = NOW(), error_class = EXCLUDED.error_class,
              updated_at = NOW()
          WHERE crm_search_dead_letters.origin = 'cloudflare_transport'
          RETURNING id, (xmax <> 0) AS duplicate
        `, [requireUuid(operation.organisation_scope_id, 'crm_search_invalid_dead_letter'),
          requireUuid(operation.client_id, 'crm_search_invalid_dead_letter'),
          deadLetter.operationId, deadLetter.attempts, deadLetter.errorClass]))
        if (!row) throw crmSearchRepositoryError('crm_search_dead_letter_origin_conflict')
        return {
          id: requireUuid(row.id, 'crm_search_invalid_dead_letter'),
          duplicate: row.duplicate === true
        }
      }
    })
  })
}

export async function recordCrmSearchMalformedTransportDeadLetter(
  input: CrmSearchMalformedDeadLetterRecord
): Promise<{ status: 'recorded' | 'duplicate' }> {
  if (!input || input.protocolVersion !== 1 || input.queue !== 'dead_letter'
    || !/^sha256:[a-f0-9]{64}$/.test(input.queueMessageIdDigest)
    || !Number.isSafeInteger(input.attempts) || input.attempts < 1 || input.attempts > 1000
    || typeof input.receivedAt !== 'string' || !Number.isFinite(Date.parse(input.receivedAt))
    || new Date(Date.parse(input.receivedAt)).toISOString() !== input.receivedAt) {
    fail('crm_search_invalid_dead_letter')
  }
  return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
    const row = firstRow(await transaction.query(`
      INSERT INTO crm_search_malformed_transport_dead_letters (
        queue_message_id_digest, protocol_version, queue_name,
        attempts, first_received_at, last_received_at, retention_expires_at
      ) VALUES ($1, 1, 'dead_letter', $2, $3, $3,
        $3::TIMESTAMPTZ + INTERVAL '2 years')
      ON CONFLICT (queue_message_id_digest) DO UPDATE
      SET attempts = GREATEST(
            crm_search_malformed_transport_dead_letters.attempts,
            EXCLUDED.attempts
          ),
          last_received_at = GREATEST(
            crm_search_malformed_transport_dead_letters.last_received_at,
            EXCLUDED.last_received_at
          ),
          updated_at = NOW()
      RETURNING (xmax <> 0) AS duplicate
    `, [input.queueMessageIdDigest, input.attempts, input.receivedAt]))
    if (!row || typeof row.duplicate !== 'boolean') {
      throw crmSearchRepositoryError('crm_search_invalid_dead_letter')
    }
    return { status: row.duplicate ? 'duplicate' : 'recorded' }
  })
}
